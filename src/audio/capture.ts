import { desktopCapturer, webContents } from 'electron';
import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';

interface Recording {
  id: string;
  filename: string;
  filePath: string;
  startedAt: number;
  stoppedAt: number | null;
  duration: number; // seconds
  tabWebContentsId: number;
}

/**
 * AudioCaptureManager — Captures tab audio using Electron's desktopCapturer.
 * 
 * Uses desktopCapturer to get audio streams from tabs.
 * Recordings saved as WebM in ~/.tandem/recordings/
 * 
 * Cmd+R toggles recording of the active tab.
 */
export class AudioCaptureManager {
  private recording = false;
  private currentRecordingId: string | null = null;
  private startTime: number = 0;
  private recordings: Recording[] = [];
  private recordingsDir: string;
  private currentTabWcId: number = 0;
  private mediaRecorderCleanup: (() => void) | null = null;

  constructor() {
    this.recordingsDir = tandemDir('recordings');
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    }
    // Load existing recordings index
    this.loadIndex();
  }

  private getIndexPath(): string {
    return path.join(this.recordingsDir, 'index.json');
  }

  private loadIndex(): void {
    try {
      const indexPath = this.getIndexPath();
      if (fs.existsSync(indexPath)) {
        this.recordings = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      }
    } catch {
      this.recordings = [];
    }
  }

  private saveIndex(): void {
    try {
      fs.writeFileSync(this.getIndexPath(), JSON.stringify(this.recordings, null, 2));
    } catch {
      // ignore
    }
  }

  /**
   * Start recording audio from a tab's webContents.
   * 
   * NOTE: Electron's desktopCapturer captures system/window audio.
   * For tab-specific audio, we use the webContents' media stream.
   * The actual MediaRecorder runs in a hidden renderer — here we
   * set up the state and coordinate with the renderer.
   */
  async startRecording(tabWebContentsId: number): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (this.recording) {
      return { ok: false, error: 'Already recording' };
    }

    const wc = webContents.fromId(tabWebContentsId);
    if (!wc) {
      return { ok: false, error: 'Tab webContents not found' };
    }

    const id = `rec-${Date.now()}`;
    const filename = `tandem-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;

    this.recording = true;
    this.currentRecordingId = id;
    this.startTime = Date.now();
    this.currentTabWcId = tabWebContentsId;

    // We'll use desktopCapturer to get available sources
    // For now, mark as recording — actual audio capture requires renderer-side
    // MediaRecorder which we'll coordinate via IPC
    const recording: Recording = {
      id,
      filename,
      filePath: path.join(this.recordingsDir, filename),
      startedAt: this.startTime,
      stoppedAt: null,
      duration: 0,
      tabWebContentsId,
    };

    this.recordings.push(recording);
    this.saveIndex();

    console.log(`🎙️ Recording started: ${filename}`);
    return { ok: true, id };
  }

  /** Stop the current recording */
  stopRecording(): { ok: boolean; recording?: Recording; error?: string } {
    if (!this.recording || !this.currentRecordingId) {
      return { ok: false, error: 'Not recording' };
    }

    const idx = this.recordings.findIndex(r => r.id === this.currentRecordingId);
    if (idx !== -1) {
      const rec = this.recordings[idx];
      rec.stoppedAt = Date.now();
      rec.duration = Math.round((rec.stoppedAt - rec.startedAt) / 1000);
      this.saveIndex();
    }

    if (this.mediaRecorderCleanup) {
      this.mediaRecorderCleanup();
      this.mediaRecorderCleanup = null;
    }

    const stopped = idx !== -1 ? this.recordings[idx] : undefined;
    this.recording = false;
    this.currentRecordingId = null;
    this.startTime = 0;

    console.log(`🎙️ Recording stopped${stopped ? `: ${stopped.filename} (${stopped.duration}s)` : ''}`);
    return { ok: true, recording: stopped };
  }

  /** Check if currently recording */
  isRecording(): boolean {
    return this.recording;
  }

  /** Get current recording status */
  getStatus(): { recording: boolean; id?: string; duration?: number; tabWebContentsId?: number } {
    if (!this.recording) return { recording: false };
    return {
      recording: true,
      id: this.currentRecordingId || undefined,
      duration: Math.round((Date.now() - this.startTime) / 1000),
      tabWebContentsId: this.currentTabWcId,
    };
  }

  /** List all recordings */
  listRecordings(limit: number = 50): Recording[] {
    return this.recordings.slice(-limit).reverse();
  }

  /** Get available audio sources via desktopCapturer */
  async getAudioSources(): Promise<Electron.DesktopCapturerSource[]> {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      fetchWindowIcons: false,
    });
    return sources;
  }

  /** Write raw audio data to the current recording file */
  writeAudioChunk(data: Buffer): void {
    if (!this.recording || !this.currentRecordingId) return;
    const idx = this.recordings.findIndex(r => r.id === this.currentRecordingId);
    if (idx === -1) return;
    try {
      fs.appendFileSync(this.recordings[idx].filePath, data);
    } catch {
      // ignore write errors
    }
  }

  /** Set a cleanup function for the media recorder */
  setCleanup(fn: () => void): void {
    this.mediaRecorderCleanup = fn;
  }
}
