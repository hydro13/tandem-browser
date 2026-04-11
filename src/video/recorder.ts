import { app } from 'electron';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('VideoRecorder');

let ffmpegPath: string;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = 'ffmpeg';
}

// ─── Types ──────────────────────────────────────────────────────────

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

// ─── Manager ────────────────────────────────────────────────────────

/**
 * VideoRecorderManager — records the browser window to MP4 via ffmpeg.
 *
 * Persistence: ~/Movies/Tandem/ and ~/.tandem/recordings/
 */
export class VideoRecorderManager {

  // === 1. Private state ===

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

  // === 2. Constructor ===

  constructor() {
    this.recordingsDir = tandemDir('recordings');
    this.tmpDir = path.join(this.recordingsDir, 'tmp');
    this.moviesDir = path.join(app.getPath('home'), 'Movies', 'Tandem');
    for (const dir of [this.recordingsDir, this.tmpDir, this.moviesDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    this.loadIndex();
  }

  // === 4. Public methods ===

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
    const startedAt = this.startTime;
    const mode = this.currentMode;
    const region = this.currentRegion;

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
    this.currentTmpPath = null;

    // Convert WebM → MP4
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const mp4Filename = `tandem-recording-${timestamp}.mp4`;
    const moviesPath = path.join(this.moviesDir, mp4Filename);
    // appPath was used for a redundant copy to recordingsDir — removed, movies dir is sufficient
    const stoppedAt = Date.now();
    const duration = Math.round((stoppedAt - startedAt) / 1000);

    try {
      await this.convertToMp4(tmpPath, moviesPath);

      // Verify the output file is valid (moov atom check via file size sanity)
      const outputStats = fs.existsSync(moviesPath) ? fs.statSync(moviesPath) : null;
      if (!outputStats || outputStats.size < 1024) {
        throw new Error(`Output file missing or too small (${outputStats?.size ?? 0} bytes)`);
      }

      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    } catch (e) {
      log.warn('ffmpeg conversion failed, keeping WebM:', e);
      // Keep the webm as fallback — rename to movies dir so user can find it
      const webmFilename = `tandem-recording-${timestamp}.webm`;
      const fallbackMoviesPath = path.join(this.moviesDir, webmFilename);
      const fallbackAppPath = path.join(this.recordingsDir, webmFilename);
      try {
        fs.copyFileSync(tmpPath, fallbackMoviesPath);
        fs.copyFileSync(tmpPath, fallbackAppPath);
        fs.unlinkSync(tmpPath);
      } catch { /* ignore */ }
      // Clean up corrupt mp4 if it was partially written
      if (fs.existsSync(moviesPath)) try { fs.unlinkSync(moviesPath); } catch { /* ignore */ }
      return { ok: false, error: `ffmpeg conversion failed: ${e instanceof Error ? e.message : e}` };
    }

    const rec: Recording = {
      id,
      filename: mp4Filename,
      filePath: moviesPath,
      startedAt,
      stoppedAt,
      duration,
      mode,
      region,
    };
    this.recordings.push(rec);
    this.saveIndex();

    log.info(`Recording finished: ${mp4Filename} (${duration}s)`);
    return { ok: true, recording: rec };
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

  forceStop(): void {
    if (!this.recording) return;
    const tmpPath = this.currentTmpPath;
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
    this.recording = false;
    this.currentRecordingId = null;
    this.startTime = 0;
    this.currentTmpPath = null;
    log.info('Recording force-stopped on app quit');

    // Try to convert the webm to mp4 in the background even on force-stop
    if (tmpPath && fs.existsSync(tmpPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const mp4Filename = `tandem-recording-${timestamp}.mp4`;
      const moviesPath = path.join(this.moviesDir, mp4Filename);
      log.info(`Force-stop: converting ${tmpPath} → ${moviesPath}`);
      this.convertToMp4(tmpPath, moviesPath)
        .then(() => {
          log.info(`Force-stop conversion done: ${mp4Filename}`);
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        })
        .catch(e => {
          log.warn('Force-stop conversion failed, keeping webm:', e instanceof Error ? e.message : e);
        });
    }
  }

  // === 7. Private I/O ===

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

  private convertToMp4(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-r', '30',
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
}
