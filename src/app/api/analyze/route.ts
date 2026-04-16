import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import type { WordFreq, Association, Sentiment } from '@/types'

// ── 인라인 감성 사전 (JS fallback 전용) ────────────────────────────────────
const JS_LEXICON: Record<string, 1 | -1> = {
  // ── 긍정 명사 ─────────────────────────────────────────────────────────
  행복: 1, 기쁨: 1, 즐거움: 1, 설렘: 1, 감격: 1, 감동: 1, 짜릿함: 1,
  흐뭇함: 1, 미소: 1, 웃음: 1, 홀가분함: 1, 뿌듯함: 1, 흡족: 1,
  만족: 1, 안도: 1, 안심: 1, 편안: 1, 여유: 1, 활기: 1, 활력: 1,
  생기: 1, 열정: 1, 의지: 1, 용기: 1, 자신감: 1, 자존감: 1, 긍지: 1,
  자랑: 1, 사랑: 1, 우정: 1, 배려: 1, 존중: 1, 친절: 1, 신뢰: 1,
  믿음: 1, 신념: 1, 성실: 1, 정직: 1, 공정: 1, 정의: 1, 공평: 1,
  균형: 1, 조화: 1, 상생: 1, 공존: 1, 연대: 1, 나눔: 1, 봉사: 1,
  헌신: 1, 포용: 1, 화해: 1, 용서: 1, 박애: 1, 선의: 1, 공감: 1,
  소통: 1, 화목: 1, 화합: 1, 단합: 1, 협력: 1, 협동: 1, 유대: 1,
  친밀: 1, 애정: 1, 응원: 1, 지지: 1,
  성공: 1, 희망: 1, 기대: 1, 축복: 1, 평화: 1, 자유: 1, 건강: 1,
  발전: 1, 성장: 1, 안정: 1, 번영: 1, 번창: 1, 도전: 1, 노력: 1,
  성취: 1, 보람: 1, 영광: 1, 기적: 1, 치유: 1, 회복: 1, 향상: 1,
  개선: 1, 진보: 1, 진화: 1, 도약: 1, 창의: 1, 혁신: 1, 창조: 1,
  발견: 1, 달성: 1, 완성: 1, 실현: 1, 목표: 1, 비전: 1, 꿈: 1,
  성과: 1, 결실: 1, 수확: 1, 전진: 1, 극복: 1, 돌파: 1, 강화: 1,
  확대: 1, 해결: 1, 개척: 1, 선도: 1, 우승: 1, 승리: 1, 최고: 1,
  최선: 1, 최적: 1, 탁월: 1, 우수: 1,
  장점: 1, 이점: 1, 혜택: 1, 효과: 1, 효율: 1, 실용: 1, 합리: 1,
  정확: 1, 신속: 1, 명확: 1, 간결: 1, 깔끔: 1, 세련: 1, 품질: 1,
  가치: 1, 유익: 1, 편의: 1, 편리: 1, 쾌적: 1, 안전: 1, 안락: 1,
  청결: 1, 신선: 1, 투명: 1, 효율성: 1, 생산성: 1, 유용성: 1,
  편리성: 1, 안전성: 1, 접근성: 1, 완성도: 1, 전문성: 1, 책임감: 1,
  호평: 1, 추천: 1, 선호: 1, 인기: 1, 호감: 1, 만족도: 1, 긍정: 1,
  좋음: 1, 뛰어남: 1, 훌륭함: 1, 이상적: 1, 최상: 1,
  지혜: 1, 통찰: 1, 이해: 1, 배움: 1, 능력: 1, 실력: 1, 역량: 1,
  잠재력: 1, 강점: 1, 경쟁력: 1, 전망: 1, 가능성: 1, 기회: 1,
  풍요: 1, 풍부: 1, 충만: 1, 이익: 1, 수익: 1, 흑자: 1, 호황: 1,
  보호: 1, 지원: 1, 후원: 1, 도움: 1, 위안: 1, 위로: 1, 축하: 1,
  감사: 1, 고마움: 1, 따뜻함: 1, 온기: 1, 포근함: 1, 명예: 1,
  존경: 1, 인정: 1, 칭찬: 1, 격려: 1, 행운: 1, 소중: 1, 귀중: 1,
  행복감: 1, 만족감: 1, 성취감: 1, 설레임: 1, 참여: 1, 기여: 1,
  흥미: 1, 흥분: 1, 환호: 1, 상쾌: 1, 신뢰성: 1, 정밀도: 1,
  // 긍정 형용사·동사
  좋다: 1, 행복하다: 1, 즐겁다: 1, 아름답다: 1, 훌륭하다: 1,
  친절하다: 1, 따뜻하다: 1, 밝다: 1, 활발하다: 1, 건강하다: 1,
  안전하다: 1, 편안하다: 1, 자유롭다: 1, 풍요롭다: 1, 만족하다: 1,
  기쁘다: 1, 감사하다: 1, 사랑하다: 1, 존경하다: 1, 신뢰하다: 1,
  우수하다: 1, 탁월하다: 1, 유익하다: 1, 편리하다: 1, 새롭다: 1,
  상쾌하다: 1, 깔끔하다: 1, 깨끗하다: 1, 놀랍다: 1, 멋지다: 1,
  예쁘다: 1, 귀엽다: 1, 재미있다: 1, 착하다: 1, 선하다: 1,
  바르다: 1, 올바르다: 1, 정직하다: 1, 성실하다: 1, 공정하다: 1,
  화목하다: 1, 평화롭다: 1, 발전하다: 1, 성장하다: 1, 향상하다: 1,
  개선하다: 1, 치유하다: 1, 회복하다: 1, 성공하다: 1, 달성하다: 1,
  실현하다: 1, 빛나다: 1, 활기차다: 1, 충만하다: 1, 완벽하다: 1,
  기특하다: 1, 대견하다: 1, 자랑스럽다: 1, 뿌듯하다: 1, 설레다: 1,
  감동적이다: 1, 효과적이다: 1, 효율적이다: 1, 편하다: 1, 쉽다: 1,
  간단하다: 1, 수월하다: 1, 원활하다: 1, 쾌적하다: 1, 명확하다: 1,
  정확하다: 1, 합리적이다: 1, 실용적이다: 1, 적절하다: 1,
  충분하다: 1, 풍부하다: 1, 든든하다: 1, 믿음직하다: 1, 안정적이다: 1,
  유용하다: 1, 세련되다: 1, 빠르다: 1, 신속하다: 1, 간편하다: 1,
  희망적이다: 1, 긍정적이다: 1, 생산적이다: 1, 창의적이다: 1,
  혁신적이다: 1, 발전적이다: 1, 적극적이다: 1, 용감하다: 1,
  명랑하다: 1, 쾌활하다: 1, 순수하다: 1, 진실하다: 1, 성숙하다: 1,
  현명하다: 1, 지혜롭다: 1, 포근하다: 1, 아늑하다: 1, 흡족하다: 1,
  만족스럽다: 1, 나아지다: 1, 좋아지다: 1, 향상되다: 1, 개선되다: 1,
  강화하다: 1, 극복하다: 1, 해결하다: 1, 능숙하다: 1, 전문적이다: 1,
  체계적이다: 1, 꼼꼼하다: 1, 다양하다: 1, 풍성하다: 1, 넉넉하다: 1,
  여유롭다: 1, 안도하다: 1, 도움이되다: 1, 보람있다: 1,
  적합하다: 1, 알맞다: 1, 이상적이다: 1, 뛰어나다: 1,
  용이하다: 1, 순조롭다: 1, 순탄하다: 1, 견고하다: 1, 충실하다: 1,
  풍성하다: 1, 역동적이다: 1, 통쾌하다: 1, 명쾌하다: 1,
  반갑다: 1, 뜻깊다: 1, 값지다: 1, 보람차다: 1,
  능동적이다: 1, 건실하다: 1, 신중하다: 1, 세심하다: 1,
  // 형용사 어근(XR) — "~하다" 없이 단독으로 추출될 때 커버
  용이: 1, 수월: 1, 원활: 1, 간편: 1, 간단: 1, 유용: 1,
  명쾌: 1, 통쾌: 1, 쾌감: 1, 순조: 1, 순탄: 1, 적합: 1,
  정밀: 1, 적절: 1, 충분: 1, 능숙: 1, 능률: 1, 현명: 1,
  슬기: 1, 견고: 1, 충실: 1, 건실: 1, 풍성: 1, 역동: 1,
  활발: 1, 적극: 1, 능동: 1, 호조: 1, 우월: 1,
  체계: 1, 꼼꼼: 1, 신중: 1, 세심: 1, 다양: 1,
  직관적: 1, 효율적: 1, 체계적: 1, 합리적: 1, 실용적: 1,
  전문적: 1, 안정적: 1, 명료: 1, 편리: 1, 신뢰감: 1,
  자연스럽: 1, 일관: 1, 즉각: 1,
  // ── 부정 명사 ─────────────────────────────────────────────────────────
  불안: -1, 걱정: -1, 공포: -1, 혐오: -1, 분노: -1, 미움: -1,
  절망: -1, 좌절: -1, 상처: -1, 고통: -1, 고민: -1, 스트레스: -1,
  우울: -1, 우울감: -1, 불안감: -1, 공포감: -1, 불쾌감: -1, 짜증: -1,
  피로: -1, 피곤함: -1, 권태: -1, 무기력: -1, 공허: -1, 허무함: -1,
  공허함: -1, 무력감: -1, 죄책감: -1, 수치심: -1, 외로움: -1,
  고독: -1, 소외: -1, 고립: -1, 소외감: -1, 고립감: -1, 박탈감: -1,
  상실감: -1, 두려움: -1, 공황: -1, 억울함: -1, 분함: -1, 억압감: -1,
  허탈: -1, 허탈감: -1, 실망감: -1, 서운함: -1, 섭섭함: -1,
  씁쓸함: -1, 아쉬움: -1, 지루함: -1, 따분함: -1, 번거로움: -1,
  귀찮음: -1, 답답함: -1,
  실패: -1, 위험: -1, 불만: -1, 피해: -1, 손해: -1, 갈등: -1,
  충돌: -1, 부패: -1, 위기: -1, 비극: -1, 참사: -1, 재난: -1,
  사고: -1, 범죄: -1, 폭력: -1, 위협: -1, 압박: -1, 포기: -1,
  이별: -1, 단절: -1, 파탄: -1, 파국: -1, 협박: -1, 폭행: -1,
  학대: -1, 모욕: -1, 욕설: -1, 거짓말: -1, 사기: -1, 횡령: -1,
  비리: -1, 조작: -1, 허위: -1, 불법: -1, 위반: -1, 탈세: -1,
  분열: -1, 파괴: -1, 훼손: -1, 악화: -1, 퇴보: -1, 침체: -1,
  손실: -1, 붕괴: -1, 증오: -1, 적대: -1, 반목: -1, 불화: -1,
  낭비: -1, 파멸: -1, 억압: -1, 착취: -1, 탄압: -1,
  결함: -1, 오류: -1, 실수: -1, 부족: -1, 불편: -1, 불합리: -1,
  불공정: -1, 차별: -1, 편견: -1, 거짓: -1, 기만: -1, 배신: -1,
  불신: -1, 의심: -1, 마찰: -1, 오해: -1, 왜곡: -1,
  단점: -1, 결점: -1, 문제점: -1, 불량: -1, 고장: -1, 장애: -1,
  장벽: -1, 제약: -1, 한계: -1, 부작용: -1, 역효과: -1, 부담: -1,
  싸움: -1, 다툼: -1, 분쟁: -1, 논쟁: -1, 불평등: -1, 모순: -1,
  함정: -1, 오작동: -1, 버그: -1, 불만족: -1, 미흡: -1, 미비: -1,
  부실: -1, 낙후: -1, 노후: -1, 지연: -1, 지체: -1, 방치: -1,
  소홀: -1, 무시: -1, 남용: -1, 오남용: -1, 과부하: -1, 과잉: -1,
  취약: -1, 취약점: -1, 불충분: -1, 저하: -1, 저조: -1, 불통: -1,
  비효율: -1, 비합리: -1, 불균형: -1, 낙담: -1, 낙심: -1, 비관: -1,
  자책: -1, 무능: -1, 태만: -1, 방관: -1, 무관심: -1, 냉담: -1,
  비난: -1, 비판: -1, 거부: -1, 반대: -1, 항의: -1,
  해고: -1, 실업: -1, 빈곤: -1, 결핍: -1, 가난: -1,
  갑질: -1, 부당: -1, 불이익: -1, 위기감: -1, 혼란: -1, 혼돈: -1,
  무질서: -1, 퇴행: -1, 역행: -1,
  // 형용사 어근(XR) — "~하다" 없이 단독으로 추출될 때 커버
  복잡: -1, 심각: -1, 열악: -1, 불안정: -1, 난해: -1,
  막막: -1, 황당: -1, 난감: -1, 곤란: -1, 과도: -1,
  무책임: -1, 부정직: -1, 불성실: -1, 비겁: -1, 잔인: -1,
  씁쓸: -1, 서운: -1, 섭섭: -1, 억울: -1, 답답: -1,
  번거롭: -1, 귀찮: -1, 과다: -1, 비효율: -1, 불명확: -1,
  불친절: -1, 불규칙: -1, 어색: -1, 애매: -1, 불투명: -1,
  // 추가 부정 명사·어근
  논란: -1, 의혹: -1, 혼선: -1, 폐해: -1, 악영향: -1,
  고질: -1, 만성: -1, 부조리: -1, 불필요: -1, 난항: -1,
  반감: -1, 적폐: -1, 파행: -1, 폐단: -1, 편향: -1,
  우려: -1, 위화감: -1, 퇴락: -1, 악재: -1, 손상: -1,
  // 부정 형용사·동사
  나쁘다: -1, 슬프다: -1, 힘들다: -1, 어렵다: -1, 무섭다: -1,
  두렵다: -1, 괴롭다: -1, 불안하다: -1, 위험하다: -1, 불편하다: -1,
  싫다: -1, 화나다: -1, 분하다: -1, 억울하다: -1, 지치다: -1,
  피곤하다: -1, 귀찮다: -1, 짜증나다: -1, 답답하다: -1, 절망하다: -1,
  좌절하다: -1, 후회하다: -1, 실망하다: -1, 부족하다: -1, 부당하다: -1,
  불합리하다: -1, 불공평하다: -1, 착취하다: -1, 부패하다: -1,
  혼란스럽다: -1, 외롭다: -1, 고독하다: -1, 공허하다: -1,
  무기력하다: -1, 암담하다: -1, 비참하다: -1, 끔찍하다: -1,
  미워하다: -1, 증오하다: -1, 혐오하다: -1, 차별하다: -1,
  위협하다: -1, 협박하다: -1, 억압하다: -1, 기만하다: -1,
  배신하다: -1, 낭비하다: -1, 파괴하다: -1, 훼손하다: -1,
  방해하다: -1, 해치다: -1, 악화하다: -1, 퇴보하다: -1,
  실패하다: -1, 망하다: -1, 잃다: -1, 포기하다: -1,
  낙담하다: -1, 비관하다: -1, 자책하다: -1,
  불쾌하다: -1, 번거롭다: -1, 까다롭다: -1, 지루하다: -1,
  따분하다: -1, 복잡하다: -1, 무능하다: -1, 게으르다: -1,
  나태하다: -1, 비효율적이다: -1, 터무니없다: -1, 부실하다: -1,
  불안정하다: -1, 낙후되다: -1, 뒤떨어지다: -1, 느리다: -1,
  더디다: -1, 낡다: -1, 고루하다: -1, 무책임하다: -1,
  부정직하다: -1, 불성실하다: -1, 비겁하다: -1, 잔인하다: -1,
  야만적이다: -1, 폭력적이다: -1, 위협적이다: -1, 우울하다: -1,
  비관적이다: -1, 부정적이다: -1, 냉담하다: -1, 냉정하다: -1,
  차갑다: -1, 쌀쌀맞다: -1, 억지스럽다: -1, 어색하다: -1,
  미흡하다: -1, 취약하다: -1, 불충분하다: -1, 저하되다: -1,
  악화되다: -1, 지연되다: -1, 방치되다: -1, 무시하다: -1,
  소홀하다: -1, 방관하다: -1, 허탈하다: -1, 씁쓸하다: -1,
  서운하다: -1, 섭섭하다: -1, 아쉽다: -1, 불만스럽다: -1,
  실망스럽다: -1, 과도하다: -1, 지나치다: -1, 심각하다: -1,
  열악하다: -1, 난해하다: -1, 막막하다: -1, 황당하다: -1,
  당혹스럽다: -1, 난감하다: -1, 곤란하다: -1, 어이없다: -1,
  고질적이다: -1, 만성적이다: -1, 부조리하다: -1, 편향되다: -1,
}

