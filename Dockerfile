FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests for all workspaces
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/web/package*.json ./apps/web/
COPY apps/api/package*.json ./apps/api/

# Install all dependencies (including devDependencies for TypeScript & Vite build)
RUN npm ci

# Copy build scripts BEFORE the build step
COPY scripts/ ./scripts/

# Copy source files for shared library, web frontend, and API
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
COPY apps/api/ ./apps/api/

# Build shared library, then web frontend SPA, then backend API (postbuild bundles the SPA)
RUN npm run build --workspace=@nexus-ways/shared && \
    npm run build --workspace=@nexus-ways/web && \
    npm run build --workspace=@nexus-ways/api

# Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Copy dependency manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/web/package*.json ./apps/web/
COPY apps/api/package*.json ./apps/api/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled artifacts from builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/public ./apps/api/public

EXPOSE 4000

# Start NestJS backend (binds to 0.0.0.0 and process.env.PORT)
CMD ["node", "apps/api/dist/main"]
