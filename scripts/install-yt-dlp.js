const fs = require('fs');
const path = require('path');
const https = require('https');

const isWin = process.platform === 'win32';
const binDir = path.join(__dirname, '..', 'bin');
const targetFile = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const targetPath = path.join(binDir, targetFile);

const downloadUrl = isWin
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with status ${res.statusCode}`));
      }
      const stream = fs.createWriteStream(destPath);
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close(() => resolve());
      });
      stream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    if (stats.size > 1024 * 1024) {
      console.log(`[postinstall] yt-dlp binary already present (${(stats.size / 1024 / 1024).toFixed(1)} MB).`);
      if (!isWin) {
        try {
          fs.chmodSync(targetPath, 0o755);
        } catch (_) {}
      }
      return;
    }
  }

  console.log(`[postinstall] Downloading yt-dlp for ${process.platform} from GitHub...`);
  try {
    await downloadFile(downloadUrl, targetPath);
    if (!isWin) {
      fs.chmodSync(targetPath, 0o755);
    }
    console.log(`[postinstall] yt-dlp successfully downloaded to ${targetPath}`);
  } catch (err) {
    console.warn(`[postinstall] Failed to auto-download yt-dlp: ${err.message}. Using repository copy.`);
  }
}

main();
