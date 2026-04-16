export type ParsedFile = {
  id: string
  filename: string
  headers: string[]
  rows: Record<string, string>[]
}

export type Sentiment = 'positive' | 'negative' | 'neutral'
export type WordFreq = { text: string; value: number; sentiment: Sentiment }
export type Association = { source: string; target: string; weight: number }

export type AnalysisResult = {
  words: WordFreq[]
  associations: Association[]
  engine: string
  positiveSentences: string[]
  negativeSentences: string[]
  suggestionSentences: string[]
}