// 접미사 파생어 처리 (만족도→만족, 행복감→행복)
const _SUFFIXES = ['스러움', '스럽다', '하다', '없다', '있다', '감', '도', '성', '력', '심', '화', '기', '함', '음', '됨', '임']
// 부정 접두사 (불편→불+편, 미흡→미+흡)
const _NEG_PREFIXES = ['불', '미', '비', '무', '반', '탈']
// 긍정 접두사
const _POS_PREFIXES = ['최', '초']

function getSentiment(word: string): Sentiment {
  const direct = JS_LEXICON[word]
  if (direct === 1) return 'positive'
  if (direct === -1) return 'negative'

  // 접미사 파생어
  for (const sfx of _SUFFIXES) {
    if (word.endsWith(sfx) && word.length > sfx.length + 1) {
      const base = word.slice(0, word.length - sfx.length)
      const s = JS_LEXICON[base]
      if (s === 1) return 'positive'
      if (s === -1) return 'negative'
    }
  }

  // 접두사 패턴 (3자 이상)
  if (word.length >= 3) {
    for (const pfx of _NEG_PREFIXES) {
      if (word.startsWith(pfx)) {
        const stem = word.slice(pfx.length)
        const s = JS_LEXICON[stem]
        if (s === 1 || s === -1) return 'negative'
      }
    }
    for (const pfx of _POS_PREFIXES) {
      if (word.startsWith(pfx)) {
        const stem = word.slice(pfx.length)
        if (JS_LEXICON[stem] === 1) return 'positive'
      }
    }
  }

  return 'neutral'
}

