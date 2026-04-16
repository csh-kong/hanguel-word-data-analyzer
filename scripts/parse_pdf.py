"""PDF 텍스트 추출 스크립트.
stdin으로 PDF 바이너리를 받아 페이지별 텍스트를 JSON으로 출력한다.

출력 형식:
  {"pages": ["페이지1 내용", "페이지2 내용", ...]}
"""

import sys
import json
import io
import re


def normalize(text: str) -> str:
    """연속 공백/개행 정리."""
    return re.sub(r'\s+', ' ', text).strip()


def main() -> None:
    pdf_bytes = sys.stdin.buffer.read()
    if not pdf_bytes:
        print(json.dumps({"error": "빈 입력입니다."}), file=sys.stderr)
        sys.exit(1)

    try:
        from pypdf import PdfReader
    except ImportError:
        print(json.dumps({"error": "pypdf 패키지가 설치되지 않았습니다. pip install pypdf"}), file=sys.stderr)
        sys.exit(1)

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as e:
        print(json.dumps({"error": f"PDF 읽기 실패: {e}"}), file=sys.stderr)
        sys.exit(1)

    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ''
        text = normalize(text)
        if text:
            pages.append(text)

    if not pages:
        print(json.dumps({"error": "텍스트를 추출할 수 없습니다. 이미지 기반 PDF일 수 있습니다."}), file=sys.stderr)
        sys.exit(1)

    print(json.dumps({"pages": pages}, ensure_ascii=False))


if __name__ == '__main__':
    main()
