'use client'

import { useState } from 'react'
import type { ParsedFile } from '@/types'

type Props = {
  files: ParsedFile[]
  loading: boolean
  onAnalyze: (text: string) => void
  onBack: () => void
}

export default function ColumnSelector({ files, loading, onAnalyze, onBack }: Props) {
  // 파일별 제외 컬럼 (기본: 전체 선택)
  const [excluded, setExcluded] = useState<Record<string, Set<string>>>(
    () => Object.fromEntries(files.map((f) => [f.id, new Set<string>()]))
  )

  function toggleColumn(fileId: string, col: string) {
    setExcluded((prev) => {
      const next = new Set(prev[fileId] ?? [])
      next.has(col) ? next.delete(col) : next.add(col)
      return { ...prev, [fileId]: next }
    })
  }

  function selectedCols(file: ParsedFile) {
    return file.headers.filter((h) => !excluded[file.id]?.has(h))
  }

  const totalRows = files.reduce((s, f) => s + f.rows.length, 0)
  const totalSelected = files.reduce((s, f) => s + selectedCols(f).length, 0)
  const canAnalyze = files.some((f) => selectedCols(f).length > 0)

  function handleStart() {
    // 행 구분을 \n으로 → Python에서 줄별 공기(co-occurrence) 계산에 사용
    const text = files
      .map((f) => {
        const cols = selectedCols(f)
        return f.rows
          .map((row) => cols.map((c) => row[c] ?? '').join(' '))
          .join('\n')
      })
      .join('\n')
    onAnalyze(text)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-zinc-400">
          <span className="text-white font-600">{files.length}</span>개 파일 ·{' '}
          <span className="text-white font-600">{totalRows.toLocaleString()}</span>행
        </p>
        <p className="text-xs text-zinc-500">
          <span className="text-violet-400">{totalSelected}</span>개 컬럼 분석 예정
        </p>
      </div>

      {/* Per-file sections */}
      {files.map((file) => {
        const cols = selectedCols(file)
        const preview = cols
          .flatMap((col) => file.rows.slice(0, 2).map((r) => ({ col, value: r[col] })))
          .filter((x) => x.value)
          .slice(0, 3)

        return (
          <div key={file.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            {/* File header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-800/50">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">📄</span>
                <span className="text-sm text-white font-500 truncate">{file.filename}</span>
              </div>
              <span className="shrink-0 ml-3 text-xs text-zinc-500">
                {file.rows.length.toLocaleString()}행 ·{' '}
                <span className="text-violet-400">{cols.length}</span>/{file.headers.length}
              </span>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Column toggles */}
              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-500">
                  제외할 컬럼을 클릭해 비활성화
                </p>
                <div className="flex flex-wrap gap-2">
                  {file.headers.map((h) => {
                    const active = !excluded[file.id]?.has(h)
                    return (
                      <button
                        key={h}
                        onClick={() => toggleColumn(file.id, h)}
                        className={`
                          px-3 py-1.5 rounded-lg text-sm font-500 border transition-colors
                          ${active
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-500 line-through hover:border-zinc-500 hover:text-zinc-400'
                          }
                        `}
                      >
                        {h}
                      </button>
                    )
                  })}
                </div>
                {cols.length === 0 && (
                  <p className="text-xs text-red-400">이 파일은 분석에서 제외됩니다.</p>
                )}
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {preview.map((x, i) => (
                    <div key={i} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 truncate">
                      <span className="text-zinc-500 mr-2">[{x.col}]</span>
                      {x.value}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-sm font-500 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          이전으로
        </button>
        <button
          onClick={handleStart}
          disabled={loading || !canAnalyze}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-600 bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '분석 중...' : `${totalRows.toLocaleString()}행 분석 시작`}
        </button>
      </div>
    </div>
  )
}
