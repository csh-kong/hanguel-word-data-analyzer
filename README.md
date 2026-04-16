# 한국어 형태소 분석 시각화

CSV / Excel 파일을 업로드하면 한국어 형태소를 추출해 데이터를 시각화합니다.

- **워드클라우드** — 단어 빈도를 시각적으로 표현
- **연관 분석** — 단어 간 동시 출현 관계를 네트워크 그래프로 표현
- **감성 분석** — 단어·문장을 긍정 / 부정 / 중립으로 분류
- **대표 문장** — 긍정·부정·제안 문장을 자동 추출
- **PDF 내보내기** — 분석 결과 전체를 PDF로 저장

---

## 빠른 시작 (Docker 권장)

Docker Desktop 하나만 설치하면 Node.js, Python, 라이브러리를 별도로 설치하지 않아도 됩니다.

### 1. Docker Desktop 설치

| OS | 다운로드 |
|---|---|
| macOS | https://docs.docker.com/desktop/install/mac-install/ |
| Windows | https://docs.docker.com/desktop/install/windows-install/ |

> Windows는 설치 과정에서 WSL2 설정이 자동으로 진행됩니다.

### 2. 저장소 클론

```bash
git clone https://github.com/your-repo/korean-wordcloud.git
cd korean-wordcloud
```

### 3. 실행

```bash
docker compose up --build
```

최초 실행 시 이미지 빌드(kiwipiepy 컴파일 포함)로 **5~10분** 소요됩니다.
빌드가 끝나면 브라우저에서 아래 주소로 접속하세요.

```
http://localhost:3000
```

### 4. 종료

```bash
# 터미널에서 Ctrl+C 또는
docker compose down
```

### 5. 재실행 (빌드 없이)

```bash
docker compose up
```

---

## 로컬 직접 실행 (Node.js + Python 환경이 이미 있는 경우)

### 사전 요구사항

| 항목 | 버전 |
|---|---|
| Node.js | 20 이상 |
| Python | 3.9 이상 |

### 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/your-repo/korean-wordcloud.git
cd korean-wordcloud

# Node.js 의존성 설치
npm install --legacy-peer-deps

# Python 의존성 설치 (형태소 분석 엔진)
pip install kiwipiepy

# 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

---

## 분석 엔진

| 엔진 | 조건 | 설명 |
|---|---|---|
| **KiwiPy** | `kiwipiepy` 설치 시 | 정확한 형태소 분석. 명사·동사·형용사 원형 추출, 감성 분석 |
| **JS Fallback** | Python 미설치 시 자동 적용 | 한글 2자 이상 단어 빈도 집계. 정확도 낮음 |

---

## 사용 방법

1. **파일 업로드** — CSV 또는 Excel(.xlsx / .xls) 파일을 드래그하거나 클릭해서 선택
2. **컬럼 선택** — 분석할 텍스트 컬럼을 선택
3. **결과 확인** — 워드클라우드, 연관 분석, 단어 목록, 대표 문장 확인
4. **PDF 저장** — 우측 상단 "PDF 저장" 버튼으로 전체 결과 내보내기

---

## 기술 스택

- **Frontend** — Next.js 14, TypeScript, Tailwind CSS
- **시각화** — react-wordcloud, D3 force simulation
- **형태소 분석** — kiwipiepy (Python)
- **파일 파싱** — PapaParse (CSV), SheetJS (Excel)
