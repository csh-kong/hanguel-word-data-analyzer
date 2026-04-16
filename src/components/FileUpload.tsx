'use client'

import { useCallback, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import type { ParsedFile } from '@/types'

type Props = {
  onParsed: (files: ParsedFile[]) => void
}

const MAX_FILE_SIZE_MB = 20
const ACCEPTED_EXTS = ['csv', 'xlsx', 'xls', 'pdf']

function detectCsvEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return 'utf-8'
  } catch {
    return 'euc-kr'
  }
}

async function parsePdfFile(file: File): Promise<ParsedFile> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
  const json = await res.json() as { pages?: string[]; error?: string }

  if (!res.ok || json.error) throw new Error(json.error ?? 'PDF 파싱 실패')

  const rows = (json.pages ?? []).map((text) => ({ 내용: text }))
  return { id: `${Date.now()}-${Math.random()}`, filename: file.name, headers: ['내용'], rows }
}

function parseOneFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ACCEPTED_EXTS.includes(ext)) return Promise.reject(new Error('지원하지 않는 형식입니다.'))
  if (ext === 'pdf') return parsePdfFile(file)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buf = e.target?.result as ArrayBuffer
        let wb: XLSX.WorkBook
        if (ext === 'csv') {
          const enc = detectCsvEncoding(buf)
          wb = XLSX.read(new TextDecoder(enc).decode(buf), { type: 'string' })
        } else {
          wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
        }
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        if (json.length === 0) { reject(new Error('파일이 비어 있습니다.')); return }
        const headers = Object.keys(json[0])
        const rows = json.map((row) =>
          Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))
        ) as Record<string, string>[]
        resolve({ id: `${Date.now()}-${Math.random()}`, filename: file.name, headers, rows })
      } catch {
        reject(new Error('파싱에 실패했습니다.'))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export default function FileUpload({ onParsed }: Props) {
  const [files, setFiles] = useState<ParsedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function addFiles(rawFiles: File[]) {
    setErrors([])
    const errs: string[] = []
    const parsed: ParsedFile[] = []

    for (const file of rawFiles) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        errs.push(`${file.name} — 크기 초과 (최대 ${MAX_FILE_SIZE_MB}MB)`)
        continue
      }
      try {
        parsed.push(await parseOneFile(file))
      } catch (err) {
        errs.push(`${file.name} — ${err instanceof Error ? err.message : '오류'}`)
      }
    }

    if (errs.length) setErrors(errs)
    if (parsed.length) {
      setFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.filename))
        return [...prev, ...parsed.filter((f) => !existingNames.has(f.filename))]
      })
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragging(false), [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const totalRows = files.reduce((s, f) => s + f.rows.length, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="파일 업로드 영역"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-4
          rounded-2xl border-2 border-dashed px-8 py-12 cursor-pointer
          transition-colors select-none
          ${dragging
            ? 'border-violet-400 bg-violet-950/30'
            : 'border-zinc-700 bg-zinc-900 hover:border-violet-600 hover:bg-zinc-900/80'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls,.pdf"
          className="sr-only"
          onChange={handleInputChange}
        />
        <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl">
          📂
        </div>
        <div className="text-center">
          <p className="text-white font-500 text-base">
            파일을 여기에 드래그하거나 클릭해서 선택하세요
          </p>
          <p className="mt-1 text-zinc-500 text-sm">
            CSV, Excel(.xlsx / .xls), PDF · 여러 파일 동시 업로드 가능 · 최대 {MAX_FILE_SIZE_MB}MB/개
          </p>
        </div>
        {dragging && (
          <div className="absolute inset-0 rounded-2xl bg-violet-500/10 flex items-center justify-center pointer-events-none">
            <p className="text-violet-300 font-500 text-lg">놓으세요!</p>
          </div>
        )}
      </div>

      {/* Parsed file list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg shrink-0">
                  {f.filename.endsWith('.pdf') ? '📑' : '📄'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{f.filename}</p>
                  <p className="text-xs text-zinc-500">
                    {f.filename.endsWith('.pdf')
                      ? `${f.rows.length.toLocaleString()}페이지`
                      : `${f.rows.length.toLocaleString()}행 · ${f.headers.length}개 컬럼`}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(f.id) }}
                className="shrink-0 ml-3 text-zinc-600 hover:text-red-400 transition-colors text-lg leading-none"
                aria-label="파일 제거"
              >
                ×
              </button>
            </div>
          ))}

          {/* Summary + proceed */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-zinc-500">
              총{' '}
              <span className="text-white">{totalRows.toLocaleString()}</span>행 ·{' '}
              <span className="text-white">{files.length}</span>개 파일
            </p>
            <button
              onClick={() => onParsed(files)}
              className="px-5 py-2 rounded-xl text-sm font-600 bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="p-3 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm space-y-1">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
    </div>
  )
}
