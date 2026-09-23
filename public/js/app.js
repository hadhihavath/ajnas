/**
 * Main Application Controller for YouTube Split Downloader
 */

// State
const state = {
  video: null,
  selectedQuality: '720p',
  splitMode: 'duration',
  partDuration: 60,
  numParts: 3,
  jobId: null,
  eventSource: null,
  timeline: null,
};

// DOM Elements
const el = {
  youtubeUrl: document.getElementById('youtubeUrl'),
  btnPaste: document.getElementById('btnPaste'),
  btnFetchInfo: document.getElementById('btnFetchInfo'),
  sampleChips: document.querySelectorAll('.sample-chip'),

  videoInfoCard: document.getElementById('videoInfoCard'),
  videoThumb: document.getElementById('videoThumb'),
  videoDuration: document.getElementById('videoDuration'),
  videoTitle: document.getElementById('videoTitle'),
  videoAuthor: document.getElementById('videoAuthor'),
  videoLengthText: document.getElementById('videoLengthText'),
  qualityPills: document.getElementById('qualityPills'),

  splitConfigCard: document.getElementById('splitConfigCard'),
  modeTabs: document.querySelectorAll('.mode-tab'),
  tabContentDuration: document.getElementById('tabContentDuration'),
  tabContentParts: document.getElementById('tabContentParts'),
  presetChips: document.querySelectorAll('.preset-chip'),
  splitMinutes: document.getElementById('splitMinutes'),
  splitSeconds: document.getElementById('splitSeconds'),
  numPartsInput: document.getElementById('numPartsInput'),

  timelineTrack: document.getElementById('timelineTrack'),
  timelineStats: document.getElementById('timelineStats'),
  timelineStartLabel: document.getElementById('timelineStartLabel'),
  timelineEndLabel: document.getElementById('timelineEndLabel'),

  btnStartSplit: document.getElementById('btnStartSplit'),

  progressCard: document.getElementById('progressCard'),
  progressMessage: document.getElementById('progressMessage'),
  progressPercent: document.getElementById('progressPercent'),
  progressBarFill: document.getElementById('progressBarFill'),
  progressSubDetail: document.getElementById('progressSubDetail'),
  progressSpeedEta: document.getElementById('progressSpeedEta'),

  resultsCard: document.getElementById('resultsCard'),
  resultsCountTitle: document.getElementById('resultsCountTitle'),
  btnDownloadZip: document.getElementById('btnDownloadZip'),
  partsGrid: document.getElementById('partsGrid'),

  previewModal: document.getElementById('previewModal'),
  modalPartTitle: document.getElementById('modalPartTitle'),
  modalVideoPlayer: document.getElementById('modalVideoPlayer'),
  modalAudioPlayer: document.getElementById('modalAudioPlayer'),
  btnModalClose: document.getElementById('btnModalClose'),

  btnServerConfig: document.getElementById('btnServerConfig'),
  serverStatusText: document.getElementById('serverStatusText'),
  serverModal: document.getElementById('serverModal'),
  backendUrlInput: document.getElementById('backendUrlInput'),
  btnServerModalClose: document.getElementById('btnServerModalClose'),
  btnSaveServerUrl: document.getElementById('btnSaveServerUrl'),
  btnResetServerUrl: document.getElementById('btnResetServerUrl'),

  cookieStatusBadge: document.getElementById('cookieStatusBadge'),
  cookieTextInput: document.getElementById('cookieTextInput'),
  btnSaveCookies: document.getElementById('btnSaveCookies'),
  btnClearCookies: document.getElementById('btnClearCookies'),

  toastContainer: document.getElementById('toastContainer'),
};

// Initialize Timeline
state.timeline = new VideoTimeline({
  containerId: 'splitConfigCard',
  trackId: 'timelineTrack',
  statsId: 'timelineStats'
});

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Format duration
function formatTimeStr(seconds) {
  return window.formatTime ? window.formatTime(seconds) : seconds;
}

