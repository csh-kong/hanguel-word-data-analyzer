# ── 1단계: 빌드 ───────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Node 의존성 설치
COPY package*.json ./
RUN npm install --legacy-peer-deps

# 소스 복사 후 Next.js 빌드
COPY . .
RUN npm run build

# ── 2단계: 런타임 ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Python3 + pip + 빌드 도구 (kiwipiepy 컴파일에 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 설치
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# 빌드 결과물 복사
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node_modules/.bin/next", "start"]
