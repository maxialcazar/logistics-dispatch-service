# --- Stage 1: Builder ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy config files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Install dependencies (including devDeps for building)
RUN npm ci

# Generate Prisma Client
RUN npm run prisma:generate

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# --- Stage 2: Runner ---
FROM node:20-alpine AS runner

WORKDIR /app

# Set production env
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built assets and pre-generated Prisma Client from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Create logs and uploads directories
RUN mkdir -p logs public/uploads

# Expose API port
EXPOSE 3010

# Start application
CMD ["node", "dist/index.js"]
