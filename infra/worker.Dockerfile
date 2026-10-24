# Background worker (pg-boss): places calls, dispatches campaign waves, syncs results.
# It is a long-running process, so it runs on an always-on host (Railway / Render / Fly / a VPS), not on Vercel.
# Build from the repo root:  docker build -f infra/worker.Dockerfile -t vaidik-worker .
FROM node:22-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . .
RUN pnpm install --frozen-lockfile --filter @vernacular/worker... --filter @vernacular/api...
ENV NODE_ENV=production
USER node
# DATABASE_MIGRATION_URL set → (re)install the job queues first (idempotent), then start the worker.
CMD ["sh", "-c", "if [ -n \"$DATABASE_MIGRATION_URL\" ]; then pnpm jobs:install; fi && cd apps/worker && exec pnpm exec tsx src/index.ts"]
