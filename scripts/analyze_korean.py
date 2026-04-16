#!/usr/bin/env python3
"""
Korean text morpheme analyzer — context-aware sentiment edition.
입력: newline-separated text (한 줄 = CSV 1행)
출력: {"words": [...], "associations": [...]}

감성 분석 전략 (3단계 우선순위):
  1. Transformers (snunlp/KR-FinBert-SC) — 설치돼 있으면 문장 단위 딥러닝 분류
  2. 부정어 패턴 감지 — "좋지 않다" / "안 좋다" → 감성 반전
  3. 문장 방향 힌트 — 중립 단어에 소속 문장의 전체 감성 방향을 약한 신호로 주입
  최종 감성: 다중 출현 시 다수결(가중 투표)로 결정
"""

from __future__ import annotations
import sys
import os
import json
import re
import itertools
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sentiment_lexicon import get_sentiment  # type: ignore

# ── 불용어 ───────────────────────────────────────────────────────────────────
STOPWORDS = {
    '이것', '그것', '저것', '이런', '그런', '저런', '이번', '그번',
    '여기', '거기', '저기', '이제', '지금', '그때', '어디', '누구',
    '무엇', '어떤', '얼마', '이후', '이전', '이상', '이하', '이외', '이내',
    '때문', '경우', '관련', '통해', '위해', '대한', '대해', '가지',
    '정도', '부분', '내용', '문제', '사항', '기준', '방식', '활동',
    '사용', '진행',
    '하다', '되다', '있다', '없다', '같다', '않다', '못하다',
    '싶다', '보다', '오다', '가다', '주다', '받다', '들다', '나다',
    '많다', '크다', '작다',
}

EN_STOPWORDS = {
    'the', 'and', 'for', 'but', 'not', 'are', 'was', 'were', 'has', 'had',
    'have', 'can', 'will', 'may', 'all', 'one', 'two', 'its', 'our', 'you',
    'his', 'her', 'who', 'how', 'yes', 'per', 'via', 'etc', 'due', 'ago',
    'any', 'few', 'new', 'old', 'own', 'way', 'get', 'got', 'put', 'set',
    'use', 'ask', 'say', 'did', 'now', 'see', 'out', 'off', 'day', 'let',
    'him', 'big', 'end', 'too', 'try', 'add', 'yet', 'nor', 'such', 'than',
    'that', 'this', 'with', 'from', 'they', 'been', 'also', 'when', 'then',
    'each', 'more', 'into', 'over', 'just', 'only', 'even', 'very', 'some',
    'what', 'your', 'does', 'both', 'most', 'make', 'like', 'long', 'high',
    'said', 'here', 'well', 'much', 'come', 'take', 'know', 'back', 'down',
    'these', 'other', 'after', 'about', 'there', 'their', 'where', 'while',
    'those', 'would', 'could', 'which', 'since', 'every',
}

MIN_LEN    = 2
MIN_SL_LEN = 3

# ── 조사 strip (폴백용) ───────────────────────────────────────────────────────
_PARTICLES = sorted([
    '에서는', '에서도', '에게서', '로부터', '이라는', '이라고', '이라서',
    '으로서', '으로써', '라는', '라고', '라서', '라도', '라면',
    '에서', '에게', '까지', '부터', '이라', '이고', '이며', '이나',
    '이든', '이면', '이랑', '으로', '랑', '과', '와', '로',
    '에다', '에', '를', '을', '이', '가', '은', '는', '도', '만', '의',
], key=len, reverse=True)

def _strip_particles(word: str) -> str:
    for p in _PARTICLES:
        if word.endswith(p) and len(word) - len(p) >= MIN_LEN:
            return word[: len(word) - len(p)]
    return word

def _is_ascii(s: str) -> bool:
    return all(ord(c) < 128 for c in s)

