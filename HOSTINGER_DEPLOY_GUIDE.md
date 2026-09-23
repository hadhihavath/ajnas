# Complete Hostinger Deployment & hadhihavath.github.io Setup Guide

This guide walks you through deploying the YouTube Split Downloader on **Hostinger VPS** using Docker and connecting it to your GitHub Pages website **`hadhihavath.github.io`**.

---

## 🧭 System Architecture

```
┌─────────────────────────────────┐           ┌──────────────────────────────────────┐
│  hadhihavath.github.io          │           │  Hostinger VPS (Docker Container)    │
│  (GitHub Pages - Static UI)     │  ======>  │  - Node.js Express API (Port 3000)   │
│  - index.html                   │   CORS    │  - Linux FFmpeg 9.0+                 │
│  - style.css                    │   HTTPS   │  - yt-dlp standalone                 │
│  - timeline.js & app.js         │           │  - Nginx Reverse Proxy with SSL      │
└─────────────────────────────────┘           └──────────────────────────────────────┘
```

> **Why this setup?**  
> GitHub Pages (`hadhihavath.github.io`) is a static web host that cannot run Node.js, Python, or FFmpeg video processing. Hostinger VPS provides the server horsepower with root access and FFmpeg to download and split videos, while GitHub Pages serves your public web interface.

---

## 🚀 Part 1: Deploying Backend to Hostinger VPS

### Step 1: Connect to your Hostinger VPS via SSH
Open your terminal or PowerShell on your computer and connect to your Hostinger VPS:
```bash
ssh root@YOUR_HOSTINGER_VPS_IP
```
*(Replace `YOUR_HOSTINGER_VPS_IP` with your actual VPS IP from your Hostinger hPanel dashboard).*

---

### Step 2: Upload or Clone the Code to your VPS
You can clone your GitHub repository:
```bash
git clone https://github.com/hadhihavath/YOUR_REPO_NAME.git /var/www/youtube-downloader
cd /var/www/youtube-downloader
```
Or upload the project folder directly via SFTP/FileZilla.

---

### Step 3: Run the Automated Deployment Script
We have included a 1-click deployment script:
```bash
chmod +x deploy-hostinger.sh
./deploy-hostinger.sh
```

**What this does automatically:**
1. Installs Docker and Docker Compose (if not already installed).
2. Builds the lightweight Linux container (`node:22-bookworm-slim`) containing `ffmpeg`, `python3`, and `yt-dlp`.
3. Starts the background service on port `3000` with automated crash restarts.

You can verify that the container is running:
```bash
docker ps
```

---

### Step 4: Configure Nginx & Free SSL (Let's Encrypt)
To connect securely from `https://hadhihavath.github.io` without browser "Mixed Content" warnings, your Hostinger backend should have an SSL certificate.

1. **Install Nginx & Certbot** (if not already installed):
   ```bash
   apt update && apt install -y nginx certbot python3-certbot-nginx
   ```

2. **Copy the included Nginx config**:
   ```bash
   cp nginx.conf /etc/nginx/sites-available/youtube-downloader
   ```

3. **Edit the server name in the config**:
   ```bash
   nano /etc/nginx/sites-available/youtube-downloader
   ```
   Replace `YOUR_HOSTINGER_DOMAIN_OR_IP` with your domain (e.g. `api.yourdomain.com` or your VPS IP).

4. **Enable the site**:
   ```bash
   ln -s /etc/nginx/sites-available/youtube-downloader /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   ```

5. **Obtain Free SSL Certificate (HTTPS)**:
   ```bash
   certbot --nginx -d api.yourdomain.com
   ```

---

## 🌐 Part 2: Connecting hadhihavath.github.io

### Option A: Using the Automated GitHub Actions Workflow (Recommended)
1. In your GitHub repository settings, go to:
   **Settings > Pages > Build and deployment > Source**
   Select: **GitHub Actions**.
2. Commit and push your code to your `hadhihavath.github.io` repository:
   ```bash
   git add .
   git commit -m "Deploy YouTube Splitter to GitHub Pages"
   git push origin main
   ```
3. The included workflow `.github/workflows/deploy-gh-pages.yml` will automatically build and publish your static website to `https://hadhihavath.github.io`.

---

### Option B: Point the Frontend to your Hostinger Backend
1. In `public/js/config.js`, update `DEFAULT_HOSTINGER_API`:
   ```javascript
   DEFAULT_HOSTINGER_API: 'https://api.yourdomain.com', // Or http://YOUR_HOSTINGER_IP:3000
   ```
2. Alternatively, open **`https://hadhihavath.github.io`** in your browser:
   - Click the **"Hostinger Backend"** button at the top header.
   - Enter your Hostinger backend URL (e.g. `https://api.yourdomain.com`).
   - Click **"Save & Connect"**. The setting is automatically saved in your browser and remembered across visits!

---

## 🔍 Testing & Verification

1. **Verify Backend Status**:
   ```bash
   curl http://localhost:3000/api/calculate-segments -X POST -H "Content-Type: application/json" -d '{"totalDuration":60,"mode":"duration","partDuration":30}'
   ```
   Should return:
   `{"success":true,"segments":[{"partIndex":1,...},{"partIndex":2,...}]}`

2. **Verify CORS**:
   ```bash
   curl -I -H "Origin: https://hadhihavath.github.io" http://localhost:3000/api/info
   ```
   Should include:
   `Access-Control-Allow-Origin: https://hadhihavath.github.io`

3. **Visit hadhihavath.github.io**:
   - Paste a YouTube URL (or click sample chip "Me at the zoo").
   - Click "Inspect Video".
   - Split parts and enjoy downloading!

---

## 🍪 Part 3: YouTube Bot Check ("Sign in to confirm you're not a bot")

### Why does this happen?
YouTube sometimes flags cloud datacenter IPs (like Hostinger, Hetzner, AWS) with bot challenges when requesting video streams.

### Solution 1: Automated Mobile Player Fallback (Built-in)
The backend is already configured with `--extractor-args "youtube:player_client=android,ios,mweb,web"`. This automatically routes requests through YouTube's mobile API (Android & iOS InnerTube), which bypasses desktop bot verification challenges without requiring cookies.

### Solution 2: Easy Cookies Authentication (100% Reliable)
If YouTube requires authentication for a specific video on your Hostinger VPS, you can provide a `cookies.txt` file in seconds:

#### Method A: Via the Web UI (Easiest)
1. Install a browser extension such as **"Get cookies.txt LOCALLY"** (available on Chrome Web Store & Firefox Add-ons).
2. Visit [YouTube.com](https://www.youtube.com) while signed into your account.
3. Click the extension icon and copy or export your cookies text.
4. On your web app (`https://hadhihavath.github.io`), click **"Hostinger Backend"** at the top.
5. Paste the cookie content into the **"YouTube Cookies (Bot-Check Bypass)"** box and click **"Save Cookies to Server"**.
6. The badge will immediately switch to **"🍪 Cookies Active"**!

#### Method B: Direct File on VPS
Drop your `cookies.txt` file directly into your server directory:
```bash
nano /var/www/youtube-downloader/cookies.txt
# Paste your exported cookies and save (Ctrl+O, Enter, Ctrl+X)
```
The backend automatically detects `cookies.txt` on startup and attaches `--cookies cookies.txt` to all `yt-dlp` requests.
