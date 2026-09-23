const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Format seconds into HH:MM:SS or MM:SS
 */
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
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
 * Calculate segments given video duration and user settings
 */
function calculateSegments({ totalDuration, mode, partDuration, numParts, customRanges }) {
  const segments = [];
  const total = Math.max(1, Math.round(totalDuration));

  if (mode === 'duration') {
    const chunk = Math.max(5, Math.round(Number(partDuration) || 60)); // minimum 5s
    let currentStart = 0;
    let index = 1;

    while (currentStart < total) {
      const currentEnd = Math.min(total, currentStart + chunk);
      const segDuration = currentEnd - currentStart;
      if (segDuration > 0) {
        segments.push({
          partIndex: index,
          title: `Part ${index}`,
          start: currentStart,
          end: currentEnd,
          duration: segDuration,
          formattedStart: formatTime(currentStart),
          formattedEnd: formatTime(currentEnd),
          formattedDuration: formatTime(segDuration)
        });
      }
      currentStart = currentEnd;
      index++;
    }
  } else if (mode === 'parts') {
    const partsCount = Math.max(2, Math.min(50, Math.round(Number(numParts) || 2)));
    const chunk = total / partsCount;

    for (let i = 0; i < partsCount; i++) {
      const start = Math.round(i * chunk);
      const end = i === partsCount - 1 ? total : Math.round((i + 1) * chunk);
      const segDuration = end - start;
      if (segDuration > 0) {
        segments.push({
          partIndex: i + 1,
          title: `Part ${i + 1}`,
          start,
          end,
          duration: segDuration,
          formattedStart: formatTime(start),
          formattedEnd: formatTime(end),
          formattedDuration: formatTime(segDuration)
        });
      }
    }
  } else if (mode === 'custom' && Array.isArray(customRanges)) {
    customRanges.forEach((range, idx) => {
      const start = Math.max(0, Math.min(total, Number(range.start) || 0));
      const end = Math.max(start + 1, Math.min(total, Number(range.end) || total));
      const segDuration = end - start;
      segments.push({
        partIndex: idx + 1,
        title: range.title || `Part ${idx + 1}`,
        start,
        end,
        duration: segDuration,
        formattedStart: formatTime(start),
        formattedEnd: formatTime(end),
        formattedDuration: formatTime(segDuration)
      });
    });
  }

  return segments;
}

const isWin = process.platform === 'win32';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 
  (isWin && fs.existsSync(path.join(__dirname, '..', 'bin', 'ffmpeg.exe'))
    ? path.join(__dirname, '..', 'bin', 'ffmpeg.exe')
    : 'ffmpeg');

/**
 * Execute an ffmpeg command as a promise
 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args);
    let stderrData = '';

    proc.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-300)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Split source media file into configured segments
 */
async function splitMedia({ sourcePath, outputDir, segments, isAudio = false, onProgress }) {
  const results = [];
  const ext = isAudio ? 'mp3' : 'mp4';
  const total = segments.length;

  for (let i = 0; i < total; i++) {
    const seg = segments[i];
    const padIndex = String(seg.partIndex).padStart(2, '0');
    const filename = `part_${padIndex}.${ext}`;
    const outputPath = path.join(outputDir, filename);
    const thumbFilename = `thumb_${padIndex}.jpg`;
    const thumbPath = path.join(outputDir, thumbFilename);

    if (onProgress) {
      const percent = Math.round((i / total) * 100);
      onProgress({
        stage: 'splitting',
        percent,
        currentPart: seg.partIndex,
        totalParts: total,
        message: `Splitting Part ${seg.partIndex} of ${total} (${seg.formattedStart} - ${seg.formattedEnd})...`
      });
    }

    // Try fast stream copy first
    let splitSuccess = false;
    try {
      const fastArgs = [
        '-y',
        '-ss', String(seg.start),
        '-i', sourcePath,
        '-t', String(seg.duration),
        '-avoid_negative_ts', 'make_zero',
        '-c', 'copy',
        outputPath
      ];
      await runFfmpeg(fastArgs);

      // Verify file size > 1KB
      const stats = fs.statSync(outputPath);
      if (stats.size > 1024) {
        splitSuccess = true;
      }
    } catch (e) {
      console.warn(`[FFmpeg] Stream copy failed for part ${seg.partIndex}, falling back to re-encode:`, e.message);
    }

    // Fallback to re-encoding if stream copy produced empty/corrupt file
    if (!splitSuccess) {
      const encodeArgs = [
        '-y',
        '-ss', String(seg.start),
        '-i', sourcePath,
        '-t', String(seg.duration)
      ];

      if (isAudio) {
        encodeArgs.push('-c:a', 'libmp3lame', '-q:a', '2', outputPath);
      } else {
        encodeArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', outputPath);
      }
      await runFfmpeg(encodeArgs);
    }

    // Generate thumbnail for video parts
    let hasThumbnail = false;
    if (!isAudio) {
      try {
        const thumbTime = seg.start + Math.min(1.0, seg.duration / 2);
        const thumbArgs = [
          '-y',
          '-ss', String(thumbTime),
          '-i', sourcePath,
          '-vframes', '1',
          '-q:v', '3',
          '-vf', 'scale=480:-1',
          thumbPath
        ];
        await runFfmpeg(thumbArgs);
        hasThumbnail = fs.existsSync(thumbPath);
      } catch (thumbErr) {
        console.warn(`[FFmpeg] Failed to extract thumbnail for part ${seg.partIndex}:`, thumbErr.message);
      }
    }

    const fileStats = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
    const sizeBytes = fileStats ? fileStats.size : 0;
    const sizeFormatted = (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB';

    results.push({
      partIndex: seg.partIndex,
      title: seg.title,
      start: seg.start,
      end: seg.end,
      duration: seg.duration,
      formattedStart: seg.formattedStart,
      formattedEnd: seg.formattedEnd,
      formattedDuration: seg.formattedDuration,
      filename,
      hasThumbnail,
      thumbFilename: hasThumbnail ? thumbFilename : null,
      sizeBytes,
      sizeFormatted
    });
  }

  if (onProgress) {
    onProgress({
      stage: 'completed',
      percent: 100,
      currentPart: total,
      totalParts: total,
      message: 'All parts successfully processed!'
    });
  }

  return results;
}

module.exports = {
  formatTime,
  calculateSegments,
  splitMedia
};
