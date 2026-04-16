'use client'

import { useState } from 'react'
import FileUpload from '@/components/FileUpload'
import ColumnSelector from '@/components/ColumnSelector'
import WordCloudView from '@/components/WordCloudView'
import type { ParsedFile, WordFreq, Association } from '@/types'

type Step = 'upload' | 'select' | 'result'

export default function Home() {
  const [step, setStep] = useState<Step>('upload')
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([])
  const [words, setWords] = useState<WordFreq[]>([])
  const [associations, setAssociations] = useState<Association[]>([])
  const [engine, setEngine] = useState<string>('')
  const [positiveSentences, setPositiveSentences] = useState<string[]>([])
  const [negativeSentences, setNegativeSentences] = useState<string[]>([])
  const [suggestionSentences, setSuggestionSentences] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFilesParsed(files: ParsedFile[]) {
    setParsedFiles(files)
    setStep('select')
    setError(null)
  }

  async function handleAnalyze(text: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `서버 오류 (${res.status})`)
      }
      const data = await res.json()
      setWords(data.words ?? [])
      setAssociations(data.associations ?? [])
      setEngine(data.engine ?? '')
      setPositiveSentences(data.positiveSentences ?? [])
      setNegativeSentences(data.negativeSentences ?? [])
      setSuggestionSentences(data.suggestionSentences ?? [])
      setStep('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setStep('upload')
    setParsedFiles([])
    setWords([])
    setAssociations([])
    setEngine('')
    setPositiveSentences([])
    setNegativeSentences([])
    setSuggestionSentences([])
    setError(null)
  }

  const STEPS: { key: Step; label: string }[] = [
    { key: 'upload', label: '파일 업로드' },
    { key: 'select', label: '컬럼 선택' },
    { key: 'result', label: '결과' },
  ]

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-700 tracking-tight text-white">
          한국어 형태소 분석
        </h1>
        <p className="mt-2 text-zinc-400 text-sm">
          CSV / Excel 파일을 업로드하면 한국어 형태소를 추출해 데이터를 시각화합니다.
        </p>
      </header>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-10">
        {STEPS.map(({ key, label }, i) => {
          const isActive = step === key
          const isDone =
            (key === 'upload' && (step === 'select' || step === 'result')) ||
            (key === 'select' && step === 'result')
          return (
            <div key={key} className="flex items-center gap-3">
              {i > 0 && (
                <div className={`h-px w-8 ${isDone || isActive ? 'bg-violet-500' : 'bg-zinc-700'}`} />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-600 transition-colors ${
                    isActive
                      ? 'bg-violet-500 text-white'
                      : isDone
                        ? 'bg-violet-800 text-violet-300'
                        : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {isDone ? '✓' : i + 1}
                </div>
                <span className={`text-sm hidden sm:block ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                  {label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="w-full max-w-3xl">
        {step === 'upload' && <FileUpload onParsed={handleFilesParsed} />}

        {step === 'select' && parsedFiles.length > 0 && (
          <ColumnSelector
            files={parsedFiles}
            loading={loading}
            onAnalyze={handleAnalyze}
            onBack={handleReset}
          />
        )}

        {step === 'result' && (
          <WordCloudView
            words={words}
            associations={associations}
            engine={engine}
            positiveSentences={positiveSentences}
            negativeSentences={negativeSentences}
            suggestionSentences={suggestionSentences}
            onReset={handleReset}
            onBackToSelect={() => setStep('select')}
          />
        )}

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-950 border border-red-800 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-4 border-zinc-700 border-t-violet-500 animate-spin" />
            <p className="text-zinc-400 text-sm">형태소 분석 중...</p>
          </div>
        )}
      </div>
    </main>
  )
}