// Recalculate Timeline Segments
function updateTimeline() {
  if (!state.video) return;

  let partDuration = 60;
  if (state.splitMode === 'duration') {
    const mins = parseInt(el.splitMinutes.value, 10) || 0;
    const secs = parseInt(el.splitSeconds.value, 10) || 0;
    partDuration = Math.max(5, mins * 60 + secs);
    state.partDuration = partDuration;
  } else {
    state.numParts = Math.max(2, parseInt(el.numPartsInput.value, 10) || 2);
  }

  state.timeline.calculate({
    mode: state.splitMode,
    partDuration: state.partDuration,
    numParts: state.numParts
  });
}

// Fetch Video Info from Backend
async function fetchVideoInfo(urlToFetch) {
  const url = (urlToFetch || el.youtubeUrl.value).trim();
  if (!url) {
    showToast('Please paste a YouTube video URL first.', 'error');
    return;
  }

  // Set loading state
  el.btnFetchInfo.disabled = true;
  el.btnFetchInfo.innerHTML = `<span class="spinner"></span> <span>Fetching...</span>`;

  try {
    const apiUrl = window.CONFIG ? window.CONFIG.getUrl('/api/info') : '/api/info';
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to inspect video.');
    }

    state.video = data.data;
    renderVideoInfo(state.video);
    showToast(`Loaded: "${state.video.title}"`, 'success');
  } catch (err) {
    console.error('Fetch error:', err);
    showToast(err.message, 'error');
  } finally {
    el.btnFetchInfo.disabled = false;
    el.btnFetchInfo.innerHTML = `
      <span class="btn-text">Inspect Video</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    `;
  }
}

