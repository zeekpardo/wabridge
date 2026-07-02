# syntax=docker/dockerfile:1
#
# Production image for the WABridge SaaS app (apps/saas).
# Multi-stage: build the monorepo, then ship only Next.js's standalone output.
# Used by Railway (railway.toml -> builder = "dockerfile").

# ---- Stage 1: Build ----
FROM node:22-bookworm-slim AS builder

# openssl is required by Prisma's query engine.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@11.3.0 --activate

WORKDIR /app
COPY . .

# `allowBuilds` in pnpm-workspace.yaml lets prisma / prisma-zod-generator / sharp /
# esbuild run their build scripts during this install (pnpm blocks them by default).
RUN pnpm install --frozen-lockfile

# Generate the Prisma client (+ zod). A dummy DATABASE_URL is fine — generation
# never connects; prisma.config.ts falls back to a placeholder when unset anyway.
RUN cd packages/database && \
    DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma generate --no-hints

# Public URLs are inlined into the client bundle at build time, so they must be
# present here (Railway passes them as --build-arg). Server-only secrets are NOT
# needed at build; dummies keep any build-time imports happy.
ARG NEXT_PUBLIC_SAAS_URL
ARG NEXT_PUBLIC_MARKETING_URL
ARG NEXT_PUBLIC_DOCS_URL
# next build for this app exceeds Node's default heap in a container; raise it
# to avoid OOM/SIGABRT. Applies on Railway too (baked into the build step).
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    BETTER_AUTH_SECRET="dummy-build-secret-not-used-at-runtime" \
    NODE_OPTIONS="--max-old-space-size=4096" \
    NEXT_PUBLIC_SAAS_URL=${NEXT_PUBLIC_SAAS_URL} \
    NEXT_PUBLIC_MARKETING_URL=${NEXT_PUBLIC_MARKETING_URL} \
    NEXT_PUBLIC_DOCS_URL=${NEXT_PUBLIC_DOCS_URL} \
    pnpm --filter saas build

# Fold static assets + the public dir into the standalone tree so the runtime
# serves them (Next standalone copies neither automatically). public/ holds the
# nav Logo (/logo.png).
RUN cp -r /app/apps/saas/.next/static /app/apps/saas/.next/standalone/apps/saas/.next/static 2>/dev/null || true && \
    cp -r /app/apps/saas/public /app/apps/saas/.next/standalone/apps/saas/public 2>/dev/null || true

# ---- Stage 2: Runtime ----
FROM node:22-bookworm-slim AS runner

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Preserve the apps/saas/... path so the start command resolves.
COPY --from=builder /app/apps/saas/.next/standalone ./apps/saas/.next/standalone
COPY --from=builder /app/apps/saas/.next/static ./apps/saas/.next/standalone/apps/saas/.next/static

EXPOSE 3000

CMD ["node", "apps/saas/.next/standalone/apps/saas/server.js"]
