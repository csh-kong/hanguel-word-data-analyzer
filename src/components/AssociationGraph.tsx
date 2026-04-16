'use client'

import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force'
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'
import type { WordFreq, Association, Sentiment } from '@/types'

const W = 680
const H = 500

type GNode = SimulationNodeDatum & {
  id: string
  freq: number
  baseR: number
  r: number
}
type GLink = SimulationLinkDatum<GNode> & { weight: number }

// 렌더링용 스냅샷 (React state)
type NodeSnap = { id: string; x: number; y: number; r: number; freq: number }

function nodeColor(ratio: number) {
  if (ratio > 0.75) return '#8b5cf6'
  if (ratio > 0.45) return '#a78bfa'
  if (ratio > 0.2)  return '#c4b5fd'
  return '#ddd6fe'
}

// 직접 감성 색상 (진한)
const SENTIMENT_FILL: Record<Sentiment, string> = {
  positive: '#16a34a',  // green-700
  negative: '#dc2626',  // red-600
  neutral:  '#52525b',  // zinc-600
}
// 연관 경향 색상 (연한) — 중립 단어가 긍/부정 이웃과 자주 연결될 때
const AFFINITY_FILL = {
  pos: '#86efac',  // green-300
  neg: '#fca5a5',  // red-300
}

type Props = {
  words: WordFreq[]
  associations: Association[]
  sentimentMode?: boolean
  sentimentMap?: Map<string, Sentiment>
}

export type AssociationGraphHandle = {
  getSvgEl: () => SVGSVGElement | null
}

