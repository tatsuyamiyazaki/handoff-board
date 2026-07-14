# Cloud Run 用 API イメージ。
# pnpm monorepo の @handoff/shared を（ビルドせず）src 参照のまま tsx で起動する。
FROM node:22-slim

WORKDIR /app

# lockfile に合わせて pnpm を固定する。
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate

# .dockerignore で node_modules / .env / dist / .git 等は除外済み。
COPY . .

# api とその依存(shared)を動かすため devDeps(tsx 等)も入れる（--prod にしない）。
RUN pnpm install --frozen-lockfile

# Cloud Run は $PORT(=8080) を注入する。server.ts は process.env.PORT を参照。
ENV PORT=8080
EXPOSE 8080

# 本番起動（../.env に依存しない。環境変数は Cloud Run 側で注入する）。
CMD ["pnpm", "--filter", "@handoff/api", "run", "start:prod"]
