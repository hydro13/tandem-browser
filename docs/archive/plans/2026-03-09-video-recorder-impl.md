# Video Recorder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Built-in screen recorder with Application and Region modes, outputting MP4 with optional audio.

**Architecture:** desktopCapturer + MediaRecorder in renderer captures WebM chunks, sent via IPC to main process. On stop, ffmpeg-static converts WebM → MP4. Replaces AudioCaptureManager.

**Tech Stack:** Electron desktopCapturer, MediaRecorder API, ffmpeg-static, IPC

**Design doc:** `docs/plans/2026-03-09-video-recorder-design.md`

---

### Task 1: Install ffmpeg-static dependency

**Files:**
- Modify: `package.json`

**Step 1: Install ffmpeg-static**

Run: `npm install ffmpeg-static`

**Step 2: Verify installation**

Run: `node -e "console.log(require('ffmpeg-static'))"`
Expected: Path to ffmpeg binary

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add ffmpeg-static dependency for video recording"
```

---

### Task 2: Create VideoRecorderManager (main process)

**Files:**
- Create: `src/video/recorder.ts`
- Remove: `src/audio/capture.ts`

**Step 1: Create `src/video/recorder.ts`**

```typescript
import { app, nativeImage } from 'electron';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('VideoRecorder');

// ffmpeg-static provides the path to the bundled ffmpeg binary
let ffmpegPath: string;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = 'ffmpeg'; // fallback to system ffmpeg
}

interface Recording {
  id: string;
  filename: string;
  filePath: string;
  startedAt: number;
  stoppedAt: number | null;
  duration: number;
  mode: 'application' | 'region';
  region?: { x: number; y: number; width: number; height: number };
}

export class VideoRecorderManager {
  private recording = false;
  private currentRecordingId: string | null = null;
  private startTime = 0;
  private recordings: Recording[] = [];
  private recordingsDir: string;
  private tmpDir: string;
  private moviesDir: string;
  private currentTmpPath: string | null = null;
  private currentMode: 'application' | 'region' = 'application';
  private currentRegion?: { x: number; y: number; width: number; height: number };
  private writeStream: fs.WriteStream | null = null;

