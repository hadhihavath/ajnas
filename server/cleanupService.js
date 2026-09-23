const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

function cleanupOldJobs() {
  if (!fs.existsSync(DOWNLOADS_DIR)) return;

  fs.readdir(DOWNLOADS_DIR, { withFileTypes: true }, (err, entries) => {
    if (err) {
      console.error('[Cleanup] Failed to read downloads directory:', err);
      return;
    }

    const now = Date.now();
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const jobPath = path.join(DOWNLOADS_DIR, entry.name);
        fs.stat(jobPath, (statErr, stats) => {
          if (statErr) return;
          if (now - stats.mtimeMs > MAX_AGE_MS) {
            console.log(`[Cleanup] Removing expired job folder: ${entry.name}`);
            fs.rm(jobPath, { recursive: true, force: true }, (rmErr) => {
              if (rmErr) console.error(`[Cleanup] Failed removing ${entry.name}:`, rmErr);
            });
          }
        });
      }
    }
  });
}

function startCleanupCron(intervalMs = 10 * 60 * 1000) {
  // Run once immediately on start
  cleanupOldJobs();
  return setInterval(cleanupOldJobs, intervalMs);
}

module.exports = {
  cleanupOldJobs,
  startCleanupCron,
  DOWNLOADS_DIR
};
