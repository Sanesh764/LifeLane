# Production Dockerfile for AmbuRoute Backend Web Service on Render
FROM node:20-bookworm-slim

# Install system ffmpeg for voice assistant audio transcoding and ca-certificates for secure HTTPS/VAPID calls
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first for optimal layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy backend source code
COPY . .

# Set default production environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose service port
EXPOSE 5000

# Run as non-root node user for container security
USER node

# Start server using exec-form CMD
CMD ["node", "server.js"]
