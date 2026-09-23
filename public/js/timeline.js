/**
 * Interactive Timeline Visualizer and Segment Calculator
 */

const PALETTE = [
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#f97316', // Orange
  '#84cc16', // Lime
];

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

class VideoTimeline {
  constructor({ containerId, trackId, statsId }) {
    this.container = document.getElementById(containerId);
    this.track = document.getElementById(trackId);
    this.stats = document.getElementById(statsId);
    this.totalDuration = 0;
    this.segments = [];
  }

  setDuration(duration) {
    this.totalDuration = Math.max(1, Math.round(duration));
  }

  /**
   * Calculate segment array based on mode
   */
  calculate({ mode = 'duration', partDuration = 60, numParts = 2, customRanges = [] }) {
    const total = this.totalDuration;
    const segments = [];

    if (mode === 'duration') {
      const chunk = Math.max(5, Math.round(Number(partDuration) || 60));
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
            formattedDuration: formatTime(segDuration),
            color: PALETTE[(index - 1) % PALETTE.length]
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
            formattedDuration: formatTime(segDuration),
            color: PALETTE[i % PALETTE.length]
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
          formattedDuration: formatTime(segDuration),
          color: PALETTE[idx % PALETTE.length]
        });
      });
    }

    this.segments = segments;
    this.render();
    return segments;
  }

  /**
   * Render segment blocks into track
   */
  render() {
    if (!this.track) return;
    this.track.innerHTML = '';

    if (this.segments.length === 0) {
      if (this.stats) this.stats.textContent = '0 Parts';
      return;
    }

    const total = this.totalDuration;

    this.segments.forEach((seg) => {
      const widthPercent = (seg.duration / total) * 100;
      const block = document.createElement('div');
      block.className = 'timeline-segment-block';
      block.id = `timeline-seg-${seg.partIndex}`;
      block.style.width = `${widthPercent}%`;
      block.style.backgroundColor = seg.color;

      const label = document.createElement('span');
      label.className = 'segment-label';
      label.textContent = widthPercent > 8 ? `${seg.title} (${seg.formattedDuration})` : `${seg.partIndex}`;
      block.appendChild(label);

      block.title = `${seg.title}: ${seg.formattedStart} ➔ ${seg.formattedEnd} (${seg.formattedDuration})`;

      block.addEventListener('mouseenter', () => {
        block.classList.add('highlighted');
        const card = document.getElementById(`part-card-${seg.partIndex}`);
        if (card) card.style.borderColor = seg.color;
      });

      block.addEventListener('mouseleave', () => {
        block.classList.remove('highlighted');
        const card = document.getElementById(`part-card-${seg.partIndex}`);
        if (card) card.style.borderColor = '';
      });

      this.track.appendChild(block);
    });

    if (this.stats) {
      const count = this.segments.length;
      this.stats.textContent = `${count} Part${count > 1 ? 's' : ''} (${formatTime(total)} Total)`;
    }
  }

  highlightPart(partIndex) {
    const el = document.getElementById(`timeline-seg-${partIndex}`);
    if (el) el.classList.add('highlighted');
  }

  unhighlightPart(partIndex) {
    const el = document.getElementById(`timeline-seg-${partIndex}`);
    if (el) el.classList.remove('highlighted');
  }
}

window.VideoTimeline = VideoTimeline;
window.formatTime = formatTime;