type Result = {
  words: WordFreq[]
  associations: Association[]
  positiveSentences: string[]
  negativeSentences: string[]
  suggestionSentences: string[]
}

export async function POST(req: NextRequest) {
  let text: string
  try {
    const body = await req.json()
    text = body.text
    if (typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: '텍스트가 비어 있습니다.' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 })
  }

  try {
    const result = await analyzePython(text)
    return NextResponse.json({ ...result, engine: 'kiwi' })
  } catch {
    const result = analyzeJS(text)
    return NextResponse.json({ ...result, engine: 'js-fallback' })
  }
}

function analyzePython(text: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'analyze_korean.py')
    const proc = spawn('python3', [scriptPath], { timeout: 60_000 })
    let out = ''
    let err = ''
    proc.stdout.on('data', (c: Buffer) => { out += c.toString() })
    proc.stderr.on('data', (c: Buffer) => { err += c.toString() })
    proc.on('error', (e) => reject(new Error(e.message)))
    proc.on('close', (code) => {
      if (code !== 0) { reject(new Error(err)); return }
      try { resolve(JSON.parse(out) as Result) }
      catch { reject(new Error('Python 출력 파싱 실패')) }
    })
    proc.stdin.write(text, 'utf8')
    proc.stdin.end()
  })
}

