(() => {
    // ═══════════════════════════════════════════════
    // ClaroNote Integration
    // ═══════════════════════════════════════════════

    // Shared escaper from shell/js/html-escape.js — note titles, summaries,
    // and transcripts come from the ClaroNote service and must be escaped.
    const { escapeHtml } = window.tandemEscape;

    let claroNoteInitialized = false;
    let claroNoteRecording = false;
    let claroNoteTimer = null;
    let claroNoteStartTime = 0;
    let claroNoteMediaRecorder = null;
    let claroNoteAudioChunks = [];
    let claroNoteAudioStream = null;
    let claroNoteAnalyser = null;
    let claroNoteWaveformRAF = null;

    async function initClaroNote() {
      if (claroNoteInitialized) return;
      try {
        const response = await fetch('http://localhost:8765/claronote/status');
        const data = await response.json();
        if (data.authenticated) {
          showClaroNoteMain(data.user);
          await loadClaroNoteNotes();
        } else {
          showClaroNoteLogin();
        }
        claroNoteInitialized = true;
        setupClaroNoteEventListeners();
      } catch (error) {
        console.error('Failed to initialize ClaroNote:', error);
        showClaroNoteError('Connection error with ClaroNote API');
      }
    }

    function showClaroNoteLogin() {
      document.getElementById('claronote-login').style.display = 'block';
      document.getElementById('claronote-main').style.display = 'none';
    }

    function showClaroNoteMain(_user) {
      document.getElementById('claronote-login').style.display = 'none';
      document.getElementById('claronote-main').style.display = 'flex';
    }

    function showClaroNoteError(message) {
      const errorEl = document.getElementById('claronote-error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => { errorEl.style.display = 'none'; }, 5000);
    }

    function setupClaroNoteEventListeners() {
      const loginForm = document.getElementById('claronote-login-form');
      if (loginForm) loginForm.addEventListener('submit', async (e) => { e.preventDefault(); await handleClaroNoteLogin(); });
      const recordBtn = document.getElementById('claronote-record-btn');
      if (recordBtn) recordBtn.addEventListener('click', toggleClaroNoteRecording);
      const refreshBtn = document.getElementById('claronote-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', loadClaroNoteNotes);
    }

    async function handleClaroNoteLogin() {
      const emailEl = document.getElementById('claronote-email');
      const passwordEl = document.getElementById('claronote-password');
      const loginBtn = document.getElementById('claronote-login-btn');
      if (!emailEl || !passwordEl || !loginBtn) return;
      const email = emailEl.value;
      const password = passwordEl.value;
      if (!email || !password) return;
      loginBtn.textContent = 'Logging in...';
      loginBtn.disabled = true;
      try {
        const response = await fetch('http://localhost:8765/claronote/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.success) {
          showClaroNoteMain(data.user);
          await loadClaroNoteNotes();
        } else {
          showClaroNoteError(data.error || 'Login failed');
        }
      } catch (error) {
        showClaroNoteError('Network error');
      } finally {
        loginBtn.textContent = 'Log in';
        loginBtn.disabled = false;
      }
    }

    async function toggleClaroNoteRecording() {
      if (claroNoteRecording) {
        await stopClaroNoteRecording();
      } else {
        await startClaroNoteRecording();
      }
    }

    async function startClaroNoteRecording() {
      try {
        // Request microphone access — actual audio capture in renderer
        claroNoteAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        claroNoteMediaRecorder = new MediaRecorder(claroNoteAudioStream, { mimeType: 'audio/webm' });
        claroNoteAudioChunks = [];

        claroNoteMediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) claroNoteAudioChunks.push(e.data);
        };

        claroNoteMediaRecorder.start(1000); // collect chunks every second
        claroNoteRecording = true;
        claroNoteStartTime = Date.now();

        // Setup waveform visualization
        try {
          const audioCtx = new AudioContext();
          const source = audioCtx.createMediaStreamSource(claroNoteAudioStream);
          claroNoteAnalyser = audioCtx.createAnalyser();
          claroNoteAnalyser.fftSize = 256;
          source.connect(claroNoteAnalyser);
          drawClaroNoteWaveform();
        } catch (e) { /* waveform optional */ }

        updateRecordingUI();
        startRecordingTimer();

        // Notify server (state tracking only)
        fetch('http://localhost:8765/claronote/record/start', { method: 'POST' }).catch(() => { });
      } catch (error) {
        showClaroNoteError('Microphone not available');
      }
    }

    async function stopClaroNoteRecording() {
      if (!claroNoteMediaRecorder) return;

      return new Promise((resolve) => {
        claroNoteMediaRecorder.onstop = async () => {
          claroNoteRecording = false;
          const duration = Math.round((Date.now() - claroNoteStartTime) / 1000);

          // Cleanup audio stream
          if (claroNoteAudioStream) {
            claroNoteAudioStream.getTracks().forEach(t => t.stop());
            claroNoteAudioStream = null;
          }
          if (claroNoteWaveformRAF) { cancelAnimationFrame(claroNoteWaveformRAF); claroNoteWaveformRAF = null; }
          claroNoteAnalyser = null;

          updateRecordingUI();
          stopRecordingTimer();
          document.getElementById('claronote-status-text').textContent = 'Uploading...';

          // Convert to base64 and upload via API proxy
          try {
            const blob = new Blob(claroNoteAudioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = async () => {
              try {
                const base64 = reader.result.split(',')[1];
                const resp = await fetch('http://localhost:8765/claronote/upload', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ audioBase64: base64, duration })
                });
                const data = await resp.json();
                if (data.ok && data.noteId) {
                  document.getElementById('claronote-status-text').textContent = 'Processing...';
                  pollNoteStatus(data.noteId);
                } else {
                  document.getElementById('claronote-status-text').textContent = 'Upload failed';
                  setTimeout(() => { document.getElementById('claronote-status-text').textContent = 'Ready to record'; }, 3000);
                }
              } catch (err) {
                document.getElementById('claronote-status-text').textContent = 'Upload failed';
                setTimeout(() => { document.getElementById('claronote-status-text').textContent = 'Ready to record'; }, 3000);
              }
              resolve();
            };
            reader.readAsDataURL(blob);
          } catch (err) {
            document.getElementById('claronote-status-text').textContent = 'Upload failed';
            resolve();
          }
        };

        claroNoteMediaRecorder.stop();
        fetch('http://localhost:8765/claronote/record/stop', { method: 'POST' }).catch(() => { });
      });
    }

    function drawClaroNoteWaveform() {
      if (!claroNoteAnalyser || !claroNoteRecording) return;
      const waveformEl = document.getElementById('claronote-waveform');
      const bufLen = claroNoteAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufLen);
      claroNoteAnalyser.getByteFrequencyData(dataArray);
      const bars = 20;
      const step = Math.floor(bufLen / bars);
      let stops = [];
      for (let i = 0; i < bars; i++) {
        const val = dataArray[i * step] / 255;
        stops.push(`rgba(233,69,96,${val * 0.8 + 0.1}) ${(i / bars) * 100}%`);
      }
      waveformEl.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
      claroNoteWaveformRAF = requestAnimationFrame(drawClaroNoteWaveform);
    }

    function updateRecordingUI() {
      const recordBtn = document.getElementById('claronote-record-btn');
      const statusText = document.getElementById('claronote-status-text');
      const waveform = document.getElementById('claronote-waveform');
      if (claroNoteRecording) {
        recordBtn.style.background = 'var(--warning)';
        recordBtn.textContent = '⏹️';
        statusText.textContent = 'Recording...';
        waveform.style.display = 'block';
      } else {
        recordBtn.style.background = 'var(--accent)';
        recordBtn.textContent = '🎙️';
        statusText.textContent = 'Ready to record';
        waveform.style.display = 'none';
      }
    }

    function startRecordingTimer() {
      claroNoteTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - claroNoteStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('claronote-timer').textContent =
          `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }, 1000);
    }

    function stopRecordingTimer() {
      if (claroNoteTimer) {
        clearInterval(claroNoteTimer);
        claroNoteTimer = null;
        document.getElementById('claronote-timer').textContent = '';
      }
    }

    async function loadClaroNoteNotes() {
      try {
        const response = await fetch('http://localhost:8765/claronote/notes?limit=10');
        const data = await response.json();

        if (data.notes) {
          displayClaroNoteNotes(data.notes);
        }
      } catch (error) {
        console.error('Failed to load notes:', error);
      }
    }

    function displayClaroNoteNotes(notes) {
      const listEl = document.getElementById('claronote-notes-list');

      if (notes.length === 0) {
        listEl.innerHTML = '<p style="font-size:12px;color:var(--text-dim);text-align:center;padding:20px;">No notes recorded yet</p>';
        return;
      }

      listEl.innerHTML = '';

      notes.forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.style.cssText = 'padding:10px 15px;border-bottom:1px solid rgba(255,255,255,0.03);cursor:pointer;transition:background 0.15s;';

        // Status indicator
        let statusColor = 'var(--text-dim)';
        let statusText = escapeHtml(note.status);
        if (note.status === 'READY') { statusColor = 'var(--success)'; statusText = 'Ready'; }
        else if (note.status === 'PROCESSING') { statusColor = 'var(--warning)'; statusText = 'Processing...'; }
        else if (note.status === 'UPLOADING') { statusColor = 'var(--accent)'; statusText = 'Uploading...'; }
        else if (note.status === 'ERROR') { statusColor = 'var(--warning)'; statusText = 'Error'; }

        noteEl.innerHTML = `
          <div style="display:flex;justify-content:between;align-items:flex-start;gap:8px;">
            <div style="flex:1;">
              <div style="font-size:12px;color:var(--text);margin-bottom:4px;font-weight:500;">
                ${escapeHtml(note.title || 'Note')}
              </div>
              ${note.summary ? `
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;line-height:1.3;">
                  ${escapeHtml(note.summary.length > 100 ? note.summary.substring(0, 100) + '...' : note.summary)}
                </div>
              ` : ''}
              <div style="font-size:10px;color:var(--text-dim);display:flex;gap:8px;">
                <span>${Math.floor(note.duration / 60)}:${(note.duration % 60).toString().padStart(2, '0')}</span>
                <span>•</span>
                <span>${new Date(note.createdAt).toLocaleDateString('en-GB')}</span>
              </div>
            </div>
            <div style="flex-shrink:0;font-size:10px;color:${statusColor};">
              ${statusText}
            </div>
          </div>
        `;

        noteEl.addEventListener('mouseenter', () => {
          noteEl.style.background = 'rgba(255,255,255,0.03)';
        });

        noteEl.addEventListener('mouseleave', () => {
          noteEl.style.background = '';
        });

        noteEl.addEventListener('click', () => {
          showNoteDetails(note);
        });

        listEl.appendChild(noteEl);
      });
    }

    function showNoteDetails(note) {
      // Create a simple modal/overlay to show full transcript
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: var(--surface);
        border-radius: 12px;
        padding: 20px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        color: var(--text);
        border: 1px solid rgba(255,255,255,0.1);
      `;

      content.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h3 style="margin:0;color:var(--text);">${escapeHtml(note.title || 'Note')}</h3>
          <button class="claronote-modal-close"
                  style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:18px;">✕</button>
        </div>

        <div style="margin-bottom:15px;font-size:11px;color:var(--text-dim);display:flex;gap:12px;">
          <span>Duration: ${Math.floor(note.duration / 60)}:${(note.duration % 60).toString().padStart(2, '0')}</span>
          <span>Date: ${new Date(note.createdAt).toLocaleString('en-GB')}</span>
        </div>

        ${note.summary ? `
          <div style="margin-bottom:15px;">
            <h4 style="margin:0 0 8px 0;font-size:12px;color:var(--accent);">Summary</h4>
            <div style="font-size:12px;line-height:1.4;">${escapeHtml(note.summary)}</div>
          </div>
        ` : ''}

        ${note.transcript ? `
          <div>
            <h4 style="margin:0 0 8px 0;font-size:12px;color:var(--accent);">Transcript</h4>
            <div style="font-size:12px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(note.transcript)}</div>
          </div>
        ` : '<div style="font-size:12px;color:var(--text-dim);">Transcript not available yet</div>'}
      `;

      content.querySelector('.claronote-modal-close').addEventListener('click', () => modal.remove());

      modal.appendChild(content);
      document.body.appendChild(modal);

      // Close on backdrop click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
    }

    async function pollNoteStatus(noteId) {
      try {
        const response = await fetch(`http://localhost:8765/claronote/notes/${noteId}`);
        const data = await response.json();

        if (data.note && (data.note.status === 'PROCESSING' || data.note.status === 'UPLOADING')) {
          // Still processing, poll again in 2 seconds
          setTimeout(() => pollNoteStatus(noteId), 2000);
        } else {
          // Done processing, update UI
          document.getElementById('claronote-status-text').textContent = 'Ready to record';
          await loadClaroNoteNotes();
        }
      } catch (error) {
        console.error('Polling error:', error);
        document.getElementById('claronote-status-text').textContent = 'Ready to record';
      }
    }

    window.initClaroNote = initClaroNote;
    window.toggleClaroNoteRecording = toggleClaroNoteRecording;
})();
