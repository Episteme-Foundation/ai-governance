# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (legacy-peer-deps for claude-agent-sdk zod v4 vs project zod v3)
RUN npm ci --legacy-peer-deps

# Copy source
COPY src ./src

# Build TypeScript
RUN npm run build

# Build dashboard
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci
COPY dashboard ./dashboard
RUN cd dashboard && npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy built dashboard
COPY --from=builder /app/dashboard/dist ./dashboard/dist

# Copy governance documents (needed at runtime for context assembly)
# Remote projects store these in DB; only self-governance needs the local files
COPY PHILOSOPHY.md ./
COPY CONSTITUTION.md ./
COPY projects ./projects

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
ENV NODE_ENV=production
ENV PORT=3000

# Health check for container orchestrators
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
