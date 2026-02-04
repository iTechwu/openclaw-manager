# =============================================================================
# ClawBot Manager - Multi-stage Dockerfile for pnpm Monorepo
# =============================================================================
# Build targets:
#   - api: NestJS backend service
#   - web: Next.js frontend service
#
# Build args (由 .env 通过 docker-compose 传入):
#   BASE_NODE_IMAGE: Node.js 基础镜像
#   NPM_REGISTRY: npm 镜像源 (默认使用 npmmirror.com)
#
# Usage:
#   docker build --target api -t clawbot-api .
#   docker build --target web -t clawbot-web .
# =============================================================================

ARG BASE_NODE_IMAGE=node:24.1-slim
ARG NPM_REGISTRY=https://registry.npmmirror.com

# -----------------------------------------------------------------------------
# Base stage: Common dependencies and pnpm setup
# -----------------------------------------------------------------------------
FROM ${BASE_NODE_IMAGE} AS base

ARG NPM_REGISTRY

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Configure npm/pnpm registry with retry and timeout settings for reliability
RUN npm config set registry ${NPM_REGISTRY} \
    && pnpm config set registry ${NPM_REGISTRY} \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-retry-mintimeout 20000 \
    && pnpm config set fetch-retry-maxtimeout 120000 \
    && pnpm config set fetch-timeout 300000 \
    && pnpm config set network-concurrency 4

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# -----------------------------------------------------------------------------
# Dependencies stage: Install all dependencies
# -----------------------------------------------------------------------------
FROM base AS deps

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy all package.json files from workspaces
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/constants/package.json ./packages/constants/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/validators/package.json ./packages/validators/

# Install all dependencies with retry logic
# If npmmirror fails, fallback to official registry
RUN pnpm install --ignore-scripts || \
    (echo "Retrying with official npm registry..." && \
     pnpm config set registry https://registry.npmjs.org && \
     pnpm install --ignore-scripts)

# -----------------------------------------------------------------------------
# Builder stage: Build all packages and apps
# -----------------------------------------------------------------------------
FROM deps AS builder

# Copy source code
COPY . .

# Generate Prisma client (required for TypeScript compilation)
# This generates types to apps/api/generated/prisma-client
RUN cd apps/api && pnpm exec prisma generate

# Build shared packages first
RUN pnpm turbo run build --filter=@repo/validators --filter=@repo/constants --filter=@repo/utils --filter=@repo/contracts

# Build API
RUN cd apps/api && pnpm run build

# Build web app
RUN pnpm turbo run build --filter=@repo/web

# -----------------------------------------------------------------------------
# Production runtime base: Common runtime setup for production stages
# -----------------------------------------------------------------------------
FROM ${BASE_NODE_IMAGE} AS prod-runtime

ARG NPM_REGISTRY

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Configure npm/pnpm registry with retry and timeout settings
RUN npm config set registry ${NPM_REGISTRY} \
    && pnpm config set registry ${NPM_REGISTRY} \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-retry-mintimeout 20000 \
    && pnpm config set fetch-retry-maxtimeout 120000 \
    && pnpm config set fetch-timeout 300000 \
    && pnpm config set network-concurrency 4

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# -----------------------------------------------------------------------------
# Production dependencies stage: Install prod deps once, reuse for api/web
# -----------------------------------------------------------------------------
FROM prod-runtime AS prod-deps

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy all package.json files from workspaces
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/constants/package.json ./packages/constants/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/validators/package.json ./packages/validators/

# Install production dependencies with retry logic
# Use shamefully-hoist to ensure all deps are in root node_modules for easier copying
RUN pnpm install --ignore-scripts --prod --shamefully-hoist || \
    (echo "Retrying with official npm registry..." && \
     pnpm config set registry https://registry.npmjs.org && \
     pnpm install --ignore-scripts --prod --shamefully-hoist)

# -----------------------------------------------------------------------------
# API Production stage: NestJS backend
# -----------------------------------------------------------------------------
FROM prod-runtime AS api

# Copy production dependencies from prod-deps stage
# Only copy root node_modules since we use shamefully-hoist
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy package.json files for pnpm workspace resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/constants/package.json ./packages/constants/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/validators/package.json ./packages/validators/

# Copy built files from builder (including generated Prisma client)
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/generated ./apps/api/generated
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/constants/dist ./packages/constants/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/utils/dist ./packages/utils/dist
COPY --from=builder /app/packages/validators/dist ./packages/validators/dist

# Environment
ENV NODE_ENV=production
ENV PORT=3200

EXPOSE 3200

WORKDIR /app/apps/api

CMD ["node", "-r", "tsconfig-paths/register", "dist/apps/api/src/main"]

# -----------------------------------------------------------------------------
# Web Production stage: Next.js frontend
# -----------------------------------------------------------------------------
FROM prod-runtime AS web

# Copy production dependencies from prod-deps stage
# Only copy root node_modules since we use shamefully-hoist
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy package.json files for pnpm workspace resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/constants/package.json ./packages/constants/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/validators/package.json ./packages/validators/

# Copy built files from builder
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/constants/dist ./packages/constants/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/ui/dist ./packages/ui/dist
COPY --from=builder /app/packages/utils/dist ./packages/utils/dist
COPY --from=builder /app/packages/validators/dist ./packages/validators/dist

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/apps/web

CMD ["pnpm", "start"]