# ── 용언 어미 strip (오분류 NNG 필터) ─────────────────────────────────────────
# Kiwi가 비표준 텍스트에서 용언을 NNG로 오분류할 때 어미를 제거해 어근 + '다' 형태로
# 변환하고, 그 형태가 STOPWORDS에 있으면 결과에서 제외한다.
_VERB_ENDINGS = sorted([
    '겠습니다', '겠습니까', '겠어요', '겠지요',
    '습니다', '습니까',
    '았어요', '었어요', '았어', '었어',
    '아요', '어요',
    '으면서', '으면', '으니까', '으니', '으려', '으러', '으므로',
    '지만', '지만요',
    '아서', '어서',
    '아도', '어도',
    '아야', '어야',
    '면서', '지요', '네요',
    '을까요', '을까',
    '는다', 'ㄴ다',
    '을', 'ㄹ',
], key=len, reverse=True)


def _strip_endings(form: str):
    """
    형태에서 용언 어미를 제거하고 어근을 반환한다.
    제거 후 길이가 1 미만이면 None을 반환.
    """
    for ending in _VERB_ENDINGS:
        if form.endswith(ending):
            stem = form[: len(form) - len(ending)]
            if len(stem) >= 1:
                return stem
    return None


def _is_stopword_form(form: str) -> bool:
    """
    form 자체 또는 어미를 제거한 어근 + '다'가 STOPWORDS에 있으면 True.
    """
    if form in STOPWORDS:
        return True
    stem = _strip_endings(form)
    if stem is not None and (stem + '다') in STOPWORDS:
        return True
    return False

# ── 부정어 패턴 ───────────────────────────────────────────────────────────────
# 한국어 부정은 크게 두 가지:
#   후위 부정: "좋지 않다", "만족하지 못하다" → 부정어가 뒤에 옴
#   전위 부정: "안 좋다", "못 먹다"           → 부정어가 앞에 옴
_NEG_POSTFIX_FORMS = frozenset({
    '않', '못', '않다', '못하다', '아니다', '없다', '말다',
})
_NEG_PREFIX_FORMS = frozenset({'안', '못'})
_NEG_VX_STARTS    = ('않', '못')  # 보조동사(VX) 시작 형태


def _find_negated_indices(tokens) -> frozenset[int]:
    """
    부정어가 영향을 미치는 토큰 인덱스를 반환.
    - 후위 부정 (않다/못하다): 앞 3개 토큰을 negated 처리
    - 전위 부정 (안/못):       뒤 2개 토큰을 negated 처리
    """
    negated: set[int] = set()
    n = len(tokens)
    for i, t in enumerate(tokens):
        is_postfix = (
            t.form in _NEG_POSTFIX_FORMS
            or (t.tag == 'VX' and any(t.form.startswith(p) for p in _NEG_VX_STARTS))
        )
        is_prefix = t.form in _NEG_PREFIX_FORMS and t.tag in ('MAG', 'VX')

        if is_postfix:
            for j in range(max(0, i - 3), i):
                negated.add(j)
        if is_prefix:
            for j in range(i + 1, min(n, i + 3)):
                negated.add(j)

    return frozenset(negated)


def _flip(s: str) -> str:
    return {'positive': 'negative', 'negative': 'positive'}.get(s, s)


# ── Transformers 선택적 로드 ──────────────────────────────────────────────────
# pip install transformers torch sentencepiece 로 설치 가능
# 설치 안 돼 있어도 규칙 기반으로 폴백
_HF_PIPE   = None
_HF_READY  = False

def _load_hf() -> bool:
    global _HF_PIPE, _HF_READY
    if _HF_READY:
        return True
    try:
        from transformers import pipeline
        import torch
        device = 0 if torch.cuda.is_available() else -1
        _HF_PIPE = pipeline(
            'text-classification',
            model='snunlp/KR-FinBert-SC',
            device=device,
            truncation=True,
            max_length=512,
        )
        _HF_READY = True
        print('[sentiment] transformers + KR-FinBert-SC 로드 완료', file=sys.stderr)
    except Exception as e:
        print(f'[sentiment] transformers 미사용 (규칙 기반으로 폴백): {e}', file=sys.stderr)
        _HF_READY = False
    return _HF_READY


