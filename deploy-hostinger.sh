#!/usr/bin/env bash
# Automated Hostinger VPS Deployment Script
set -e

echo "=========================================================="
echo "🚀 Deploying YouTube Split Downloader on Hostinger VPS"
echo "=========================================================="

# 1. Check & Install Docker / Docker Compose if missing
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable --now docker
fi

# 2. Ensure downloads directory exists
mkdir -p downloads
chmod 777 downloads

# 3. Build & Launch Docker Container
echo "🐳 Building and starting Docker container..."
docker compose down || true
docker compose build --no-cache
docker compose up -d

# 4. Check Container Status
echo "✅ Checking running containers..."
docker ps --filter "name=youtube-split-downloader"

echo "=========================================================="
echo "🎉 Deployment Complete!"
echo "Server is running on port 3000."
echo "Configure Nginx with SSL (Certbot) to point your domain to http://127.0.0.1:3000"
echo "=========================================================="
