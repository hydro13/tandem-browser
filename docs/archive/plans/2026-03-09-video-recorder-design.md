# Video Recorder — Design

**Date:** 2026-03-09
**Status:** Approved
**Approach:** desktopCapturer + MediaRecorder → WebM → ffmpeg → MP4

## Summary

Built-in screen recorder for Tandem, mirroring the screenshot feature with Application and Region capture modes. Records video + optional audio (tab audio and microphone toggle). Outputs MP4 files suitable for editing. Replaces the existing `AudioCaptureManager`.

## Requirements

- **Modes:** Application (full window) and Region (user-selected area)
- **Output:** MP4 (H.264 + AAC) via ffmpeg conversion from WebM
- **Audio:** Tab audio captured by default, microphone toggle during recording
- **Quality:** 30fps, native display resolution
- **UX:** Floating overlay bar with timer, mic toggle, and stop button; Esc to stop
- **Storage:** `~/Movies/Tandem/` + `~/.tandem/recordings/`
- **Dependency:** `ffmpeg-static` bundled (~70MB)

## Architecture

### Approach

Use Electron's `desktopCapturer` to obtain a window media stream in the renderer process. `MediaRecorder` encodes to WebM (VP9 + Opus). Chunks are sent via IPC to the main process which writes to a temp file. On stop, ffmpeg converts WebM → MP4.

### Menu

The screenshot button menu is extended with a Record submenu:

```
Screenshot
  ├ Web Page
  ├ Application
  └ Region
──────────
Record
  ├ Application
  └ Region
```

### Recording Overlay Bar

Floating bar at the top of the window during recording:

```
┌──────────────────────────────────┐
│  ⏺ 0:32   🎤 On  │  ■ Stop    │
└──────────────────────────────────┘
```

- Centered, semi-transparent dark background
- Pulsing red dot (CSS animation)
- Mic toggle button (on/off during recording)
- Stop button + Esc key to stop
- Bar positioned outside capture region in Region mode

## Files

### New
- `src/video/recorder.ts` — `VideoRecorderManager`: state management, ffmpeg conversion, file storage, index
- `shell/js/video-recorder.js` — Renderer: desktopCapturer stream, MediaRecorder, canvas crop for region, IPC chunk sending

### Modified
- `src/ipc/handlers.ts` — IPC channels: `start-recording`, `stop-recording`, `recording-chunk`, `recording-status`; extend menu with Record submenu
- `src/preload.ts` — Expose recording APIs to shell
- `shell/index.html` — Recording overlay bar HTML + script include
- `shell/css/browser-shell.css` — Overlay bar styling
- `src/main.ts` — Instantiate `VideoRecorderManager`, replace `AudioCaptureManager`
- `package.json` — Add `ffmpeg-static` dependency

### Removed
- `src/audio/capture.ts` — Replaced by `VideoRecorderManager`

## IPC Flow

```
Shell (renderer)                    Main process
─────────────────                   ─────────────
User clicks Record App/Region
  → selectRegion() if region mode
  → desktopCapturer.getSources()
  → getUserMedia(source)
  → canvas crop (region only)
  → new MediaRecorder(stream)
  → IPC 'start-recording' ────────→ Create temp .webm, init state
  → IPC 'recording-chunk' ────────→ Append buffer to temp file
     (every ~1s)
  → User clicks Stop / Esc
  → IPC 'stop-recording' ─────────→ Finalize .webm
                                     Spawn ffmpeg .webm → .mp4
                                     Save to Movies + app data
  ← IPC 'recording-finished' ←───── Path + duration + thumbnail
```

## Storage

- Temp WebM: `~/.tandem/recordings/tmp/`
- Final MP4: `~/Movies/Tandem/tandem-recording-{timestamp}.mp4`
- App data: `~/.tandem/recordings/tandem-recording-{timestamp}.mp4`
- Index: `~/.tandem/recordings/index.json`

## Error Handling

- **Screen Recording permission denied:** Show notification with link to System Preferences
- **ffmpeg conversion fails:** Keep .webm as fallback, show error message
- **App quit during recording:** `will-quit` handler stops recording and forces ffmpeg conversion
- **Region too small:** Minimum 50x50 pixels
- **Overlay bar in region mode:** Positioned outside the capture area so it's not recorded