def _hf_classify(text: str) -> str | None:
    """문장 전체를 BERT로 분류. positive / negative / neutral 반환."""
    if not _HF_READY or _HF_PIPE is None:
        return None
    try:
        result = _HF_PIPE(text[:512])[0]
        label = result['label'].upper()
        if 'POS' in label:
            return 'positive'
        if 'NEG' in label:
            return 'negative'
        return 'neutral'
    except Exception:
        return None


# ── 문장 방향 (규칙 기반 폴백) ────────────────────────────────────────────────
def _rule_direction(pairs: list[tuple[str, str]]) -> str:
    """(lemma, sentiment) 목록에서 문장의 감성 방향 추출."""
    pos = sum(1 for _, s in pairs if s == 'positive')
    neg = sum(1 for _, s in pairs if s == 'negative')
    if pos == 0 and neg == 0:
        return 'neutral'
    if pos > neg:
        return 'positive'
    if neg > pos:
        return 'negative'
    return 'neutral'  # 동점


# ── 원문 표면 패턴 기반 방향 탐지 ─────────────────────────────────────────────
# _rule_direction이 neutral일 때 보조로 사용.
# 사전에 없는 형태로 쓰인 감성 표현(어미 변형 등)을 raw text에서 직접 탐지.
_POS_SURFACE_RE = re.compile(
    r'좋았|좋습니다|좋아요|좋네요|좋은\s*것|좋은\s*것\s*같|'
    r'만족합니다|만족했|만족스러|만족도가|'
    r'편리합니다|편리했|편리하고|편리한|'
    r'직관적|효율적|체계적|합리적|실용적|전문적|안정적|'
    r'유용합니다|유용했|유용하고|'
    r'도움이\s*됩니다|도움이\s*됐|도움이\s*되었|'
    r'감사합니다|감사드립니다|감사해요|'
    r'빠릅니다|빠르고|빠른|신속하게|신속한|'
    r'쉽습니다|쉬웠|쉽고|쉬운|수월합니다|수월했|'
    r'잘\s*됩니다|잘\s*됐|잘\s*작동|잘\s*되었'
)
_NEG_SURFACE_RE = re.compile(
    r'불편합니다|불편했|불편하고|불편한|불편함|'
    r'불만입니다|불만이|불만스러|'
    r'아쉽습니다|아쉬웠|아쉬운|아쉬움|'
    r'오류가|오류가\s*발생|오작동|버그|'
    r'느립니다|느렸|느리고|느린|'
    r'복잡합니다|복잡했|복잡하고|복잡한|'
    r'어렵습니다|어려웠|어렵고|어려운|힘듭니다|힘들었|힘들고|힘든|'
    r'번거롭|귀찮|답답합니다|답답했|답답한|'
    r'문제가\s*있|문제점이|문제가\s*발생|'
    r'지연됩니다|지연됐|지연되고|'
    r'안\s*됩니다|안\s*됐|안\s*되고|안\s*되어|'
    r'미흡합니다|미흡했|부족합니다|부족했'
)


def _text_direction(line: str) -> str:
    """
    원문 텍스트에서 감성 표면 패턴을 탐지해 방향을 반환.
    _rule_direction이 neutral을 반환할 때 보조 신호로 사용.
    """
    pos = len(_POS_SURFACE_RE.findall(line))
    neg = len(_NEG_SURFACE_RE.findall(line))
    if pos > neg:
        return 'positive'
    if neg > pos:
        return 'negative'
    return 'neutral'


