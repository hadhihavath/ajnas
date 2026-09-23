const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

const ytService = require('./ytService');
const ffmpegService = require('./ffmpegService');
const cleanupService = require('./cleanupService');

const LOCAL_TMP = path.join(__dirname, '..', 'downloads', 'tmp');
if (!fs.existsSync(LOCAL_TMP)) {
  try { fs.mkdirSync(LOCAL_TMP, { recursive: true }); } catch (_) {}
}
process.env.TMPDIR = LOCAL_TMP;
process.env.TEMP = LOCAL_TMP;
process.env.TMP = LOCAL_TMP;

const app = express();
const PORT = process.env.PORT || 3000;

// Configurable CORS origins (Supports hadhihavath.github.io, local dev, and custom domains)
const allowedOrigins = [
  'https://hadhihavath.github.io',
  'https://seashell-okapi-543184.hostingersite.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000'
];

if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach(o => {
    const trimmed = o.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    if (origin.endsWith('.github.io') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// In-memory Job Store
const jobs = new Map();

// Helper to sanitize filenames
function sanitizeFilename(name) {
  return (name || 'video')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

// Broadcast progress event to all connected SSE clients for a job
function broadcastProgress(job) {
  if (!job || !job.sseClients) return;
  const payload = JSON.stringify({
    status: job.status,
    stage: job.stage,
    percent: job.percent,
    message: job.message,
    speed: job.speed || '',
    eta: job.eta || '',
    currentPart: job.currentPart || 0,
    totalParts: job.totalParts || 0,
    parts: job.parts || [],
    error: job.error || null
  });

  job.sseClients.forEach((res) => {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (err) {
      // client likely closed
    }
  });
}

// Start temporary files cleanup
cleanupService.startCleanupCron();

// --- API Endpoints ---

/**
 * Extract YouTube metadata
 */
app.post('/api/info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'YouTube URL is required.' });
    }

    const info = await ytService.getVideoInfo(url);
    res.json({ success: true, data: info });
  } catch (err) {
    console.error('API /info error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Preview / recalculate segments dynamically without downloading
 */
app.post('/api/calculate-segments', (req, res) => {
  try {
    const { totalDuration, mode, partDuration, numParts, customRanges } = req.body;
    const segments = ffmpegService.calculateSegments({
      totalDuration,
      mode,
      partDuration,
      numParts,
      customRanges
    });
    res.json({ success: true, segments });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Start download and split job
 */
app.post('/api/split', async (req, res) => {
  try {
    const { url, quality = '720p', mode = 'duration', partDuration = 60, numParts = 2, customRanges, videoTitle, totalDuration } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'YouTube URL is required.' });
    }

    const jobId = uuidv4();
    const jobDir = path.join(cleanupService.DOWNLOADS_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const isAudio = quality === 'audio';
    const sourceExt = isAudio ? 'mp3' : 'mp4';
    const sourcePath = path.join(jobDir, `source.${sourceExt}`);

    const job = {
      id: jobId,
      url,
      quality,
      videoTitle: videoTitle || 'YouTube Video',
      jobDir,
      sourcePath,
      isAudio,
      status: 'pending',
      stage: 'initializing',
      percent: 0,
      message: 'Initializing task...',
      parts: [],
      error: null,
      sseClients: []
    };

    jobs.set(jobId, job);
    res.json({ success: true, jobId });

    // Process job asynchronously in the background
    (async () => {
      try {
        job.status = 'processing';
        job.stage = 'downloading';
        job.message = 'Downloading video stream from YouTube...';
        broadcastProgress(job);

        // 1. Download source from YouTube
        await ytService.downloadSource({
          url,
          quality,
          outputPath: sourcePath,
          onProgress: (p) => {
            job.stage = 'downloading';
            job.percent = p.percent;
            job.speed = p.speed;
            job.eta = p.eta;
            job.message = `Downloading from YouTube: ${p.percent.toFixed(1)}% (${p.speed || 'fast'}, ETA: ${p.eta || '--'})`;
            broadcastProgress(job);
          }
        });

        // 2. Calculate segments
        const durationToUse = Number(totalDuration) || 60;
        const segments = ffmpegService.calculateSegments({
          totalDuration: durationToUse,
          mode,
          partDuration,
          numParts,
          customRanges
        });

        if (segments.length === 0) {
          throw new Error('No valid split segments calculated.');
        }

        // 3. Split with FFmpeg
        job.stage = 'splitting';
        job.percent = 0;
        job.totalParts = segments.length;
        job.message = `Splitting into ${segments.length} parts...`;
        broadcastProgress(job);

        const parts = await ffmpegService.splitMedia({
          sourcePath,
          outputDir: jobDir,
          segments,
          isAudio,
          onProgress: (p) => {
            job.stage = 'splitting';
            job.percent = p.percent;
            job.currentPart = p.currentPart;
            job.totalParts = p.totalParts;
            job.message = p.message;
            broadcastProgress(job);
          }
        });

        // 4. Finished successfully
        job.status = 'completed';
        job.stage = 'ready';
        job.percent = 100;
        job.parts = parts;
        job.message = `Successfully prepared ${parts.length} parts!`;
        broadcastProgress(job);

      } catch (err) {
        console.error(`[Job ${jobId} error]:`, err);
        job.status = 'error';
        job.error = err.message || 'Processing failed';
        job.message = `Error: ${job.error}`;
        broadcastProgress(job);
      }
    })();

  } catch (err) {
    console.error('API /split error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * SSE endpoint for live progress streaming
 */
app.get('/api/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // For reverse proxies if any
  res.flushHeaders();

  job.sseClients.push(res);

  // Send initial state immediately
  broadcastProgress(job);

  req.on('close', () => {
    job.sseClients = job.sseClients.filter((client) => client !== res);
  });
});

/**
 * Download individual split part
 */
app.get('/api/download/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;
  const job = jobs.get(jobId);

  // Path traversal protection
  const safeFilename = path.basename(filename);
  const filePath = path.join(cleanupService.DOWNLOADS_DIR, jobId, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found or expired.');
  }

  const baseTitle = job ? sanitizeFilename(job.videoTitle) : 'video';
  const ext = path.extname(safeFilename);
  const downloadName = `${baseTitle}_${safeFilename}`;

  res.download(filePath, downloadName);
});

/**
 * Stream video for in-browser preview player (with range request support)
 */
app.get('/api/preview/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(cleanupService.DOWNLOADS_DIR, jobId, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(safeFilename).toLowerCase();
  const contentType = ext === '.mp3' ? 'audio/mpeg' : 'video/mp4';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send(`Requested range not satisfiable\n${start} >= ${fileSize}`);
      return;
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

/**
 * Serve part thumbnail image
 */
app.get('/api/thumbnail/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(cleanupService.DOWNLOADS_DIR, jobId, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Thumbnail not found');
  }

  res.setHeader('Content-Type', 'image/jpeg');
  fs.createReadStream(filePath).pipe(res);
});

/**
 * Download all parts as a ZIP archive
 */
app.get('/api/download-all/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  const jobDir = path.join(cleanupService.DOWNLOADS_DIR, jobId);
  if (!fs.existsSync(jobDir)) {
    return res.status(404).send('Job not found or expired.');
  }

  const baseTitle = job ? sanitizeFilename(job.videoTitle) : 'split_videos';
  const zipName = `${baseTitle}_all_parts.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);

  const archive = archiver('zip', {
    zlib: { level: 6 }
  });

  archive.on('error', (err) => {
    console.error('[Archiver error]', err);
    if (!res.headersSent) {
      res.status(500).send({ error: err.message });
    }
  });

  archive.pipe(res);

  // Add all split parts (excluding source file and thumbnails)
  const files = fs.readdirSync(jobDir);
  for (const file of files) {
    if (file.startsWith('part_') && (file.endsWith('.mp4') || file.endsWith('.mp3'))) {
      const filePath = path.join(jobDir, file);
      archive.file(filePath, { name: `${baseTitle}_${file}` });
    }
  }

  archive.finalize();
});

/**
 * Cookie Authentication Management (Bypass YouTube bot checks)
 */
app.get('/api/cookies/status', (req, res) => {
  const cookiePath = ytService.getCookieFilePath();
  res.json({
    success: true,
    hasCookies: !!cookiePath,
    filename: cookiePath ? path.basename(cookiePath) : null
  });
});

app.post('/api/cookies', (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies || typeof cookies !== 'string' || !cookies.trim()) {
      return res.status(400).json({ success: false, error: 'Cookie content is empty.' });
    }
    const targetPath = path.join(__dirname, '..', 'cookies.txt');
    fs.writeFileSync(targetPath, cookies.trim(), 'utf8');
    res.json({ success: true, message: 'cookies.txt successfully saved on server.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to write cookies.txt: ' + err.message });
  }
});

app.delete('/api/cookies', (req, res) => {
  try {
    const rootCookie = path.join(__dirname, '..', 'cookies.txt');
    if (fs.existsSync(rootCookie)) {
      fs.unlinkSync(rootCookie);
    }
    res.json({ success: true, message: 'cookies.txt removed from server.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`⚡ YouTube Split Downloader running at http://0.0.0.0:${PORT}`);
  console.log(`======================================================\n`);
});
