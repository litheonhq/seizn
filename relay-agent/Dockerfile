# Seizn Relay Agent
# Lightweight Docker image for edge federated search

FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production image
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S seizn && \
    adduser -S seizn -u 1001 -G seizn

# Install production dependencies only
COPY package*.json ./
RUN npm ci --production && \
    npm cache clean --force

# Copy built files
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R seizn:seizn /app

# Switch to non-root user
USER seizn

# Environment variables (override at runtime)
ENV NODE_ENV=production
ENV PORT=3001
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE 3001

# Start the relay agent
CMD ["node", "dist/index.js"]