# ── Kiwi 토크나이징 ───────────────────────────────────────────────────────────
def _tokenize_kiwi(kiwi, line: str) -> list[tuple[str, str]]:
    """
    (lemma, negation_adjusted_sentiment) 쌍 목록 반환.
    부정어 영향권의 단어는 감성이 반전된다.
    """
    tokens = kiwi.tokenize(line)
    negated = _find_negated_indices(tokens)
    result: list[tuple[str, str]] = []

    for i, t in enumerate(tokens):
        if t.tag in ('NNG', 'NNP', 'XR'):
            if len(t.form) < MIN_LEN:
                continue
            lemma = t.form
        elif t.tag == 'SL':
            if len(t.form) < MIN_SL_LEN or t.form.lower() in EN_STOPWORDS:
                continue
            lemma = t.form
        elif t.tag in ('VV', 'VA'):
            if len(t.form) < MIN_LEN:
                continue
            lemma = t.form + '다'
        else:
            continue

        if _is_stopword_form(lemma):
            continue

        base = get_sentiment(lemma)
        ctx  = _flip(base) if i in negated else base
        result.append((lemma, ctx))

    return result


# ── 감성 투표 집계 ────────────────────────────────────────────────────────────
# 핵심 설계 원칙:
#   - 사전에서 감성이 확인된 단어  → VOTE_LEXICON 으로 직접 투표 (중립 투표 없음)
#   - 사전에 없는 중립 단어        → 문장 방향 힌트로만 감성 결정
#   ※ 이전 버그: neutral 단어에도 VOTE_DIRECT를 neutral로 쌓았더니
#     수학적으로 힌트(0.4)가 직접표(2.0)를 절대 이길 수 없었음 → 모두 중립

VOTE_LEXICON = 3.0   # 사전 직접 매핑 / 부정어 반전 — 강한 신호
VOTE_HF_SEN  = 2.0   # Transformers 문장 분류 힌트
VOTE_RULE_SEN = 1.2  # 규칙 기반 문장 방향 힌트


def _resolve_sentiment(votes: dict[str, float]) -> str:
    """다수결. 투표 없거나 동점이면 neutral."""
    if not votes:
        return 'neutral'
    best_val = max(votes.values())
    winners  = [k for k, v in votes.items() if v == best_val]
    return 'neutral' if len(winners) != 1 else winners[0]


# ── 분석 메인 ─────────────────────────────────────────────────────────────────
MAX_WORDS = 150
MAX_ASSOC = 300
MIN_COOC  = 2


def _cooccurrence(sentences: list[list[str]], top_words: set[str]) -> list[dict]:
    cooc: dict[tuple[str, str], int] = defaultdict(int)
    for words in sentences:
        filtered = list({w for w in words if w in top_words})
        for w1, w2 in itertools.combinations(filtered, 2):
            cooc[tuple(sorted([w1, w2]))] += 1
    return [
        {'source': k[0], 'target': k[1], 'weight': v}
        for k, v in sorted(cooc.items(), key=lambda x: -x[1])
        if v >= MIN_COOC
    ][:MAX_ASSOC]


# ── 제안 문장 패턴 ────────────────────────────────────────────────────────────
_SUGGESTION_RE = re.compile(
    r'필요|개선|제안|요청|바랍|바람|바라|희망|해야|했으면|하면\s*좋|해주세요|해주시|'
    r'검토|도입|추가|강화|확대|보완|수정|구축|마련|건의|촉구|권고|권장|'
    r'늘려|줄여|고쳐|향상시|업그레이드|지원\s*필요|개선\s*필요|검토\s*부탁|'
    r'했으면\s*합니다|했으면\s*해요|했으면\s*좋|했으면\s*한다'
)


def _pick_sentences(candidates: list[tuple[str, set]], n: int = 3) -> list[str]:
    """
    (원문, 레마집합) 목록에서 내용 중복을 피해 n개 선택.
    Jaccard 유사도 > 0.5이면 이미 선택된 문장과 너무 비슷한 것으로 간주.
    """
    result: list[str] = []
    seen:   list[set] = []
    for line, lset in candidates:
        if not lset:
            continue
        if any(
            len(lset & s) / max(len(lset | s), 1) > 0.5
            for s in seen
        ):
            continue
        result.append(line)
        seen.append(lset)
        if len(result) >= n:
            break
    return result


