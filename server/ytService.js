const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWin = process.platform === 'win32';
const winBin = path.join(__dirname, '..', 'bin', 'yt-dlp.exe');
const linuxBin = path.join(__dirname, '..', 'bin', 'yt-dlp');

let staticFfmpegPath = null;
try {
  staticFfmpegPath = require('ffmpeg-static');
} catch (_) {}

const LOCAL_TMP = path.join(__dirname, '..', 'downloads', 'tmp');
if (!fs.existsSync(LOCAL_TMP)) {
  try {
    fs.mkdirSync(LOCAL_TMP, { recursive: true });
  } catch (_) {}
}
process.env.TMPDIR = LOCAL_TMP;
process.env.TEMP = LOCAL_TMP;
process.env.TMP = LOCAL_TMP;

const pyBin = path.join(__dirname, '..', 'bin', 'yt-dlp.py');

function resolveYtDlp() {
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
    return process.env.YT_DLP_PATH;
  }
  if (isWin) {
    if (fs.existsSync(winBin)) return winBin;
    return 'yt-dlp.exe';
  } else {
    if (fs.existsSync(linuxBin)) {
      try {
        fs.chmodSync(linuxBin, 0o755);
      } catch (_) {}
      return linuxBin;
    }
    return 'yt-dlp';
  }
}

const FFMPEG_DIR = process.env.FFMPEG_DIR || 
  (isWin && fs.existsSync(path.join(__dirname, '..', 'bin')) 
    ? path.join(__dirname, '..', 'bin') 
    : (staticFfmpegPath ? path.dirname(staticFfmpegPath) : ''));

/**
 * Validate YouTube URL
 */
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const ytRegex = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
  return ytRegex.test(url.trim());
}

/**
 * Format seconds to HH:MM:SS or MM:SS
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Extract video info using yt-dlp with automatic fallback
 */
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    if (!isValidYouTubeUrl(url)) {
      return reject(new Error('Invalid YouTube URL. Please provide a valid YouTube video or Shorts link.'));
    }

    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      '--js-runtimes', 'node',
      url.trim()
    ];

    const env = {
      ...process.env,
      TMPDIR: LOCAL_TMP,
      TEMP: LOCAL_TMP,
      TMP: LOCAL_TMP
    };

    function tryExtract(cmd, cmdArgs, allowFallback = true) {
      const child = spawn(cmd, cmdArgs, { env });
      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          // Check for shared library / mmap / noexec errors on Linux
          if (allowFallback && (stderrData.includes('failed to map segment') || stderrData.includes('libz.so') || code === 126 || code === 127)) {
            console.warn('[ytService] Binary mmap failed. Falling back to python3 with pure python zipapp...');
            if (fs.existsSync(pyBin)) {
              return tryExtract('python3', [pyBin, ...args], false);
            }
          }
          console.error('[yt-dlp error]', stderrData);
          return reject(new Error(stderrData || 'Failed to extract video information from YouTube.'));
        }

        try {
          const info = JSON.parse(stdoutData);

          const availableHeights = new Set();
          if (Array.isArray(info.formats)) {
            for (const f of info.formats) {
              if (f.vcodec && f.vcodec !== 'none' && f.height) {
                availableHeights.add(f.height);
              }
            }
          }

          const standardHeights = [1080, 720, 480, 360];
          const qualities = [];

          const maxHeight = Math.max(...Array.from(availableHeights), 720);
          for (const h of standardHeights) {
            if (maxHeight >= h || availableHeights.has(h)) {
              qualities.push({
                id: `${h}p`,
                label: `${h}p (${h >= 720 ? 'HD' : 'SD'})`,
                height: h
              });
            }
          }

          if (qualities.length === 0) {
            qualities.push({ id: 'best', label: 'Best Quality (Auto)', height: maxHeight });
          }

          qualities.push({
            id: 'audio',
            label: 'Audio Only (MP3)',
            height: 0
          });

          let thumbnail = info.thumbnail;
          if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
            const sortedThumbs = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
            thumbnail = sortedThumbs[0].url;
          }

          resolve({
            id: info.id,
            title: info.title || 'YouTube Video',
            author: info.uploader || info.channel || 'Unknown Creator',
            duration: info.duration || 0,
            formattedDuration: formatDuration(info.duration || 0),
            thumbnail,
            url: info.webpage_url || url,
            qualities
          });
        } catch (err) {
          console.error('[yt-dlp parse error]', err);
          reject(new Error('Failed to parse video metadata.'));
        }
      });

      child.on('error', (err) => {
        if (allowFallback && fs.existsSync(pyBin)) {
          console.warn(`[ytService] Failed spawning ${cmd} (${err.message}). Trying python3 fallback...`);
          return tryExtract('python3', [pyBin, ...args], false);
        }
        reject(new Error(`Failed to start yt-dlp: ${err.message}`));
      });
    }

    tryExtract(resolveYtDlp(), args, true);
  });
}