  constructor() {
    this.recordingsDir = tandemDir('recordings');
    this.tmpDir = path.join(this.recordingsDir, 'tmp');
    this.moviesDir = path.join(
      app.getPath('home'), 'Movies', 'Tandem'
    );
    for (const dir of [this.recordingsDir, this.tmpDir, this.moviesDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    this.loadIndex();
  }

  private getIndexPath(): string {
    return path.join(this.recordingsDir, 'index.json');
  }

  private loadIndex(): void {
    try {
      const p = this.getIndexPath();
      if (fs.existsSync(p)) {
        this.recordings = JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    } catch {
      this.recordings = [];
    }
  }

  private saveIndex(): void {
    try {
      fs.writeFileSync(this.getIndexPath(), JSON.stringify(this.recordings, null, 2));
    } catch { /* ignore */ }
  }

  startRecording(mode: 'application' | 'region', region?: { x: number; y: number; width: number; height: number }): { ok: boolean; id?: string; error?: string } {
    if (this.recording) return { ok: false, error: 'Already recording' };

    const id = `rec-${Date.now()}`;
    const tmpFilename = `${id}.webm`;
    this.currentTmpPath = path.join(this.tmpDir, tmpFilename);
    this.writeStream = fs.createWriteStream(this.currentTmpPath);

    this.recording = true;
    this.currentRecordingId = id;
    this.startTime = Date.now();
    this.currentMode = mode;
    this.currentRegion = region;

    log.info(`Recording started: ${id} (${mode})`);
    return { ok: true, id };
  }

  writeChunk(data: Buffer): void {
    if (!this.recording || !this.writeStream) return;
    this.writeStream.write(data);
  }

  async stopRecording(): Promise<{ ok: boolean; recording?: Recording; error?: string }> {
    if (!this.recording || !this.currentRecordingId || !this.currentTmpPath) {
      return { ok: false, error: 'Not recording' };
    }

    const id = this.currentRecordingId;
    const tmpPath = this.currentTmpPath;
    const duration = Math.round((Date.now() - this.startTime) / 1000);

    // Close write stream
    if (this.writeStream) {
      await new Promise<void>((resolve) => {
        this.writeStream!.end(() => resolve());
      });
      this.writeStream = null;
    }

    this.recording = false;
    this.currentRecordingId = null;
    this.startTime = 0;

    // Convert WebM → MP4
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const mp4Filename = `tandem-recording-${timestamp}.mp4`;
    const moviesPath = path.join(this.moviesDir, mp4Filename);
    const appPath = path.join(this.recordingsDir, mp4Filename);

    try {
      await this.convertToMp4(tmpPath, moviesPath);
      fs.copyFileSync(moviesPath, appPath);
      // Clean up tmp
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    } catch (e) {
      log.warn('ffmpeg conversion failed, keeping WebM:', e);
      // Fallback: move webm as-is
      const webmFilename = `tandem-recording-${timestamp}.webm`;
      const fallbackPath = path.join(this.recordingsDir, webmFilename);
      try { fs.renameSync(tmpPath, fallbackPath); } catch { /* ignore */ }
      return { ok: false, error: `ffmpeg conversion failed: ${e instanceof Error ? e.message : e}` };
    }

    const rec: Recording = {
      id,
      filename: mp4Filename,
      filePath: moviesPath,
      startedAt: this.startTime,
      stoppedAt: Date.now(),
      duration,
      mode: this.currentMode,
      region: this.currentRegion,
    };
    this.recordings.push(rec);
    this.saveIndex();

    log.info(`Recording finished: ${mp4Filename} (${duration}s)`);
    return { ok: true, recording: rec };
  }

  private convertToMp4(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ], { timeout: 300_000 }, (err, _stdout, stderr) => {
        if (err) {
          log.warn('ffmpeg stderr:', stderr);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  isRecording(): boolean {
    return this.recording;
  }

  getStatus(): { recording: boolean; id?: string; duration?: number; mode?: string } {
    if (!this.recording) return { recording: false };
    return {
      recording: true,
      id: this.currentRecordingId || undefined,
      duration: Math.round((Date.now() - this.startTime) / 1000),
      mode: this.currentMode,
    };
  }

  listRecordings(limit = 50): Recording[] {
    return this.recordings.slice(-limit).reverse();
  }

  /** Force-stop on app quit */
  forceStop(): void {
    if (!this.recording) return;
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
    this.recording = false;
    log.info('Recording force-stopped on app quit');
  }
}
```

**Step 2: Delete `src/audio/capture.ts`**

Run: `rm src/audio/capture.ts`

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Errors about missing AudioCaptureManager references (expected, fixed in Task 3)

**Step 4: Commit**

```bash
git add src/video/recorder.ts
git rm src/audio/capture.ts
git commit -m "feat: add VideoRecorderManager, remove AudioCaptureManager"
```

---

### Task 3: Wire VideoRecorderManager into bootstrap

Replace all AudioCaptureManager references with VideoRecorderManager.

**Files:**
- Modify: `src/bootstrap/types.ts` — Change type from AudioCaptureManager to VideoRecorderManager
- Modify: `src/bootstrap/runtime.ts` — Import and instantiate VideoRecorderManager
- Modify: `src/registry.ts` — Change type
- Modify: `src/main.ts` — Update references (lines ~494, ~515)
- Modify: `src/menu/app-menu.ts` — Update import and recording toggle
- Modify: `src/api/routes/media.ts` — Update audio routes to use VideoRecorderManager

**Step 1: Update `src/bootstrap/types.ts`**

Replace:
```typescript
import type { AudioCaptureManager } from '../audio/capture';
```
With:
```typescript
import type { VideoRecorderManager } from '../video/recorder';
```

Replace:
```typescript
audioCaptureManager: AudioCaptureManager;
```
With:
```typescript
videoRecorderManager: VideoRecorderManager;
```

**Step 2: Update `src/bootstrap/runtime.ts`**

Replace import:
```typescript
import { AudioCaptureManager } from '../audio/capture';
```
With:
```typescript
import { VideoRecorderManager } from '../video/recorder';
```

Replace instantiation (~line 153):
```typescript
runtime.audioCaptureManager = new AudioCaptureManager();
```
With:
```typescript
runtime.videoRecorderManager = new VideoRecorderManager();
```

Replace in deps object (~line 292):
```typescript
audioCaptureManager: runtime.audioCaptureManager,
```
With:
```typescript
videoRecorderManager: runtime.videoRecorderManager,
```

Replace in teardown (~line 368):
```typescript
runtime.audioCaptureManager.stopRecording();
```
With:
```typescript
runtime.videoRecorderManager.forceStop();
```

**Step 3: Update `src/registry.ts`**

Same pattern: replace `AudioCaptureManager` import and type with `VideoRecorderManager`.

**Step 4: Update `src/main.ts`**

Replace both occurrences (~lines 496, 515):
```typescript
audioCaptureManager: runtime?.audioCaptureManager ?? null,
```
With:
```typescript
videoRecorderManager: runtime?.videoRecorderManager ?? null,
```

**Step 5: Update `src/menu/app-menu.ts`**

Replace import and update the recording menu item to use `deps.videoRecorderManager` instead of `deps.audioCaptureManager`. Keep the same Cmd+R shortcut but update method calls.

**Step 6: Update `src/api/routes/media.ts`**

Replace `ctx.audioCaptureManager` with `ctx.videoRecorderManager` in all 4 audio routes. Update method signatures where needed (startRecording now takes mode parameter, stopRecording is now async).

**Step 7: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 8: Commit**

```bash
git add src/bootstrap/types.ts src/bootstrap/runtime.ts src/registry.ts src/main.ts src/menu/app-menu.ts src/api/routes/media.ts
git commit -m "refactor: replace AudioCaptureManager with VideoRecorderManager"
```

---

### Task 4: Extend screenshot menu with Record options

**Files:**
- Modify: `src/ipc/handlers.ts` — Add Record submenu to show-screenshot-menu handler (~line 193)

**Step 1: Update menu template**

In `src/ipc/handlers.ts`, replace the `show-screenshot-menu` handler (~lines 193-216) to add a separator and Record submenu:

```typescript
ipcMain.handle('show-screenshot-menu', async (_event, anchor: { x?: number; y?: number }) => {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Web Page',
      click: () => _win.webContents.send('screenshot-mode-selected', 'page'),
    },
    {
      label: 'Application',
      click: () => _win.webContents.send('screenshot-mode-selected', 'application'),
    },
    {
      label: 'Region',
      click: () => _win.webContents.send('screenshot-mode-selected', 'region'),
    },
    { type: 'separator' },
    {
      label: 'Record Application',
      click: () => _win.webContents.send('recording-mode-selected', 'application'),
    },
    {
      label: 'Record Region',
      click: () => _win.webContents.send('recording-mode-selected', 'region'),
    },
  ]);

  menu.popup({
    window: _win,
    x: typeof anchor?.x === 'number' ? anchor.x : undefined,
    y: typeof anchor?.y === 'number' ? anchor.y : undefined,
  });

  return { ok: true };
});
```

**Step 2: Add recording IPC handlers**

Add after the screenshot handlers:

```typescript
ipcMain.handle('start-recording', async (_event, data: {
  mode: 'application' | 'region';
  region?: { x: number; y: number; width: number; height: number };
}) => {
  return videoRecorderManager.startRecording(data.mode, data.region);
});

ipcMain.on('recording-chunk', (_event, data: ArrayBuffer) => {
  videoRecorderManager.writeChunk(Buffer.from(data));
});

ipcMain.handle('stop-recording', async () => {
  const result = await videoRecorderManager.stopRecording();
  if (result.ok && result.recording) {
    _win.webContents.send('recording-finished', {
      path: result.recording.filePath,
      filename: result.recording.filename,
      duration: result.recording.duration,
    });
  }
  return result;
});
```

Make sure `videoRecorderManager` is accessible — it comes from the deps/runtime passed to the handler registration function.

**Step 3: Register new IPC channels in cleanup array**

Add `'start-recording'`, `'stop-recording'`, `'recording-chunk'` to the ipcChannels and ipcHandlers arrays at the top of the function.

**Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 5: Commit**

```bash
git add src/ipc/handlers.ts
git commit -m "feat: add Record Application/Region to screenshot menu and recording IPC handlers"
```

---

### Task 5: Add preload API for recording

**Files:**
- Modify: `src/preload.ts` — Add recording methods to the tandem bridge

**Step 1: Add recording API to preload**

Add near the existing `captureScreenshot` and `showScreenshotMenu` entries (~line 111):

```typescript
// Recording
startRecording: (mode: 'application' | 'region', region?: { x: number; y: number; width: number; height: number }) =>
  ipcRenderer.invoke('start-recording', { mode, region }),
stopRecording: () => ipcRenderer.invoke('stop-recording'),
sendRecordingChunk: (data: ArrayBuffer) => ipcRenderer.send('recording-chunk', data),
onRecordingModeSelected: (callback: (mode: 'application' | 'region') => void) => {
  const handler = (_event: Electron.IpcRendererEvent, mode: 'application' | 'region') => callback(mode);
  ipcRenderer.on('recording-mode-selected', handler);
  return () => ipcRenderer.removeListener('recording-mode-selected', handler);
},
onRecordingFinished: (callback: (data: { path: string; filename: string; duration: number }) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, data: { path: string; filename: string; duration: number }) => callback(data);
  ipcRenderer.on('recording-finished', handler);
  return () => ipcRenderer.removeListener('recording-finished', handler);
},
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add src/preload.ts
git commit -m "feat: expose recording APIs in preload bridge"
```

---

### Task 6: Add recording overlay bar HTML + CSS

**Files:**
- Modify: `shell/index.html` — Add recording overlay bar HTML
- Modify: `shell/css/browser-shell.css` — Add overlay bar styles

**Step 1: Add HTML to `shell/index.html`**

Add after the existing `region-capture-overlay` div (~line 15):

```html
<!-- Recording overlay bar -->
<div id="recording-overlay-bar" class="recording-overlay-bar">
  <span class="recording-dot"></span>
  <span id="recording-timer" class="recording-timer">0:00</span>
  <button id="recording-mic-toggle" class="recording-mic-btn" title="Toggle microphone">🎤 On</button>
  <div class="recording-separator"></div>
  <button id="recording-stop-btn" class="recording-stop-btn" title="Stop recording (Esc)">■ Stop</button>
</div>
```

**Step 2: Add script include**

Add before the closing `</body>` tag, near the other script includes:

```html
<script src="js/video-recorder.js"></script>
```

**Step 3: Add CSS to `shell/css/browser-shell.css`**

```css
/* ── Recording overlay bar ── */
.recording-overlay-bar {
  display: none;
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100000;
  background: rgba(7, 10, 18, 0.88);
  border: 1px solid rgba(233, 69, 96, 0.5);
  border-radius: 8px;
  padding: 6px 16px;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--text-primary);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  user-select: none;
  -webkit-app-region: no-drag;
}
.recording-overlay-bar.active {
  display: flex;
}
.recording-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e94560;
  animation: recording-pulse 1s ease-in-out infinite;
}
@keyframes recording-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.recording-timer {
  font-variant-numeric: tabular-nums;
  min-width: 3em;
}
.recording-mic-btn,
.recording-stop-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-primary);
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}
.recording-mic-btn:hover,
.recording-stop-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.recording-stop-btn {
  border-color: rgba(233, 69, 96, 0.5);
  color: #e94560;
}
.recording-stop-btn:hover {
  background: rgba(233, 69, 96, 0.15);
}
.recording-separator {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.15);
}
```

**Step 4: Commit**

```bash
git add shell/index.html shell/css/browser-shell.css
git commit -m "feat: add recording overlay bar HTML and CSS"
```

---

### Task 7: Create renderer-side video recorder

**Files:**
- Create: `shell/js/video-recorder.js`

**Step 1: Create `shell/js/video-recorder.js`**

This is the core renderer file handling desktopCapturer, MediaRecorder, region canvas crop, mic toggle, overlay bar, and IPC communication.

```javascript
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

  // ── Region selection (reuse existing logic from wingman.js) ──

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

      const onDown = (e) => { dragging = true; startX = e.clientX; startY = e.clientY; updateRegionBox(startX, startY, startX, startY); };
      const onMove = (e) => { if (dragging) updateRegionBox(startX, startY, e.clientX, e.clientY); };
      const onUp = (e) => {
        if (!dragging) return cleanup();
        dragging = false;
        const left = Math.min(startX, e.clientX), top = Math.min(startY, e.clientY);
        const width = Math.abs(e.clientX - startX), height = Math.abs(e.clientY - startY);
        if (width < 50 || height < 50) return cleanup();
        cleanup({ x: left, y: top, width, height });
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cleanup(); } };

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
      // Get the Tandem window source via desktopCapturer
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({ types: ['window'], fetchWindowIcons: false });
      const tandemSource = sources.find(s => s.name.includes('Tandem')) || sources[0];

      if (!tandemSource) {
        console.error('[video-recorder] No window source found');
        return;
      }

      // Get video stream from the window
      const videoConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: tandemSource.id,
          maxFrameRate: 30,
        },
      };

      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });

      // If region mode, crop via canvas
      let recordStream = mediaStream;
      if (mode === 'region' && region) {
        const videoTrack = mediaStream.getVideoTracks()[0];
        const { width: trackWidth, height: trackHeight } = videoTrack.getSettings();
        const scaleX = trackWidth / window.innerWidth;
        const scaleY = trackHeight / window.innerHeight;

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(region.width * scaleX);
        canvas.height = Math.round(region.height * scaleY);
        const ctx = canvas.getContext('2d');

        const video = document.createElement('video');
        video.srcObject = new MediaStream([videoTrack]);
        video.muted = true;
        await video.play();

        const drawFrame = () => {
          if (!isRecording) return;
          ctx.drawImage(video,
            Math.round(region.x * scaleX), Math.round(region.y * scaleY),
            canvas.width, canvas.height,
            0, 0, canvas.width, canvas.height
          );
          requestAnimationFrame(drawFrame);
        };
        drawFrame();

        recordStream = canvas.captureStream(30);
      }

      // Add tab audio
      try {
        const tabAudio = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: tandemSource.id,
            },
          },
          video: false,
        });
        tabAudio.getAudioTracks().forEach(t => recordStream.addTrack(t));
      } catch (e) {
        console.warn('[video-recorder] Tab audio not available:', e.message);
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

      // Start MediaRecorder
      mediaRecorder = new MediaRecorder(recordStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
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
        cleanup();
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
      cleanup();
    }
  }

  async function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    isRecording = false;
    mediaRecorder.stop();
    stopTimer();
    overlayBar.classList.remove('active');

    // Tell main to finalize (ffmpeg conversion)
    await window.tandem.stopRecording();
  }

  function cleanup() {
    isRecording = false;
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    mediaRecorder = null;
    stopTimer();
    overlayBar.classList.remove('active');
  }

  // ── UI handlers ──

  stopBtn.addEventListener('click', () => stopRecording());

  micBtn.addEventListener('click', () => {
    micEnabled = !micEnabled;
    micBtn.textContent = micEnabled ? '🎤 On' : '🎤 Off';
    micBtn.style.opacity = micEnabled ? '1' : '0.5';
    // Toggle mic track if recording
    if (micStream) {
      micStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
    }
  });

  // Esc to stop
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isRecording) {
      e.preventDefault();
      stopRecording();
    }
  });

  // ── IPC listeners ──

  window.tandem.onRecordingModeSelected(async (mode) => {
    if (isRecording) return; // already recording

    if (mode === 'region') {
      const region = await selectRecordRegion();
      if (!region) return;
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
```

**Step 2: Run app and test**

Run: `npm start`

Test manually:
1. Click screenshot button → verify Record Application and Record Region appear in menu
2. Click Record Application → overlay bar appears, timer ticks
3. Click Stop → overlay bar disappears, check `~/Movies/Tandem/` for MP4 file
4. Click Record Region → drag a region → recording starts → stop → check output

**Step 3: Commit**

```bash
git add shell/js/video-recorder.js
git commit -m "feat: implement renderer-side video recorder with region crop and audio"
```

---

### Task 8: Run TypeScript check + final verification

**Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 2: Verify screenshot feature still works**

Test: Web Page, Application, and Region screenshots should all still work correctly.

**Step 3: Verify recording**

Test all paths:
- Record Application → MP4 in `~/Movies/Tandem/`
- Record Region → select area → MP4 in `~/Movies/Tandem/`
- Mic toggle → verify mic icon changes
- Esc key → stops recording
- Timer counts correctly

**Step 4: Update TODO.md**

Mark the session recording item as completed and update the description.

**Step 5: Final commit**

```bash
git add TODO.md
git commit -m "feat: built-in video recorder with Application and Region modes"
```