def _extract_sentences(
    line_records: list[tuple[str, list[str], list[tuple[str, str]]]],
) -> tuple[list[str], list[str], list[str]]:
    """
    각 원문 라인을 로컬 감성(해당 문장 pairs의 부정어 반전 적용 감성)으로 채점.

    전역 final_sent 대신 문장별 pairs를 사용하는 이유:
      final_sent는 다른 문장들의 투표가 누적된 값이라 "확인" 같은 단어가
      다른 문장에서 부정 힌트를 받아 negative로 분류되면,
      현재 문장에서 긍정적으로 쓰인 "확인"도 부정으로 계산되는 오류가 생김.
      pairs의 ctx_sent는 이 문장에서 실제 부정어 영향을 반영한 감성이므로 더 정확.

    추가 규칙:
      - 제안 패턴에 매칭된 문장은 긍/부정 후보에서 제외 (제안 섹션 전용)
      - 우세 감성이 전체 감성 단어의 60% 이상이어야 유효한 문장으로 간주
    """
    MIN_LINE_LEN = 10

    scored    = []
    sug_cands = []

    for orig, lemmas, pairs in line_records:
        if len(orig) < MIN_LINE_LEN:
            continue
        lset = set(lemmas)
        is_suggestion = bool(_SUGGESTION_RE.search(orig))

        if is_suggestion:
            sug_cands.append((orig, lset))

        # 제안 문장은 긍/부정 후보에서 제외
        if is_suggestion:
            continue

        # 로컬 감성: pairs의 ctx_sent (부정어 반전 적용 완료)
        pos   = sum(1 for _, ctx in pairs if ctx == 'positive')
        neg   = sum(1 for _, ctx in pairs if ctx == 'negative')
        total = pos + neg
        score = pos - neg

        if total == 0 or score == 0:
            eff_score = 0
        else:
            ratio     = max(pos, neg) / total
            eff_score = score if ratio >= 0.6 else 0

        scored.append((orig, lset, eff_score))

    pos_cands = [(o, ls) for o, ls, sc in sorted(scored, key=lambda x: -x[2]) if sc > 0]
    neg_cands = [(o, ls) for o, ls, sc in sorted(scored, key=lambda x:  x[2]) if sc < 0]

    return _pick_sentences(pos_cands), _pick_sentences(neg_cands), _pick_sentences(sug_cands)