// ── 조사 strip ─────────────────────────────────────────────────────────────
const PARTICLES = [
  '에서는', '에서도', '에게서', '로부터', '이라는', '이라고', '이라서',
  '으로서', '으로써', '라는', '라고', '라서', '라도', '라면',
  '에서', '에게', '까지', '부터', '이라', '이고', '이며', '이나',
  '이든', '이면', '이랑', '으로', '랑', '과', '와', '로',
  '에다', '에', '를', '을', '이', '가', '은', '는', '도', '만', '의',
].sort((a, b) => b.length - a.length)

function stripParticles(word: string): string {
  for (const p of PARTICLES) {
    if (word.endsWith(p) && word.length - p.length >= 2) return word.slice(0, word.length - p.length)
  }
  return word
}

const STOPWORDS = new Set([
  '이것', '그것', '저것', '이런', '그런', '저런', '이번', '그번',
  '여기', '거기', '저기', '이제', '지금', '그때', '어디', '누구',
  '무엇', '어떤', '얼마', '때문', '경우', '관련', '통해', '위해',
  '대한', '대해', '가지', '정도', '부분', '내용', '문제', '사항',
  '활동', '사용', '진행', '기준', '방식',
  '하다', '되다', '있다', '없다', '같다', '않다', '많다', '크다',
  '작다', '좋다', '나쁘다', '싶다', '보다', '오다', '가다', '주다',
])

