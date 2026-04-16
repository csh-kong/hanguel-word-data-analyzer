import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())

  return new Promise<NextResponse>((resolve) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'parse_pdf.py')
    const proc = spawn('python3', [scriptPath], { timeout: 30_000 })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        let errMsg = '텍스트를 추출할 수 없습니다.'
        try { errMsg = JSON.parse(stderr).error ?? errMsg } catch { /* ignore */ }
        resolve(NextResponse.json({ error: errMsg }, { status: 422 }))
        return
      }
      try {
        const result = JSON.parse(stdout) as { pages: string[] }
        resolve(NextResponse.json(result))
      } catch {
        resolve(NextResponse.json({ error: '응답 파싱 실패' }, { status: 500 }))
      }
    })

    proc.on('error', () => {
      resolve(NextResponse.json({ error: 'Python 실행 실패' }, { status: 500 }))
    })

    proc.stdin.write(buf)
    proc.stdin.end()
  })
}