// Render Video Details
function renderVideoInfo(video) {
  el.videoThumb.src = video.thumbnail || '';
  el.videoDuration.textContent = video.formattedDuration;
  el.videoTitle.textContent = video.title;
  el.videoAuthor.textContent = video.author;
  el.videoLengthText.textContent = `${video.formattedDuration} total`;

  // Render Quality Pills
  el.qualityPills.innerHTML = '';
  if (video.qualities && video.qualities.length > 0) {
    // Default pick 720p or 1080p if available
    const has720 = video.qualities.some(q => q.id === '720p');
    const has1080 = video.qualities.some(q => q.id === '1080p');
    state.selectedQuality = has720 ? '720p' : (has1080 ? '1080p' : video.qualities[0].id);

    video.qualities.forEach(q => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `quality-pill ${q.id === state.selectedQuality ? 'active' : ''}`;
      pill.textContent = q.label;
      pill.dataset.id = q.id;

      pill.addEventListener('click', () => {
        document.querySelectorAll('.quality-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedQuality = q.id;
      });

      el.qualityPills.appendChild(pill);
    });
  }

  // Show Cards
  el.videoInfoCard.style.display = 'grid';
  el.splitConfigCard.style.display = 'block';

  // Setup Timeline
  state.timeline.setDuration(video.duration);
  el.timelineStartLabel.textContent = '00:00';
  el.timelineEndLabel.textContent = video.formattedDuration;

  // Initial timeline calculation
  updateTimeline();

  // Scroll smoothly to config
  el.videoInfoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Start Split Job
async function startSplitProcess() {
  if (!state.video) {
    showToast('Please inspect a YouTube video first.', 'error');
    return;
  }

  // Prepare parameters
  const payload = {
    url: state.video.url,
    quality: state.selectedQuality,
    mode: state.splitMode,
    partDuration: state.partDuration,
    numParts: state.numParts,
    videoTitle: state.video.title,
    totalDuration: state.video.duration
  };

  el.btnStartSplit.disabled = true;
  el.btnStartSplit.innerHTML = `<span class="spinner"></span> <span>Starting Process...</span>`;
  el.resultsCard.style.display = 'none';

  // Display and reset progress
  el.progressCard.style.display = 'block';
  el.progressPercent.textContent = '0%';
  el.progressBarFill.style.width = '0%';
  el.progressMessage.textContent = 'Preparing video stream...';
  el.progressSubDetail.textContent = 'Requesting download and split job...';
  el.progressSpeedEta.textContent = '';
  el.progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    const apiUrl = window.CONFIG ? window.CONFIG.getUrl('/api/split') : '/api/split';
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to start processing job.');
    }

    state.jobId = data.jobId;
    listenToProgress(state.jobId);

  } catch (err) {
    console.error('Start split error:', err);
    showToast(err.message, 'error');
    el.progressCard.style.display = 'none';
    el.btnStartSplit.disabled = false;
    el.btnStartSplit.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Download & Split Video</span>
    `;
  }
}

// Connect to Server-Sent Events (SSE)
function listenToProgress(jobId) {
  if (state.eventSource) {
    state.eventSource.close();
  }

  const sseUrl = window.CONFIG ? window.CONFIG.getUrl(`/api/progress/${jobId}`) : `/api/progress/${jobId}`;
  const sse = new EventSource(sseUrl);
  state.eventSource = sse;

  sse.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.status === 'processing') {
        const percent = Math.min(100, Math.round(data.percent || 0));
        el.progressBarFill.style.width = `${percent}%`;
        el.progressPercent.textContent = `${percent}%`;

        if (data.stage === 'downloading') {
          el.progressMessage.textContent = 'Downloading source video...';
          el.progressSubDetail.textContent = data.message || 'Streaming from YouTube...';
          el.progressSpeedEta.textContent = [data.speed, data.eta ? `ETA: ${data.eta}` : ''].filter(Boolean).join(' • ');
        } else if (data.stage === 'splitting') {
          el.progressMessage.textContent = 'Splitting into parts with FFmpeg...';
          el.progressSubDetail.textContent = data.message || `Processing segment ${data.currentPart || 1} of ${data.totalParts || 1}`;
          el.progressSpeedEta.textContent = `${data.currentPart || 0} / ${data.totalParts || 0} Parts`;
        }
      } else if (data.status === 'completed') {
        sse.close();
        el.progressBarFill.style.width = '100%';
        el.progressPercent.textContent = '100%';
        el.progressMessage.textContent = 'Splitting complete!';
        el.progressSubDetail.textContent = `All ${data.parts ? data.parts.length : 0} parts ready for download.`;
        el.progressSpeedEta.textContent = 'Ready';

        // Render Results
        setTimeout(() => {
          renderResults(data.parts || []);
          el.btnStartSplit.disabled = false;
          el.btnStartSplit.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Split Video Again</span>
          `;
        }, 600);

      } else if (data.status === 'error') {
        sse.close();
        showToast(data.error || 'Splitting failed.', 'error');
        el.progressMessage.textContent = 'Processing Failed';
        el.progressSubDetail.textContent = data.error || 'An unexpected error occurred.';
        el.btnStartSplit.disabled = false;
        el.btnStartSplit.innerHTML = `<span>Try Again</span>`;
      }
    } catch (err) {
      console.error('SSE parse error:', err);
    }
  };

  sse.onerror = (err) => {
    console.warn('SSE disconnected or error:', err);
  };
}