// ── 용언 어미 strip (오분류 NNG 필터) ─────────────────────────────────────────
const VERB_ENDINGS = [
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
].sort((a, b) => b.length - a.length)

function stripEndings(form: string): string | null {
  for (const ending of VERB_ENDINGS) {
    if (form.endsWith(ending)) {
      const stem = form.slice(0, form.length - ending.length)
      if (stem.length >= 1) return stem
    }
  }
  return null
}

function isStopwordForm(form: string): boolean {
  if (STOPWORDS.has(form)) return true
  const stem = stripEndings(form)
  if (stem !== null && STOPWORDS.has(stem + '다')) return true
  return false
}

const VOTE_LEXICON = 3.0
const VOTE_RULE   = 1.2

function resolveVotes(votes: Record<string, number>): Sentiment {
  const entries = Object.entries(votes)
  if (entries.length === 0) return 'neutral'
  const best = Math.max(...entries.map(([, v]) => v))
  const winners = entries.filter(([, v]) => v === best).map(([k]) => k)
  if (winners.length !== 1) return 'neutral'
  return winners[0] as Sentiment
}

const POS_SURFACE_RE = /좋았|좋습니다|좋아요|좋네요|만족합니다|만족했|만족스러|편리합니다|편리했|편리하고|편리한|직관적|효율적|체계적|합리적|실용적|전문적|안정적|유용합니다|유용했|도움이\s*됩니다|도움이\s*됐|도움이\s*되었|감사합니다|감사드립니다|빠릅니다|빠르고|빠른|신속하게|쉽습니다|쉬웠|쉽고|수월합니다|수월했|잘\s*됩니다|잘\s*됐|잘\s*작동|잘\s*되었/
const NEG_SURFACE_RE = /불편합니다|불편했|불편하고|불편한|불편함|불만입니다|불만이|불만스러|아쉽습니다|아쉬웠|아쉬운|아쉬움|오류가|오작동|버그|느립니다|느렸|느리고|느린|복잡합니다|복잡했|복잡하고|복잡한|어렵습니다|어려웠|어렵고|힘듭니다|힘들었|힘들고|번거롭|귀찮|답답합니다|답답했|답답한|문제가\s*있|문제점이|지연됩니다|지연됐|안\s*됩니다|안\s*됐|안\s*되고|미흡합니다|미흡했|부족합니다|부족했/