/**
 * Download source video / audio to disk
 */
function downloadSource({ url, quality, outputPath, onProgress }) {
  return new Promise((resolve, reject) => {
    let args = [
      '--no-playlist',
      '--newline',
      '--no-warnings',
      '--js-runtimes', 'node',
      '--no-part',
      '--no-mtime',
      '--file-access-retries', '10',
      '--retry-sleep', 'file_access:1'
    ];

    if (FFMPEG_DIR) {
      args.push('--ffmpeg-location', FFMPEG_DIR);
    }

    const isAudio = quality === 'audio';

    if (isAudio) {
      args.push(
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputPath,
        url.trim()
      );
    } else {
      let formatSelector;
      if (quality === '1080p') {
        formatSelector = 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b';
      } else if (quality === '720p') {
        formatSelector = 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b';
      } else if (quality === '480p') {
        formatSelector = 'bv*[height<=480][ext=mp4]+ba[ext=m4a]/bv*[height<=480]+ba/b[height<=480]/b';
      } else if (quality === '360p') {
        formatSelector = 'bv*[height<=360][ext=mp4]+ba[ext=m4a]/bv*[height<=360]+ba/b[height<=360]/b';
      } else {
        formatSelector = 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b';
      }

      args.push(
        '-f', formatSelector,
        '--merge-output-format', 'mp4',
        '-o', outputPath,
        url.trim()
      );
    }

    const env = {
      ...process.env,
      TMPDIR: LOCAL_TMP,
      TEMP: LOCAL_TMP,
      TMP: LOCAL_TMP
    };

    const executable = resolveYtDlp();
    const child = spawn(executable, args, { env });
    let lastPercent = 0;
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      const line = data.toString();
      // Match yt-dlp standard download output, e.g. [download]  45.2% of ~ 20.50MiB at 4.21MiB/s ETA 00:03
      const match = line.match(/\[download\]\s+(\d+(\.\d+)?)%/);
      if (match) {
        const percent = parseFloat(match[1]);
        if (percent !== lastPercent) {
          lastPercent = percent;
          const speedMatch = line.match(/at\s+([~0-9.]+[a-zA-Z\/]+)/);
          const etaMatch = line.match(/ETA\s+([0-9:]+)/);
          if (onProgress) {
            onProgress({
              stage: 'downloading',
              percent,
              speed: speedMatch ? speedMatch[1] : '',
              eta: etaMatch ? etaMatch[1] : ''
            });
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', async (code) => {
      // 1. If outputPath already exists and is non-empty, success!
      if (fs.existsSync(outputPath)) {
        try {
          const stats = fs.statSync(outputPath);
          if (stats.size > 1024) {
            return resolve(outputPath);
          }
        } catch (_) {}
      }

      // 2. Handle Windows file lock edge case: source.temp.mp4 / source.temp.mp3
      const dir = path.dirname(outputPath);
      const ext = path.extname(outputPath);
      const tempPath = path.join(dir, `source.temp${ext}`);

      let candidateTemp = null;
      if (fs.existsSync(tempPath)) {
        candidateTemp = tempPath;
      } else {
        try {
          const files = fs.readdirSync(dir);
          const found = files.find(f => f.startsWith('source.temp.'));
          if (found) candidateTemp = path.join(dir, found);
        } catch (_) {}
      }

      if (candidateTemp && fs.existsSync(candidateTemp)) {
        // Attempt to rename with retries in case Windows Antivirus/Search lock is releasing
        for (let attempt = 1; attempt <= 8; attempt++) {
          try {
            await new Promise(r => setTimeout(r, 600)); // wait for lock release
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
            fs.renameSync(candidateTemp, outputPath);
            console.log(`[ytService] Successfully recovered and renamed ${candidateTemp} to ${outputPath} on attempt ${attempt}`);

            // Clean up any remaining partial fragment files (e.g. source.f*.mp4, source.f*.m4a)
            try {
              const files = fs.readdirSync(dir);
              for (const f of files) {
                if (f.startsWith('source.f') || f.endsWith('.part')) {
                  fs.unlinkSync(path.join(dir, f));
                }
              }
            } catch (_) {}

            return resolve(outputPath);
          } catch (renameErr) {
            console.warn(`[ytService] Recovery rename attempt ${attempt} failed: ${renameErr.message}`);
          }
        }
      }

      // 3. Standard exit check
      if (code === 0 && fs.existsSync(outputPath)) {
        return resolve(outputPath);
      }

      console.error('[yt-dlp download error]', errorOutput);
      reject(new Error(`Download failed: ${errorOutput || 'Unknown yt-dlp error'}`));
    });

    child.on('error', (err) => {
      reject(new Error(`yt-dlp process error: ${err.message}`));
    });
  });
}

module.exports = {
  isValidYouTubeUrl,
  formatDuration,
  getVideoInfo,
  downloadSource
};
