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

# Configure npm/pnpm registry for faster downloads in China
RUN npm config set registry ${NPM_REGISTRY} \
    && pnpm config set registry ${NPM_REGISTRY}

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

# Install all dependencies (--ignore-scripts: postinstall 需要源码，在 builder 阶段执行)
RUN pnpm install --ignore-scripts

# -----------------------------------------------------------------------------
# Builder stage: Build all packages and apps
# -----------------------------------------------------------------------------
FROM deps AS builder

# Copy source code (including pre-generated Prisma client in apps/api/generated/)
COPY . .

# Build shared packages first
RUN pnpm turbo run build --filter=@repo/validators --filter=@repo/constants --filter=@repo/utils --filter=@repo/contracts

# Build API (uses pre-generated Prisma client and DB modules)
RUN cd apps/api && pnpm run build

# Build web app
RUN pnpm turbo run build --filter=@repo/web

# -----------------------------------------------------------------------------
# API Production stage: NestJS backend
# -----------------------------------------------------------------------------
FROM ${BASE_NODE_IMAGE} AS api

ARG NPM_REGISTRY

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Configure npm/pnpm registry
RUN npm config set registry ${NPM_REGISTRY} \
    && pnpm config set registry ${NPM_REGISTRY}

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/constants/package.json ./packages/constants/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/validators/package.json ./packages/validators/

# Install production dependencies only (--ignore-scripts: 跳过 postinstall)
RUN pnpm install --ignore-scripts --prod

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
ENV PORT=3100

EXPOSE 3100

WORKDIR /app/apps/api

CMD ["node", "-r", "tsconfig-paths/register", "dist/apps/api/src/main"]

# -----------------------------------------------------------------------------
# Web Production stage: Next.js frontend
# -----------------------------------------------------------------------------
FROM ${BASE_NODE_IMAGE} AS web

ARG NPM_REGISTRY

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Configure npm/pnpm registry
RUN npm config set registry ${NPM_REGISTRY} \
    && pnpm config set registry ${NPM_REGISTRY}

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
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

# Install production dependencies only (--ignore-scripts: 跳过 postinstall，使用 builder 的预构建文件)
RUN pnpm install --ignore-scripts

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