function textDirection(line: string): Sentiment | null {
  const pos = (line.match(POS_SURFACE_RE) ?? []).length
  const neg = (line.match(NEG_SURFACE_RE) ?? []).length
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return null
}

function pickSentences(candidates: Array<[string, Set<string>]>, n = 3): string[] {
  const result: string[] = []
  const seen: Set<string>[] = []
  for (const [line, lset] of candidates) {
    if (!lset.size) continue
    const tooSimilar = seen.some((s) => {
      const inter = [...lset].filter((w) => s.has(w)).length
      const union = new Set([...lset, ...s]).size
      return inter / union > 0.5
    })
    if (tooSimilar) continue
    result.push(line)
    seen.push(lset)
    if (result.length >= n) break
  }
  return result
}

function analyzeJS(text: string): Result {
  const freq: Record<string, number> = {}
  const votes: Record<string, Record<string, number>> = {}
  const sentences: string[][] = []
  const lineRecords: Array<[string, string[]]> = []

  for (const line of text.split('\n')) {
    const lineWords: string[] = []
    for (const chunk of line.split(/\s+/)) {
      const korean = chunk.replace(/[^가-힣]/g, '')
      if (korean.length < 2) continue
      const word = stripParticles(korean)
      if (word.length >= 2 && !isStopwordForm(word)) {
        freq[word] = (freq[word] ?? 0) + 1
        lineWords.push(word)
        if (!votes[word]) votes[word] = {}
        const s = getSentiment(word)
        if (s !== 'neutral') {
          votes[word][s] = (votes[word][s] ?? 0) + VOTE_LEXICON
        }
      }
    }
    if (!lineWords.length) continue
    sentences.push(lineWords)
    lineRecords.push([line.trim(), lineWords])

    // 문장 방향 힌트 — 중립 단어에 주입 (사전 기반 → 표면 패턴 순)
    const lineSentiments = lineWords.map(getSentiment)
    const posC = lineSentiments.filter(s => s === 'positive').length
    const negC = lineSentiments.filter(s => s === 'negative').length
    let direction: Sentiment | null = posC > negC ? 'positive' : negC > posC ? 'negative' : null

    // 사전 기반으로 방향을 못 잡으면 표면 패턴으로 보충
    if (!direction) direction = textDirection(line)

    if (direction) {
      for (const word of lineWords) {
        if (getSentiment(word) === 'neutral') {
          if (!votes[word]) votes[word] = {}
          votes[word][direction] = (votes[word][direction] ?? 0) + VOTE_RULE
        }
      }
    }
  }

  const words: WordFreq[] = Object.entries(freq)
    .map(([text, value]) => ({ text, value, sentiment: resolveVotes(votes[text] ?? {}) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 150)

  // Co-occurrence
  const topSet = new Set(words.map((w) => w.text))  // 전체 150단어 대상
  const cooc: Record<string, number> = {}
  for (const sent of sentences) {
    const filtered = Array.from(new Set(sent.filter((w) => topSet.has(w))))
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const key = [filtered[i], filtered[j]].sort().join('\u0000')
        cooc[key] = (cooc[key] ?? 0) + 1
      }
    }
  }

  const associations: Association[] = Object.entries(cooc)
    .filter(([, v]) => v >= 2)
    .map(([k, weight]) => { const [source, target] = k.split('\u0000'); return { source, target, weight } })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 300)

  // 대표 문장 추출 — 로컬 감성(lineLocalSent) 기반으로 계산
  // 전역 finalSent 사용 시: 다른 문장에서 힌트를 받아 오분류된 단어가 영향을 줌
  // lineLocalSent 사용 시: 해당 문장에서 getSentiment()로 직접 계산 → 오염 없음
  const SUGGESTION_RE = /필요|개선|제안|요청|바랍|바람|바라|희망|해야|했으면|하면\s*좋|해주세요|해주시|검토|도입|추가|강화|확대|보완|수정|구축|마련|건의|촉구|권고|권장|늘려|줄여|고쳐|향상시|업그레이드/
  const MIN_LINE = 10

  const scored: Array<[string, Set<string>, number]> = []
  const sugCands: Array<[string, Set<string>]> = []

  for (const [orig, lemmas] of lineRecords) {
    if (orig.length < MIN_LINE) continue
    const lset = new Set(lemmas)
    const isSuggestion = SUGGESTION_RE.test(orig)

    if (isSuggestion) {
      sugCands.push([orig, lset])
      continue  // 제안 문장은 긍/부정 후보에서 제외
    }

    // 로컬 감성: 해당 문장 단어의 사전 직접 조회
    const p = lemmas.filter(l => getSentiment(l) === 'positive').length
    const n = lemmas.filter(l => getSentiment(l) === 'negative').length
    const total = p + n
    const score = p - n
    let effScore = 0
    if (total > 0 && score !== 0) {
      const ratio = Math.max(p, n) / total
      effScore = ratio >= 0.6 ? score : 0
    }
    scored.push([orig, lset, effScore])
  }

  const posCands: Array<[string, Set<string>]> = scored
    .filter(([, , sc]) => sc > 0)
    .sort((a, b) => b[2] - a[2])
    .map(([o, ls]) => [o, ls])
  const negCands: Array<[string, Set<string>]> = scored
    .filter(([, , sc]) => sc < 0)
    .sort((a, b) => a[2] - b[2])
    .map(([o, ls]) => [o, ls])

  return {
    words,
    associations,
    positiveSentences: pickSentences(posCands),
    negativeSentences: pickSentences(negCands),
    suggestionSentences: pickSentences(sugCands),
  }
}
