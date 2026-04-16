import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '한국어 형태소 분석',
  description: 'CSV/Excel 파일에서 한국어 텍스트를 분석해 워드클라우드를 생성합니다.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-zinc-950 text-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