def analyze_with_kiwi(lines: list[str]) -> dict:
    from kiwipiepy import Kiwi
    kiwi = Kiwi()

    # Transformers 사전 로드 시도 (실패해도 계속 진행)
    use_hf = _load_hf()

    freq: Counter                      = Counter()
    votes: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    sentences:   list[list[str]]       = []
    line_records: list[tuple[str, list[str], list[tuple[str, str]]]] = []  # (원문, 레마, pairs)

    for line in lines:
        if not line.strip():
            continue

        # ① 토크나이징 + 부정어 감지
        pairs = _tokenize_kiwi(kiwi, line)
        if not pairs:
            continue

        lemmas = [p[0] for p in pairs]
        freq.update(lemmas)
        sentences.append(lemmas)
        line_records.append((line.strip(), lemmas, pairs))

        # ② 단어별 감성 투표
        #    사전에서 감성이 확인된 단어만 직접 투표.
        #    중립 단어는 여기서 투표하지 않음 → 중립 표가 쌓이면 힌트를 절대 이길 수 없기 때문
        for lemma, ctx_sent in pairs:
            if ctx_sent != 'neutral':
                votes[lemma][ctx_sent] += VOTE_LEXICON

        # ③ 문장 방향 힌트 — 중립 단어에 문장 전체 감성 방향을 주입
        #    우선순위: HuggingFace BERT > 사전 기반 > 원문 표면 패턴
        if use_hf:
            direction = _hf_classify(line) or _rule_direction(pairs)
        else:
            direction = _rule_direction(pairs)
        if direction == 'neutral':
            direction = _text_direction(line)

        if direction != 'neutral':
            hint_w = VOTE_HF_SEN if use_hf else VOTE_RULE_SEN
            for lemma, ctx_sent in pairs:
                if ctx_sent == 'neutral':
                    votes[lemma][direction] += hint_w

    # ④ 최종 감성 결정 (다수결)
    words_result = [
        {
            'text': w,
            'value': c,
            'sentiment': _resolve_sentiment(votes.get(w, {})),
        }
        for w, c in freq.most_common(MAX_WORDS)
    ]

    top_words    = {w['text'] for w in words_result}  # MAX_WORDS 전체 대상
    associations = _cooccurrence(sentences, top_words)

    # ⑤ 대표 문장 추출 (로컬 감성 기반 — pairs 직접 사용)
    pos_sents, neg_sents, sug_sents = _extract_sentences(line_records)

    return {
        'words': words_result,
        'associations': associations,
        'positiveSentences': pos_sents,
        'negativeSentences': neg_sents,
        'suggestionSentences': sug_sents,
    }


def analyze_fallback(lines: list[str]) -> dict:
    """Kiwi 없을 때 정규식 기반 폴백 (부정어 감지 미포함)."""
    freq: Counter                      = Counter()
    votes: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    sentences:    list[list[str]]      = []
    line_records: list[tuple[str, list[str]]] = []

    for line in lines:
        chunks = re.findall(r'[가-힣]+', line)
        words: list[str] = []
        for chunk in chunks:
            stripped = _strip_particles(chunk)
            if len(stripped) >= MIN_LEN and stripped not in STOPWORDS:
                words.append(stripped)
        if not words:
            continue
        freq.update(words)
        sentences.append(words)
        # fallback은 부정어 감지 없음 — (lemma, lexicon_sentiment) 쌍으로 구성
        local_pairs = [(w, get_sentiment(w)) for w in words]
        line_records.append((line.strip(), words, local_pairs))
        for w, s in local_pairs:
            if s != 'neutral':
                votes[w][s] += VOTE_LEXICON

        # 문장 방향 힌트 (fallback도 동일하게 적용)
        direction = _rule_direction(local_pairs)
        if direction == 'neutral':
            direction = _text_direction(line)
        if direction != 'neutral':
            for w, s in local_pairs:
                if s == 'neutral':
                    votes[w][direction] += VOTE_RULE_SEN

    words_result = [
        {
            'text': w,
            'value': c,
            'sentiment': _resolve_sentiment(votes.get(w, {})),
        }
        for w, c in freq.most_common(MAX_WORDS)
    ]
    top_words    = {w['text'] for w in words_result}  # MAX_WORDS 전체 대상
    associations = _cooccurrence(sentences, top_words)

    pos_sents, neg_sents, sug_sents = _extract_sentences(line_records)

    return {
        'words': words_result,
        'associations': associations,
        'positiveSentences': pos_sents,
        'negativeSentences': neg_sents,
        'suggestionSentences': sug_sents,
    }


def main() -> None:
    text = sys.stdin.read().strip()
    if not text:
        print(json.dumps({'words': [], 'associations': [], 'positiveSentences': [], 'negativeSentences': [], 'suggestionSentences': []}, ensure_ascii=False))
        return

    lines = [l for l in text.split('\n') if l.strip()]

    try:
        result = analyze_with_kiwi(lines)
        print('engine:kiwi', file=sys.stderr)
    except ImportError:
        result = analyze_fallback(lines)
        print('engine:fallback', file=sys.stderr)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
