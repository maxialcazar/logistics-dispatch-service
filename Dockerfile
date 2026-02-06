# --- Stage 1: Builder ---
FROM node:18-alpine AS builder

WORKDIR /app

# Copy config files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install dependencies (including devDeps for building)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# --- Stage 2: Runner ---
FROM node:18-alpine AS runner

WORKDIR /app

# Set production env
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Generate Prisma Client for production runtime
RUN npx prisma generate

# Create logs directory
RUN mkdir logs

# Expose API port
EXPOSE 3001

# Start application
CMD ["npm", "start"]
