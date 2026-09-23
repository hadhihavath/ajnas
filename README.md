# YouTube Split Downloader ✂️🎬

A modern, high-performance web application designed to download YouTube videos and split them into custom-length parts, chapters, or equal segments.

![YouTube Split Downloader](public/css/style.css)

## ✨ Key Features

- **Any YouTube Video & Shorts**: Paste standard links, short URLs (`youtu.be`), Shorts, or embed links.
- **Smart Quality Detection**: Download in 1080p Full HD, 720p HD, 480p, 360p, or extract MP3 audio directly.
- **Interactive Visual Timeline**: Live colored segments preview with dynamic duration recalculation and timeline breakdown.
- **Flexible Split Modes**:
  - **Fixed Part Duration**: Set split length in seconds or minutes (presets for 30s TikToks/Reels, 60s, 2m, 5m, 10m, or custom).
  - **Equal Parts**: Divide any video evenly into $N$ parts (2 to 50 parts).
- **Fast FFmpeg Processing**: Fast stream copying when keyframe bounds permit, with automatic fallback to high-speed re-encoding.
- **Real-Time Live Progress**: Multi-step Server-Sent Events (SSE) tracking download speed, ETA, and segment progress.
- **In-Browser Video Preview**: Preview each split clip directly in the browser with seeking support before saving.
- **One-Click ZIP Bundle**: Download individual parts or download all parts packaged neatly in a `.zip` archive.
- **Auto-Cleanup**: Temporary download folders are automatically swept and deleted after 30 minutes.

---

## 🚀 Getting Started

### 1. Requirements
- **Node.js** (v18+ recommended, detected v24)
- **FFmpeg** (installed on system)
- **yt-dlp** (standalone executable included in `bin/yt-dlp.exe`)

### 2. Start the Server
Run the application using:
```bash
npm start
```
Or with auto-restart on changes:
```bash
npm run dev
```

### 3. Open in Browser
Navigate to:
```
http://localhost:3000
```

---

## 🛠️ Project Structure

```
Youtube Downloader/
├── bin/
│   └── yt-dlp.exe          # Standalone yt-dlp binary for Windows
├── downloads/              # Temporary download and split clips directory
├── public/                 # Client assets
│   ├── index.html          # Semantic responsive UI
│   ├── css/
│   │   └── style.css       # Obsidian & neon glassmorphism design system
│   └── js/
│       ├── app.js          # App controller & SSE progress listener
│       └── timeline.js     # Live segment calculator and visual timeline
├── server/
│   ├── server.js           # Express API endpoints & SSE broadcast
│   ├── ytService.js        # yt-dlp extraction & download manager
│   ├── ffmpegService.js    # FFmpeg splitting & thumbnail generator
│   └── cleanupService.js   # Automated temporary folder garbage collector
├── package.json
└── README.md
```
