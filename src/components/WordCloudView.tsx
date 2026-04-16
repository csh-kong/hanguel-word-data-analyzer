'use client'

import dynamic from 'next/dynamic'
import { useMemo, useRef, useState } from 'react'
import AssociationGraph from './AssociationGraph'
import type { AssociationGraphHandle } from './AssociationGraph'
import type { WordFreq, Association, Sentiment } from '@/types'

const ReactWordcloud = dynamic(() => import('react-wordcloud'), { ssr: false })

type View = 'cloud' | 'graph'

type Props = {
  words: WordFreq[]
  associations: Association[]
  engine: string
  positiveSentences: string[]
  negativeSentences: string[]
  suggestionSentences: string[]
  onReset: () => void
  onBackToSelect: () => void
}

const ENGINE_LABELS: Record<string, { label: string; warn?: boolean }> = {
  kiwi:          { label: 'KiwiPy 형태소 분석 · 명사 + 동사/형용사 원형' },
  'js-fallback': { label: 'JS 기본 분석 (Python 미설치 — 정확도 낮음)', warn: true },
}

const SENTIMENT_COLORS: Record<Sentiment, string> = {
  positive: '#22c55e',
  negative: '#ef4444',
  neutral:  '#52525b',
}

const DEFAULT_COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#60a5fa', '#34d399']