// Render Results Grid
function renderResults(parts) {
  el.partsGrid.innerHTML = '';
  el.resultsCountTitle.textContent = `${parts.length} Split Parts Ready`;

  // Setup ZIP download button
  el.btnDownloadZip.href = window.CONFIG ? window.CONFIG.getUrl(`/api/download-all/${state.jobId}`) : `/api/download-all/${state.jobId}`;

  const isAudio = state.selectedQuality === 'audio';

  parts.forEach((part) => {
    const card = document.createElement('div');
    card.className = 'part-card';
    card.id = `part-card-${part.partIndex}`;

    // Thumbnail / Media Preview
    let thumbHtml = '';
    if (isAudio) {
      thumbHtml = `
        <div class="part-audio-placeholder">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <span style="font-size: 0.8rem; font-weight: 600;">MP3 Audio</span>
        </div>
      `;
    } else if (part.hasThumbnail && part.thumbFilename) {
      const thumbUrl = window.CONFIG ? window.CONFIG.getUrl(`/api/thumbnail/${state.jobId}/${part.thumbFilename}`) : `/api/thumbnail/${state.jobId}/${part.thumbFilename}`;
      thumbHtml = `
        <img class="part-thumb-img" src="${thumbUrl}" alt="${part.title}">
      `;
    } else {
      thumbHtml = `
        <img class="part-thumb-img" src="${state.video.thumbnail || ''}" alt="${part.title}">
      `;
    }

    card.innerHTML = `
      <div class="part-thumb-wrap">
        ${thumbHtml}
        <span class="part-badge-tag">${part.title}</span>
        <span class="part-duration-tag">${part.formattedDuration}</span>
      </div>
      <div class="part-body">
        <div>
          <div class="part-title">${part.title}</div>
          <div class="part-timestamp-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>${part.formattedStart} ➔ ${part.formattedEnd}</span>
            <span>•</span>
            <span>${part.sizeFormatted}</span>
          </div>
        </div>
        <div class="part-actions">
          <button type="button" class="btn-part-preview" data-filename="${part.filename}" data-title="${part.title} (${part.formattedStart} - ${part.formattedEnd})">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Preview
          </button>
          <a href="${window.CONFIG ? window.CONFIG.getUrl(`/api/download/${state.jobId}/${part.filename}`) : `/api/download/${state.jobId}/${part.filename}`}" class="btn-part-download" download>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download
          </a>
        </div>
      </div>
    `;

    // Hook preview button
    const btnPreview = card.querySelector('.btn-part-preview');
    btnPreview.addEventListener('click', () => {
      openPreviewModal(part.filename, `${part.title}: ${part.formattedStart} - ${part.formattedEnd}`);
    });

    // Hover effect highlights timeline
    card.addEventListener('mouseenter', () => {
      state.timeline.highlightPart(part.partIndex);
    });
    card.addEventListener('mouseleave', () => {
      state.timeline.unhighlightPart(part.partIndex);
    });

    el.partsGrid.appendChild(card);
  });

  el.resultsCard.style.display = 'block';
  el.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  showToast(`Splitting complete! ${parts.length} parts ready.`, 'success');
}

// Open Video Preview Modal
function openPreviewModal(filename, title) {
  const isAudio = state.selectedQuality === 'audio';
  const url = window.CONFIG ? window.CONFIG.getUrl(`/api/preview/${state.jobId}/${filename}`) : `/api/preview/${state.jobId}/${filename}`;

  el.modalPartTitle.textContent = title;

  if (isAudio) {
    el.modalVideoPlayer.style.display = 'none';
    el.modalAudioPlayer.style.display = 'block';
    el.modalAudioPlayer.src = url;
    el.modalAudioPlayer.play().catch(() => {});
  } else {
    el.modalAudioPlayer.style.display = 'none';
    el.modalVideoPlayer.style.display = 'block';
    el.modalVideoPlayer.src = url;
    el.modalVideoPlayer.play().catch(() => {});
  }

  el.previewModal.classList.add('active');
}

// Close Modal
function closePreviewModal() {
  el.modalVideoPlayer.pause();
  el.modalVideoPlayer.src = '';
  el.modalAudioPlayer.pause();
  el.modalAudioPlayer.src = '';
  el.previewModal.classList.remove('active');
}

// YouTube URL Detection Regex & Extraction
function extractYouTubeUrl(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();
  // Matches standard, short, shorts, mobile, music, and embed YouTube URLs
  const ytRegex = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const match = text.match(ytRegex);
  if (match) {
    let url = text;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    return url;
  }
  return null;
}

// Auto-Load Clipboard Helper
let lastClipboardCheckedUrl = '';
let isCheckingClipboard = false;

async function checkAndAutoLoadClipboard(autoInspect = true) {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    return;
  }
  if (isCheckingClipboard) return;
  isCheckingClipboard = true;

  try {
    const clipText = await navigator.clipboard.readText();
    const ytUrl = extractYouTubeUrl(clipText);

    if (ytUrl) {
      const currentInputVal = el.youtubeUrl ? el.youtubeUrl.value.trim() : '';
      const currentLoadedUrl = state.video ? state.video.url : '';

      // Only load if it's new or not currently loaded
      if (ytUrl !== lastClipboardCheckedUrl && ytUrl !== currentLoadedUrl) {
        lastClipboardCheckedUrl = ytUrl;
        if (el.youtubeUrl) {
          el.youtubeUrl.value = ytUrl;
        }
        showToast('📋 YouTube video link auto-loaded from clipboard!', 'success');

        if (autoInspect) {
          fetchVideoInfo(ytUrl);
        }
      }
    }
  } catch (err) {
    // Silent catch: clipboard permissions may be pending or restricted without explicit user gesture
  } finally {
    isCheckingClipboard = false;
  }
}

