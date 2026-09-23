# Production Dockerfile for Hostinger VPS / Docker Hosting
FROM node:22-bookworm-slim

# Install system dependencies: ffmpeg, python3, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp binary for Linux
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure downloads directory exists
RUN mkdir -p downloads && chmod 777 downloads

# Set environment defaults
ENV PORT=3000
ENV NODE_ENV=production
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=ffmpeg

# Expose server port
EXPOSE 3000

# Start server
CMD ["node", "server/server.js"]