export default function WordCloudView({ words, associations, engine, positiveSentences, negativeSentences, suggestionSentences, onReset, onBackToSelect }: Props) {
  const [view, setView] = useState<View>('cloud')
  const [topN, setTopN] = useState(100)
  const [sentimentMode, setSentimentMode] = useState(false)
  const wcContainerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<AssociationGraphHandle>(null)

  function handleDownloadCloud() {
    const container = wcContainerRef.current
    if (!container) return
    const svg = container.querySelector('svg')
    if (!svg) return
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `text { font-family: Pretendard Variable, Pretendard, sans-serif; }`
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.insertBefore(style, clone.firstChild)
    // 배경색 삽입
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', '#18181b')
    clone.insertBefore(bg, clone.firstChild)
    const w = svg.viewBox.baseVal.width || svg.clientWidth
    const h = svg.viewBox.baseVal.height || svg.clientHeight
    if (w) clone.setAttribute('width', String(w))
    if (h) clone.setAttribute('height', String(h))
    const serializer = new XMLSerializer()
    let str = serializer.serializeToString(clone)
    if (!str.includes('xmlns=')) {
      str = str.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    }
    const blob = new Blob(
      ['<?xml version="1.0" encoding="utf-8"?>\n' + str],
      { type: 'image/svg+xml' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wordcloud.svg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function serializeSvg(svg: SVGSVGElement, bgColor = '#18181b'): string {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `text { font-family: Pretendard Variable, Pretendard, sans-serif; }`
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.insertBefore(style, clone.firstChild)
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', bgColor)
    clone.insertBefore(bg, clone.firstChild)
    // viewBox가 없으면 clientWidth/Height 로 설정 → CSS width:100%/height:auto 가 비율대로 스케일
    const vb = svg.viewBox.baseVal
    const w = vb.width  || svg.clientWidth
    const h = vb.height || svg.clientHeight
    if (w && h && !vb.width) {
      clone.setAttribute('viewBox', `0 0 ${w} ${h}`)
    }
    // width/height 는 제거해서 CSS 가 제어하도록
    clone.removeAttribute('width')
    clone.removeAttribute('height')
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    const serializer = new XMLSerializer()
    let str = serializer.serializeToString(clone)
    if (!str.includes('xmlns=')) {
      str = str.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    }
    return str
  }

  function handlePrintPdf() {
    const wcSvg = wcContainerRef.current?.querySelector('svg') ?? null
    const graphSvg = graphRef.current?.getSvgEl() ?? null

    const wcSvgStr = wcSvg ? serializeSvg(wcSvg) : ''
    const graphSvgStr = graphSvg ? serializeSvg(graphSvg) : ''

    const graphLegendHtml = sentimentMode
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px 20px;padding:10px 0 2px;border-top:1px solid #27272a;margin-top:8px;">
          ${[
            { color: '#16a34a', label: '긍정 단어' },
            { color: '#86efac', label: '긍정 단어와 자주 연결' },
            { color: '#dc2626', label: '부정 단어' },
            { color: '#fca5a5', label: '부정 단어와 자주 연결' },
            { color: '#52525b', label: '중립' },
          ].map(({ color, label }) =>
            `<span style="display:inline-flex;align-items:center;gap:6px;">
              <span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;"></span>
              <span style="font-size:11px;color:#a1a1aa;">${label}</span>
            </span>`
          ).join('')}
        </div>`
      : `<div style="padding:8px 0 2px;border-top:1px solid #27272a;margin-top:8px;">
          <span style="font-size:11px;color:#52525b;">노드 크기 = 단어 빈도 · 선 굵기 = 동시 출현 횟수</span>
        </div>`

    const wordBadgesHtml = slicedWords.map((w) => {
      const s = sentimentMode ? w.sentiment : null
      const borderColor = s === 'positive' ? '#15803d' : s === 'negative' ? '#b91c1c' : '#3f3f46'
      const textColor = s ? (s === 'positive' ? '#22c55e' : s === 'negative' ? '#ef4444' : '#71717a') : '#a78bfa'
      return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;background:#27272a;border:1px solid ${borderColor};font-size:13px;margin:3px;">
        <span style="color:${textColor};font-weight:500;">${w.text}</span>
        <span style="color:#52525b;font-size:11px;">${w.value}</span>
      </span>`
    }).join('')

    function sentenceListHtml(sentences: string[], badgeBg: string, badgeColor: string) {
      if (sentences.length === 0) return '<p style="color:#52525b;font-size:13px;">해당 문장 없음</p>'
      return `<ol style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;">${
        sentences.map((s, i) => `<li style="display:flex;gap:10px;">
          <span style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:${badgeBg};color:${badgeColor};font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;">${i + 1}</span>
          <p style="font-size:13px;color:#d4d4d8;line-height:1.6;margin:0;">${s}</p>
        </li>`).join('')
      }</ol>`
    }

    const hasSentences = positiveSentences.length > 0 || negativeSentences.length > 0 || suggestionSentences.length > 0

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>분석 결과</title>
<style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css');
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { background: #09090b; color: #e4e4e7; font-family: "Pretendard Variable", Pretendard, sans-serif; }
  .section { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 14px; }
  .section-title { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; flex-shrink: 0; }
  svg { display: block; width: 100% !important; height: 100% !important; }

  /* 1페이지: 차트 2개 세로 배치 */
  .page1 {
    height: 273mm; /* A4(297mm) - 상하 margin(12mm×2) */
    display: flex;
    flex-direction: column;
    gap: 10px;
    page-break-after: always;
  }
  .page1 h1 { font-size: 17px; font-weight: 600; color: #fff; flex-shrink: 0; }
  .chart-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .chart-section .svg-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* 2페이지~: 나머지 콘텐츠 */
  .rest { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
</style>
</head>
<body>

<div class="page1">
  <h1>분석 결과</h1>
  <div class="section chart-section">
    <div class="section-title" style="color:#8b5cf6;">워드클라우드 · 상위 ${slicedWords.length}개 단어</div>
    <div class="svg-wrap">
      ${wcSvgStr || '<p style="color:#52525b;">워드클라우드를 불러올 수 없습니다.</p>'}
    </div>
  </div>
  <div class="section chart-section">
    <div class="section-title" style="color:#8b5cf6;">연관 분석</div>
    <div class="svg-wrap">
      ${graphSvgStr || '<p style="color:#52525b;">연관 그래프를 불러올 수 없습니다.</p>'}
    </div>
    ${graphLegendHtml}
  </div>
</div>

<div class="rest">
  <div class="section">
    <div class="section-title" style="color:#71717a;">단어 목록 (빈도 내림차순)</div>
    <div style="display:flex;flex-wrap:wrap;gap:0;">${wordBadgesHtml}</div>
  </div>
  ${hasSentences ? `
  <div class="grid2">
    <div class="section">
      <div class="section-title" style="color:#22c55e;">긍정 대표 문장</div>
      ${sentenceListHtml(positiveSentences, '#14532d', '#4ade80')}
    </div>
    <div class="section">
      <div class="section-title" style="color:#ef4444;">부정 대표 문장</div>
      ${sentenceListHtml(negativeSentences, '#7f1d1d', '#f87171')}
    </div>
  </div>
  ${suggestionSentences.length > 0 ? `
  <div class="section">
    <div class="section-title" style="color:#fbbf24;">제안하는 내용</div>
    ${sentenceListHtml(suggestionSentences, '#451a03', '#fcd34d')}
  </div>` : ''}` : ''}
</div>

<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  const maxN = Math.min(words.length, 200)
  const slicedWords = useMemo(() => words.slice(0, topN), [words, topN])

  // per-word sentiment 맵
  const sentimentMap = useMemo(
    () => new Map(words.map((w) => [w.text, w.sentiment])),
    [words],
  )

  // 감성 분포 카운트
  const sentimentCounts = useMemo(() => {
    const counts = { positive: 0, negative: 0, neutral: 0 }
    for (const w of slicedWords) counts[w.sentiment]++
    return counts
  }, [slicedWords])

  const wcOptions = useMemo(() => ({
    enableTooltip: true,
    fontFamily: 'Pretendard Variable, Pretendard, sans-serif',
    fontSizes: [14, 80] as [number, number],
    rotations: 2,
    rotationAngles: [0, -90] as [number, number],
    padding: 2,
    colors: sentimentMode
      ? [SENTIMENT_COLORS.positive, SENTIMENT_COLORS.negative, SENTIMENT_COLORS.neutral]
      : DEFAULT_COLORS,
  }), [sentimentMode])

  // react-wordcloud per-word color callback
  const wcCallbacks = useMemo(() => ({
    getWordColor: sentimentMode
      ? (word: { text: string }) => SENTIMENT_COLORS[sentimentMap.get(word.text) ?? 'neutral']
      : undefined,
    getWordTooltip: (word: { text: string; value: number }) => {
      const s = sentimentMap.get(word.text) ?? 'neutral'
      const label = s === 'positive' ? '긍정' : s === 'negative' ? '부정' : '중도'
      return `${word.text}  빈도 ${word.value}  |  ${label}`
    },
  }), [sentimentMode, sentimentMap])

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <p className="text-zinc-400">추출된 단어가 없습니다.</p>
        <button onClick={onReset} className="px-4 py-2 rounded-xl text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
          다시 시작
        </button>
      </div>
    )
  }

  const engineInfo = ENGINE_LABELS[engine]

  return (
    <div className="flex flex-col gap-5">
      {/* ── 헤더 ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button onClick={onBackToSelect} className="px-3 py-1.5 rounded-xl text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
              ← 컬럼 재선택
            </button>
            <button onClick={onReset} className="px-3 py-1.5 rounded-xl text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
              처음부터
            </button>
          </div>
          <div>
            <h2 className="text-lg font-600 text-white">상위 {slicedWords.length}개 단어</h2>
            {engineInfo && (
              <p className={`mt-0.5 text-xs ${engineInfo.warn ? 'text-amber-500' : 'text-zinc-500'}`}>
                {engineInfo.label}
              </p>
            )}
          </div>
        </div>
        <button onClick={handlePrintPdf} className="shrink-0 px-3 py-1.5 rounded-xl text-sm bg-violet-700 text-white hover:bg-violet-600 transition-colors">
          PDF 저장
        </button>
      </div>

      {/* ── 컨트롤 바 ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-4">
        {/* 뷰 토글 */}
        <div className="flex rounded-xl bg-zinc-800 p-1 gap-1 shrink-0">
          {([
            { key: 'cloud', label: '☁ 워드클라우드' },
            { key: 'graph', label: '◎ 연관분석' },
          ] as { key: View; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-500 transition-colors ${
                view === key ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="hidden sm:block w-px h-6 bg-zinc-700 shrink-0" />

        {/* 워드클라우드: 단어 수 / 연관분석: 분석 범위 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xs text-zinc-500 shrink-0">{view === 'graph' ? '분석 범위' : '단어 수'}</span>
          <input
            type="range" min={10} max={maxN} step={5} value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-violet-500 bg-zinc-700"
          />
          <span className="text-sm text-white font-600 w-8 text-right shrink-0">{topN}</span>
        </div>

        <div className="hidden sm:block w-px h-6 bg-zinc-700 shrink-0" />

        {/* 감성 분석 토글 */}
        <button
          onClick={() => setSentimentMode((v) => !v)}
          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-500 border transition-colors ${
            sentimentMode
              ? 'bg-zinc-800 border-zinc-600 text-white'
              : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${sentimentMode ? 'bg-green-400' : 'bg-zinc-600'}`} />
          감성 분석
        </button>
      </div>

      {/* ── 감성 범례 + 분포 (모드 ON일 때) ───────────────────────── */}
      {sentimentMode && (
        <div className="flex items-center gap-4 px-5 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex-wrap">
          {([
            { key: 'positive' as Sentiment, label: '긍정', color: 'bg-green-500' },
            { key: 'negative' as Sentiment, label: '부정', color: 'bg-red-500'   },
            { key: 'neutral'  as Sentiment, label: '중도', color: 'bg-zinc-500'  },
          ]).map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-sm text-zinc-300">{label}</span>
              <span className="text-sm font-600 text-white">{sentimentCounts[key]}</span>
              <span className="text-xs text-zinc-500">
                ({Math.round(sentimentCounts[key] / slicedWords.length * 100)}%)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 뷰 콘텐츠 ─────────────────────────────────────────────── */}
      {/* 두 뷰를 항상 마운트해서 PDF 시 양쪽 SVG 모두 캡처 가능하게 함 */}
      {/* 비활성 뷰는 left:-9999px 로 화면 밖에 배치 (레이아웃 계산 유지) */}
      <div style={view !== 'cloud' ? { position: 'absolute', left: '-9999px', top: 0, width: '680px' } : undefined}>
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col">
          <div ref={wcContainerRef} style={{ width: '100%', height: 440 }}>
            <ReactWordcloud
              words={slicedWords}
              options={wcOptions}
              callbacks={wcCallbacks}
            />
          </div>
          <div className="flex justify-end px-4 py-2 border-t border-zinc-800">
            <button
              onClick={handleDownloadCloud}
              className="px-3 py-1 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors"
            >
              SVG 저장
            </button>
          </div>
        </div>
      </div>

      <div style={view !== 'graph' ? { position: 'absolute', left: '-9999px', top: 0 } : undefined}>
        <AssociationGraph
          ref={graphRef}
          words={slicedWords}
          associations={associations}
          sentimentMode={sentimentMode}
          sentimentMap={sentimentMap}
        />
      </div>

      {/* ── 단어 배지 목록 (접기/펴기) ──────────────────────────── */}
      <WordBadgeList words={slicedWords} sentimentMode={sentimentMode} />

      {/* ── 대표 문장 ──────────────────────────────────────────────── */}
      {(positiveSentences.length > 0 || negativeSentences.length > 0 || suggestionSentences.length > 0) && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 긍정 */}
            <SentenceCard
              title="긍정 대표 문장"
              titleColor="text-green-500"
              badgeBg="bg-green-900"
              badgeText="text-green-400"
              sentences={positiveSentences}
            />
            {/* 부정 */}
            <SentenceCard
              title="부정 대표 문장"
              titleColor="text-red-500"
              badgeBg="bg-red-900"
              badgeText="text-red-400"
              sentences={negativeSentences}
            />
          </div>
          {/* 제안 */}
          {suggestionSentences.length > 0 && (
            <SentenceCard
              title="제안하는 내용"
              titleColor="text-amber-400"
              badgeBg="bg-amber-900"
              badgeText="text-amber-300"
              sentences={suggestionSentences}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── 별도 컴포넌트로 분리 — state 변경이 상위로 전파되지 않아 워드클라우드 re-render 방지
function WordBadgeList({ words, sentimentMode }: { words: WordFreq[]; sentimentMode: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <p className="text-xs text-zinc-500 font-500 uppercase tracking-wider">
          단어 목록 (빈도 내림차순)
        </p>
        <span className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
          {expanded ? '접기 ▲' : '펼치기 ▼'}
        </span>
      </button>
      <div
        className={`flex flex-wrap gap-2 overflow-hidden transition-[max-height] duration-300 ${
          expanded ? 'max-h-[2000px]' : 'max-h-[72px]'
        }`}
      >
        {words.map((w) => {
          const s = sentimentMode ? w.sentiment : null
          return (
            <span
              key={w.text}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 text-sm text-zinc-300 border ${
                s === 'positive' ? 'border-green-700' :
                s === 'negative' ? 'border-red-700'   :
                s === 'neutral'  ? 'border-zinc-600'  :
                'border-zinc-700'
              }`}
            >
              <span
                style={{ color: s ? SENTIMENT_COLORS[s] : '#a78bfa' }}
                className="font-500"
              >
                {w.text}
              </span>
              <span className="text-zinc-600 text-xs">{w.value}</span>
            </span>
          )
        })}
      </div>
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-left"
        >
          + {words.length}개 전체 보기
        </button>
      )}
    </div>
  )
}

function SentenceCard({
  title,
  titleColor,
  badgeBg,
  badgeText,
  sentences,
}: {
  title: string
  titleColor: string
  badgeBg: string
  badgeText: string
  sentences: string[]
}) {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-3">
      <p className={`text-xs font-500 uppercase tracking-wider ${titleColor}`}>{title}</p>
      {sentences.length === 0 ? (
        <p className="text-sm text-zinc-600">해당 문장 없음</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {sentences.map((sent, i) => (
            <li key={i} className="flex gap-3">
              <span className={`shrink-0 mt-0.5 w-5 h-5 rounded-full ${badgeBg} ${badgeText} text-xs flex items-center justify-center font-600`}>
                {i + 1}
              </span>
              <p className="text-sm text-zinc-300 leading-relaxed">{sent}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