// Setup Event Listeners
function initEvents() {
  // Inspect button
  el.btnFetchInfo.addEventListener('click', () => fetchVideoInfo());

  // Enter key on URL input
  el.youtubeUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      fetchVideoInfo();
    }
  });

  // Paste button (manual trigger)
  el.btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const ytUrl = extractYouTubeUrl(text) || (text ? text.trim() : '');
      if (ytUrl) {
        el.youtubeUrl.value = ytUrl;
        lastClipboardCheckedUrl = ytUrl;
        showToast('📋 Link pasted from clipboard', 'info');
        fetchVideoInfo(ytUrl);
      } else {
        showToast('Clipboard is empty or no valid YouTube link found.', 'info');
        el.youtubeUrl.focus();
      }
    } catch (err) {
      showToast('Clipboard access denied. Please paste manually.', 'info');
      el.youtubeUrl.focus();
    }
  });

  // Auto-detect YouTube links when returning to tab or window
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAndAutoLoadClipboard(true);
    }
  });

  window.addEventListener('focus', () => {
    checkAndAutoLoadClipboard(true);
  });

  // Mobile / desktop user interaction fallback (handles gesture-gated clipboard permissions)
  const onFirstInteraction = () => {
    if (!state.video && (!el.youtubeUrl.value || !el.youtubeUrl.value.trim())) {
      checkAndAutoLoadClipboard(true);
    }
    document.removeEventListener('pointerdown', onFirstInteraction);
  };
  document.addEventListener('pointerdown', onFirstInteraction, { passive: true });

  // Focus on URL input: auto-check clipboard if empty
  el.youtubeUrl.addEventListener('focus', () => {
    if (!el.youtubeUrl.value.trim()) {
      checkAndAutoLoadClipboard(true);
    }
  });

  // Initial check shortly after load
  setTimeout(() => {
    checkAndAutoLoadClipboard(true);
  }, 600);

  // Sample Chips
  el.sampleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const url = chip.dataset.url;
      el.youtubeUrl.value = url;
      fetchVideoInfo(url);
    });
  });

  // Mode Switch Tabs
  el.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      el.modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.splitMode = tab.dataset.mode;

      if (state.splitMode === 'duration') {
        el.tabContentDuration.style.display = 'block';
        el.tabContentParts.style.display = 'none';
      } else {
        el.tabContentDuration.style.display = 'none';
        el.tabContentParts.style.display = 'block';
      }

      updateTimeline();
    });
  });

  // Preset Chips
  el.presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      el.presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const totalSecs = parseInt(chip.dataset.seconds, 10);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;

      el.splitMinutes.value = mins;
      el.splitSeconds.value = secs;
      updateTimeline();
    });
  });

  // Input changes
  el.splitMinutes.addEventListener('input', () => {
    el.presetChips.forEach(c => c.classList.remove('active'));
    updateTimeline();
  });

  el.splitSeconds.addEventListener('input', () => {
    el.presetChips.forEach(c => c.classList.remove('active'));
    updateTimeline();
  });

  el.numPartsInput.addEventListener('input', () => {
    updateTimeline();
  });

  // Start Split Button
  el.btnStartSplit.addEventListener('click', startSplitProcess);

  // Modal Close
  el.btnModalClose.addEventListener('click', closePreviewModal);
  el.previewModal.addEventListener('click', (e) => {
    if (e.target === el.previewModal) closePreviewModal();
  });

  // Server Configuration Modal Logic
  function updateServerBadge() {
    if (!window.CONFIG || !el.serverStatusText) return;
    const isGH = window.CONFIG.isGitHubPages;
    const url = window.CONFIG.API_BASE_URL;
    if (isGH) {
      el.serverStatusText.textContent = url ? 'Hostinger Connected' : 'Set Hostinger URL';
    } else {
      el.serverStatusText.textContent = url ? 'Custom Backend' : 'Local Backend';
    }
  }

  updateServerBadge();

  async function checkCookieStatus() {
    if (!el.cookieStatusBadge) return;
    try {
      const url = window.CONFIG ? window.CONFIG.getUrl('/api/cookies/status') : '/api/cookies/status';
      const res = await fetch(url);
      const data = await res.json();
      if (data.hasCookies) {
        el.cookieStatusBadge.textContent = '🍪 Cookies Active';
        el.cookieStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        el.cookieStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        el.cookieStatusBadge.style.color = '#6ee7b7';
      } else {
        el.cookieStatusBadge.textContent = '⚡ Mobile Client Active';
        el.cookieStatusBadge.style.background = 'rgba(99, 102, 241, 0.12)';
        el.cookieStatusBadge.style.borderColor = 'rgba(99, 102, 241, 0.3)';
        el.cookieStatusBadge.style.color = '#a5b4fc';
      }
    } catch (_) {
      el.cookieStatusBadge.textContent = 'Status Unavailable';
    }
  }

  if (el.btnServerConfig) {
    el.btnServerConfig.addEventListener('click', () => {
      el.backendUrlInput.value = window.CONFIG ? window.CONFIG.API_BASE_URL : '';
      el.serverModal.classList.add('active');
      checkCookieStatus();
    });
  }

  if (el.btnServerModalClose) {
    el.btnServerModalClose.addEventListener('click', () => {
      el.serverModal.classList.remove('active');
    });
  }

  if (el.serverModal) {
    el.serverModal.addEventListener('click', (e) => {
      if (e.target === el.serverModal) el.serverModal.classList.remove('active');
    });
  }

  if (el.btnSaveServerUrl) {
    el.btnSaveServerUrl.addEventListener('click', () => {
      const val = el.backendUrlInput.value.trim();
      if (window.CONFIG) {
        window.CONFIG.setApiBaseUrl(val);
      }
      updateServerBadge();
      checkCookieStatus();
      el.serverModal.classList.remove('active');
      showToast(val ? `Backend configured: ${val}` : 'Reset to default backend', 'success');
    });
  }

  if (el.btnResetServerUrl) {
    el.btnResetServerUrl.addEventListener('click', () => {
      if (window.CONFIG) {
        window.CONFIG.setApiBaseUrl('');
      }
      el.backendUrlInput.value = '';
      updateServerBadge();
      checkCookieStatus();
      el.serverModal.classList.remove('active');
      showToast('Backend reset to default origin', 'info');
    });
  }

  if (el.btnSaveCookies) {
    el.btnSaveCookies.addEventListener('click', async () => {
      const text = el.cookieTextInput.value.trim();
      if (!text) {
        showToast('Please paste cookies content first.', 'error');
        return;
      }
      try {
        const url = window.CONFIG ? window.CONFIG.getUrl('/api/cookies') : '/api/cookies';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies: text })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ Cookies successfully saved on server!', 'success');
          el.cookieTextInput.value = '';
          checkCookieStatus();
        } else {
          showToast(data.error || 'Failed to save cookies.', 'error');
        }
      } catch (err) {
        showToast('Failed to save cookies: ' + err.message, 'error');
      }
    });
  }

  if (el.btnClearCookies) {
    el.btnClearCookies.addEventListener('click', async () => {
      try {
        const url = window.CONFIG ? window.CONFIG.getUrl('/api/cookies') : '/api/cookies';
        const res = await fetch(url, { method: 'DELETE' });
        const data = await res.json();
        showToast('Cookies cleared.', 'info');
        checkCookieStatus();
      } catch (err) {
        showToast('Failed to clear cookies: ' + err.message, 'error');
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (el.previewModal && el.previewModal.classList.contains('active')) closePreviewModal();
      if (el.serverModal && el.serverModal.classList.contains('active')) el.serverModal.classList.remove('active');
    }
  });
}

// Start
initEvents();