const AssociationGraph = forwardRef<AssociationGraphHandle, Props>(
function AssociationGraph({ words, associations, sentimentMode = false, sentimentMap }, ref) {
  const svgRef = useRef<SVGSVGElement>(null)

  useImperativeHandle(ref, () => ({
    getSvgEl: () => svgRef.current,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simRef   = useRef<any>(null)
  const nodesRef = useRef<GNode[]>([])
  const linksRef = useRef<GLink[]>([])
  const dragRef  = useRef<GNode | null>(null)
  const isDragging = useRef(false)

  const [snaps, setSnaps]         = useState<NodeSnap[]>([])
  const [nodeScale, setNodeScale] = useState(0.8)
  const [showCount, setShowCount] = useState(false)

  const maxFreq = useMemo(
    () => Math.max(...words.map((w) => w.value), 1),
    [words],
  )

  // ── 중립 단어의 이웃 감성 경향 계산 ──────────────────────────────────────
  // 각 노드에 대해 긍정/부정 이웃과의 연관 가중치 합을 비교
  const sentimentAffinity = useMemo(() => {
    const result = new Map<string, 'pos' | 'neg'>()
    if (!sentimentMode || !sentimentMap) return result

    const wordSet = new Set(words.map((w) => w.text))
    const posScore: Record<string, number> = {}
    const negScore: Record<string, number> = {}

    for (const assoc of associations) {
      if (!wordSet.has(assoc.source) || !wordSet.has(assoc.target)) continue
      const ss = sentimentMap.get(assoc.source)
      const ts = sentimentMap.get(assoc.target)
      if (ss === 'positive') posScore[assoc.target] = (posScore[assoc.target] ?? 0) + assoc.weight
      if (ss === 'negative') negScore[assoc.target] = (negScore[assoc.target] ?? 0) + assoc.weight
      if (ts === 'positive') posScore[assoc.source] = (posScore[assoc.source] ?? 0) + assoc.weight
      if (ts === 'negative') negScore[assoc.source] = (negScore[assoc.source] ?? 0) + assoc.weight
    }

    for (const [id, sentiment] of sentimentMap) {
      if (sentiment !== 'neutral') continue
      const p = posScore[id] ?? 0
      const n = negScore[id] ?? 0
      if (p === 0 && n === 0) continue
      result.set(id, p >= n ? 'pos' : 'neg')
    }

    return result
  }, [sentimentMode, sentimentMap, words, associations])

  // ── 노드 색상 결정 ─────────────────────────────────────────────────────────
  function nodeColorBySentiment(id: string): string {
    const sentiment = sentimentMap?.get(id) ?? 'neutral'
    if (sentiment !== 'neutral') return SENTIMENT_FILL[sentiment]
    const affinity = sentimentAffinity.get(id)
    if (affinity === 'pos') return AFFINITY_FILL.pos
    if (affinity === 'neg') return AFFINITY_FILL.neg
    return SENTIMENT_FILL.neutral
  }

  // ── 시뮬레이션 초기화 (words / associations 변경 시) ──────────────────────
  useEffect(() => {
    const prevPos = new Map(
      nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y, fx: n.fx, fy: n.fy }]),
    )
    const mf = Math.max(...words.map((w) => w.value), 1)

    // edge가 있는 단어 + 중요도(빈도) 기준으로 고립 노드 존치 결정
    // - edge가 있으면 무조건 포함
    // - edge가 없어도 빈도가 표시 단어 중앙값 이상이면 포함 (고빈도 단어는 중요)
    // - 빈도가 중앙값 미만이고 edge도 없으면 제거 (노이즈)
    const wordSet = new Set(words.map((w) => w.text))
    const connectedWords = new Set<string>()
    for (const a of associations) {
      if (wordSet.has(a.source)) connectedWords.add(a.source)
      if (wordSet.has(a.target)) connectedWords.add(a.target)
    }
    const sortedFreqs = [...words].sort((a, b) => a.value - b.value)
    const medianFreq  = sortedFreqs[Math.floor(sortedFreqs.length / 2)]?.value ?? 0
    const connectedWordList = words.filter(
      (w) => connectedWords.has(w.text) || w.value >= medianFreq,
    )

    const freshNodes: GNode[] = connectedWordList.map((w) => {
      const prev  = prevPos.get(w.text)
      const baseR = Math.sqrt(w.value / mf) * 18 + 6
      return {
        id: w.text, freq: w.value, baseR,
        r: baseR * nodeScale,
        x: prev?.x, y: prev?.y,
        fx: prev?.fx, fy: prev?.fy,
      }
    })
    nodesRef.current = freshNodes

    const byId    = new Map(freshNodes.map((n) => [n.id, n]))
    const keptWordSet = new Set(connectedWordList.map((w) => w.text))
    const freshLinks: GLink[] = associations
      .filter((a) => keptWordSet.has(a.source) && keptWordSet.has(a.target))
      .slice(0, 200)
      .map((a) => ({ source: byId.get(a.source)!, target: byId.get(a.target)!, weight: a.weight }))
      .filter((l) => l.source && l.target)
    linksRef.current = freshLinks

    simRef.current?.stop()

    const sim = forceSimulation<GNode>(freshNodes)
      .force('link',    forceLink<GNode, GLink>(freshLinks).id((d) => d.id).strength(0.3).distance(90))
      .force('charge',  forceManyBody<GNode>().strength(-60))
      .force('center',  forceCenter(W / 2, H / 2))
      .force('x',       forceX<GNode>(W / 2).strength(0.08))
      .force('y',       forceY<GNode>(H / 2).strength(0.08))
      .force('collide', forceCollide<GNode>((d) => d.r + 5))
      .on('tick', () => {
        const next: NodeSnap[] = nodesRef.current.map((n) => {
          const cx = n.x ?? W / 2
          const cy = n.y ?? H / 2
          const x = Math.max(n.r + 2, Math.min(W - n.r - 2, cx))
          const y = Math.max(n.r + 2, Math.min(H - n.r - 2, cy))
          if (x !== cx && n.vx != null) n.vx = 0
          if (y !== cy && n.vy != null) n.vy = 0
          n.x = x; n.y = y
          return { id: n.id, x, y, r: n.r, freq: n.freq }
        })
        setSnaps(next)
      })

    simRef.current = sim
    return () => { sim.stop() }
  // nodeScale은 별도 effect에서 처리
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, associations])

  // ── 노드 크기 변경 (시뮬레이션 유지, 위치 보존) ────────────────────────
  useEffect(() => {
    if (!simRef.current || nodesRef.current.length === 0) return
    nodesRef.current.forEach((n) => { n.r = n.baseR * nodeScale })
    simRef.current
      .force('collide', forceCollide<GNode>((d: GNode) => d.r + 5))
      .alpha(0.15)
      .restart()
  }, [nodeScale])

  // ── SVG 좌표 변환 ──────────────────────────────────────────────────────
  function toSvgPt(e: React.MouseEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * (H / rect.height),
    }
  }

  // ── 드래그 핸들러 ─────────────────────────────────────────────────────
  function onNodeDown(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    const node = nodesRef.current.find((n) => n.id === id)
    if (!node) return
    dragRef.current  = node
    isDragging.current = true
    const pt = toSvgPt(e)
    node.fx = pt.x
    node.fy = pt.y
    simRef.current?.alpha(0.15).restart()
  }

  function onSvgMove(e: React.MouseEvent) {
    if (!isDragging.current || !dragRef.current) return
    const pt = toSvgPt(e)
    dragRef.current.fx = pt.x
    dragRef.current.fy = pt.y
  }

  function onSvgUp() {
    isDragging.current = false
    dragRef.current    = null
    // fx/fy 유지 → 드롭 후에도 위치 고정
  }

  // ── 스냅맵 (O(1) 링크 좌표 조회) ──────────────────────────────────────
  const snapMap = useMemo(
    () => new Map(snaps.map((s) => [s.id, s])),
    [snaps],
  )

  if (words.length === 0) {
    return (
      <div
        className="rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"
        style={{ height: H }}
      >
        <p className="text-zinc-500 text-sm">연관 데이터가 없습니다.</p>
      </div>
    )
  }

  const maxWeight = Math.max(...linksRef.current.map((l) => l.weight), 1)

  function handleDownload() {
    const svg = svgRef.current
    if (!svg) return
    // 폰트 힌트 스타일 삽입
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `text { font-family: Pretendard Variable, Pretendard, sans-serif; }`
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.insertBefore(style, clone.firstChild)
    // viewBox 기반 실제 크기 명시
    clone.setAttribute('width', String(W))
    clone.setAttribute('height', String(H))
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
    a.download = 'association-graph.svg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col">

      {/* ── 노드 크기 슬라이더 ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800">
        <span className="text-xs text-zinc-500 shrink-0">노드 크기</span>
        <input
          type="range" min={0.4} max={2.5} step={0.1}
          value={nodeScale}
          onChange={(e) => setNodeScale(Number(e.target.value))}
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-violet-500 bg-zinc-700"
        />
        <span className="text-xs text-violet-400 font-600 w-8 text-right shrink-0">
          {nodeScale.toFixed(1)}×
        </span>
        <span className="text-xs text-zinc-600 shrink-0 hidden sm:block">
          · 노드를 드래그해 위치 고정
        </span>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={() => setShowCount((v) => !v)}
            className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
              showCount
                ? 'bg-zinc-700 text-white border-zinc-500'
                : 'bg-zinc-800 text-zinc-400 hover:text-white border-zinc-700 hover:border-zinc-500'
            }`}
          >
            빈도 표시
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors"
          >
            SVG 저장
          </button>
        </div>
      </div>

      {/* ── 그래프 SVG ─────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', touchAction: 'none',
          cursor: isDragging.current ? 'grabbing' : 'default' }}
        onMouseMove={onSvgMove}
        onMouseUp={onSvgUp}
        onMouseLeave={onSvgUp}
      >
        <rect width={W} height={H} fill="#18181b" />

        {/* 엣지 */}
        <g>
          {linksRef.current.map((l, i) => {
            const s = snapMap.get((l.source as GNode).id)
            const t = snapMap.get((l.target as GNode).id)
            if (!s || !t) return null
            return (
              <line
                key={i}
                x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                strokeWidth={Math.log(l.weight + 1) * 1.5 + 0.5}
                stroke={`rgba(139,92,246,${0.12 + (l.weight / maxWeight) * 0.38})`}
              />
            )
          })}
        </g>

        {/* 노드 */}
        <g>
          {snaps.map((n) => (
            <g key={n.id}>
              <circle
                cx={n.x} cy={n.y} r={n.r}
                fill={
                  sentimentMode && sentimentMap
                    ? nodeColorBySentiment(n.id)
                    : nodeColor(n.freq / maxFreq)
                }
                style={{ cursor: 'grab' }}
                onMouseDown={(e) => onNodeDown(e, n.id)}
              >
                <title>{n.id}  (빈도 {n.freq})</title>
              </circle>
              {(() => {
                const labelFs = Math.max(9, Math.min(13, n.r * 0.7))
                const countFs = Math.max(7, Math.min(11, n.r * 0.55))
                return (
                  <>
                    {/* 단어 라벨: dominantBaseline 대신 y에 fontSize 직접 반영 */}
                    <text
                      x={n.x}
                      y={n.y + n.r + 2 + labelFs}
                      fontSize={labelFs}
                      fill="#e4e4e7"
                      textAnchor="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {n.id}
                    </text>
                    {/* 빈도: dominantBaseline="middle" 대신 y에 0.35em 오프셋 */}
                    {showCount && (
                      <text
                        x={n.x}
                        y={n.y + countFs * 0.35}
                        fontSize={countFs}
                        fill="rgba(255,255,255,0.85)"
                        textAnchor="middle"
                        fontWeight="600"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {n.freq}
                      </text>
                    )}
                  </>
                )
              })()}
            </g>
          ))}
        </g>
      </svg>

      {/* ── 감성 범례 ─────────────────────────────────────────────────────── */}
      {sentimentMode && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3 border-t border-zinc-800">
          {[
            { color: '#16a34a', label: '긍정 단어' },
            { color: '#86efac', label: '긍정 단어와 자주 연결' },
            { color: '#dc2626', label: '부정 단어' },
            { color: '#fca5a5', label: '부정 단어와 자주 연결' },
            { color: '#52525b', label: '중립' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export default AssociationGraph
