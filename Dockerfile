# ---- base ----
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl curl
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM deps AS builder
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 appgroup && \
    adduser  --system --uid 1001 --ingroup appgroup appuser

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma7.config.ts ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
