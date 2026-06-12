(() => {
  if (!window.tandem) return;

  const overlayBar = document.getElementById('recording-overlay-bar');
  const timerEl = document.getElementById('recording-timer');
  const micBtn = document.getElementById('recording-mic-toggle');
  const stopBtn = document.getElementById('recording-stop-btn');
  const regionOverlay = document.getElementById('region-capture-overlay');
  const regionBox = document.getElementById('region-capture-box');

  let mediaRecorder = null;
  let mediaStream = null;
  let micStream = null;
  let timerInterval = null;
  let startTime = 0;
  let micEnabled = true;
  let isRecording = false;
  let cropVideo = null; // video element for canvas crop
  let cropAnimFrame = null;

  // ── Region selection (reuse pattern from wingman.js) ──

  function updateRegionBox(startX, startY, currentX, currentY) {
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    regionBox.style.display = 'block';
    regionBox.style.left = `${left}px`;
    regionBox.style.top = `${top}px`;
    regionBox.style.width = `${width}px`;
    regionBox.style.height = `${height}px`;
  }

  function selectRecordRegion() {
    return new Promise((resolve) => {
      let startX = 0, startY = 0, dragging = false;
      regionOverlay.classList.add('active');
      regionBox.style.display = 'none';

      const cleanup = (result = null) => {
        regionOverlay.classList.remove('active');
        regionBox.style.display = 'none';
        regionOverlay.removeEventListener('mousedown', onDown);
        regionOverlay.removeEventListener('mousemove', onMove);
        regionOverlay.removeEventListener('mouseup', onUp);
        window.removeEventListener('keydown', onKey, true);
        resolve(result);
      };

      const onDown = (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        updateRegionBox(startX, startY, startX, startY);
      };
      const onMove = (e) => {
        if (dragging) updateRegionBox(startX, startY, e.clientX, e.clientY);
      };
      const onUp = (e) => {
        if (!dragging) return cleanup();
        dragging = false;
        const left = Math.min(startX, e.clientX);
        const top = Math.min(startY, e.clientY);
        const width = Math.abs(e.clientX - startX);
        const height = Math.abs(e.clientY - startY);
        if (width < 50 || height < 50) return cleanup();
        cleanup({ x: left, y: top, width, height });
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
      };

      regionOverlay.addEventListener('mousedown', onDown);
      regionOverlay.addEventListener('mousemove', onMove);
      regionOverlay.addEventListener('mouseup', onUp);
      window.addEventListener('keydown', onKey, true);
    });
  }

  // ── Timer ──

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function startTimer() {
    startTime = Date.now();
    timerEl.textContent = '0:00';
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      timerEl.textContent = formatTime(elapsed);
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ── Recording core ──

  async function startRecording(mode, region) {
    try {
      // On Linux, use native getDisplayMedia (system picker) instead of desktopCapturer
      // to avoid Wayland/Pipewire portal conflicts
      const isLinux = navigator.userAgent.includes('Linux');
      
      let mediaStream;
      
      if (isLinux) {
        // Native system picker (Wayland/Pipewire compatible)
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'never',
            frameRate: 30,
          },
          audio: true, // Request system audio (tab/window audio)
        });
        
        console.log('[video-recorder] getDisplayMedia result:');
        console.log('  Video tracks:', mediaStream.getVideoTracks().length);
        console.log('  Audio tracks:', mediaStream.getAudioTracks().length);
        mediaStream.getAudioTracks().forEach((track, i) => {
          console.log(`  Audio track ${i}:`, track.label, 'enabled:', track.enabled, 'muted:', track.muted);
        });
      } else {
        // macOS/Windows: use Electron desktopCapturer
        const source = await window.tandem.getDesktopSource();
        if (!source) {
          console.error('[video-recorder] No desktop source found');
          alert('Screen recording is not available. No capture source found.');
          return;
        }
        if (source.error === 'screen-permission-denied') {
          console.warn('[video-recorder] Screen Recording permission denied');
          alert('Screen Recording permission is required.\n\nGo to System Settings → Privacy & Security → Screen Recording and enable Tandem.');
          return;
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: source.id,
              maxFrameRate: 30,
            },
          },
        });
      }

      // If region mode, crop via canvas
      let recordStream = mediaStream;
      if (mode === 'region' && region) {
        const videoTrack = mediaStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        const trackWidth = settings.width || window.innerWidth;
        const trackHeight = settings.height || window.innerHeight;
        const scaleX = trackWidth / window.innerWidth;
        const scaleY = trackHeight / window.innerHeight;

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(region.width * scaleX);
        canvas.height = Math.round(region.height * scaleY);
        const ctx = canvas.getContext('2d');

        cropVideo = document.createElement('video');
        cropVideo.srcObject = new MediaStream([videoTrack]);
        cropVideo.muted = true;
        await cropVideo.play();

        const drawFrame = () => {
          if (!isRecording) return;
          ctx.drawImage(cropVideo,
            Math.round(region.x * scaleX), Math.round(region.y * scaleY),
            canvas.width, canvas.height,
            0, 0, canvas.width, canvas.height
          );
          cropAnimFrame = requestAnimationFrame(drawFrame);
        };
        drawFrame();

        recordStream = canvas.captureStream(30);
        
        // Preserve audio tracks from original stream (Linux: getDisplayMedia includes audio)
        if (isLinux) {
          mediaStream.getAudioTracks().forEach(t => recordStream.addTrack(t));
        }
      }

      // Try to add system/tab audio (macOS/Windows only - Linux gets it via getDisplayMedia)
      // On macOS, window sources don't include audio — use screen source instead
      const captureSource = globalThis.source; // legacy global; usually unset
      if (!isLinux && captureSource) {
        const audioSourceId = captureSource.audioSourceId || captureSource.id;
        try {
          const tabAudio = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: audioSourceId,
              },
            },
            video: false,
          });
          console.log('[video-recorder] System audio captured via source:', audioSourceId);
          tabAudio.getAudioTracks().forEach(t => recordStream.addTrack(t));
        } catch (e) {
          console.warn('[video-recorder] System audio not available:', e.message);
        }
      }

      // Add mic audio (optional)
      if (micEnabled) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          micStream.getAudioTracks().forEach(t => recordStream.addTrack(t));
        } catch (e) {
          console.warn('[video-recorder] Mic not available:', e.message);
        }
      }

      // Determine best mime type
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      // Start MediaRecorder
      mediaRecorder = new MediaRecorder(recordStream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          event.data.arrayBuffer().then(buf => {
            window.tandem.sendRecordingChunk(buf);
          });
        }
      };

      mediaRecorder.onstop = () => {
        cleanupStreams();
      };

      // Tell main process we're starting
      await window.tandem.startRecording(mode, region);

      mediaRecorder.start(1000); // chunk every 1s
      isRecording = true;

      // Show overlay bar
      overlayBar.classList.add('active');
      startTimer();

    } catch (err) {
      console.error('[video-recorder] Failed to start:', err);
      cleanupStreams();
    }
  }

  async function stopRecording() {
    console.log('[video-recorder] stopRecording called, isRecording:', isRecording, 'mediaRecorder:', !!mediaRecorder);
    if (!isRecording || !mediaRecorder) {
      console.warn('[video-recorder] Not recording or no mediaRecorder');
      return;
    }
    
    isRecording = false;
    
    // Stop UI immediately (don't wait for backend)
    stopTimer();
    overlayBar.classList.remove('active');
    
    // Stop MediaRecorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    // Tell main to finalize (ffmpeg conversion) - non-blocking
    try {
      await window.tandem.stopRecording();
      console.log('[video-recorder] Backend stop completed');
    } catch (err) {
      console.error('[video-recorder] Backend stop failed:', err);
    }
  }

  function cleanupStreams() {
    if (cropAnimFrame) { cancelAnimationFrame(cropAnimFrame); cropAnimFrame = null; }
    if (cropVideo) { cropVideo.pause(); cropVideo.srcObject = null; cropVideo = null; }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    mediaRecorder = null;
  }

  // ── UI handlers ──

  stopBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent bubbling to titlebar double-click handler
    console.log('[video-recorder] Stop button clicked!');
    stopRecording();
  });

  micBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent bubbling
    micEnabled = !micEnabled;
    micBtn.textContent = micEnabled ? '🎤 On' : '🎤 Off';
    micBtn.style.opacity = micEnabled ? '1' : '0.5';
    // Toggle mic tracks if recording
    if (micStream) {
      micStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
    }
  });

  // Esc to stop (only when recording)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isRecording) {
      e.preventDefault();
      e.stopPropagation();
      stopRecording();
    }
  }, true);

  // ── IPC listeners ──

  window.tandem.onRecordingModeSelected(async (mode) => {
    if (isRecording) return;

    if (mode === 'region') {
      const region = await selectRecordRegion();
      if (!region) return;
      // Wait for overlay to clear
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await startRecording('region', region);
    } else {
      await startRecording('application');
    }
  });

  window.tandem.onRecordingFinished((data) => {
    console.log('[video-recorder] Recording saved:', data.filename, `(${data.duration}s)`);
  });
})();
