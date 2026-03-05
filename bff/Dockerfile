# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies (including devDeps for tsc)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/          ./src/

RUN npm run build

# ─── Stage 2: Production runtime ─────────────────────────────────────────────
FROM node:22-alpine AS production

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install production-only dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JS from build stage
COPY --from=build /app/dist ./dist

# Create data directory for webhook dedupe persistence
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Own the working directory
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

# Healthcheck — lightweight wget (available in alpine, no curl install needed)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
