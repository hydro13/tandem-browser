import path from 'path';
import os from 'os';
import fs from 'fs';
import { clipboard, nativeImage } from 'electron';
// No user-controlled paths — save directory is a compile-time constant
import { createLogger } from '../utils/logger';

const log = createLogger('ClipboardManager');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Types ──────────────────────────────────────────────────────────

// Save directory is fixed — no user-controlled paths to prevent path injection

const DEFAULT_SAVE_DIR = path.join(os.homedir(), 'Pictures', 'Tandem', 'clipboard');

export interface ClipboardImageInfo {
  width: number;
  height: number;
  base64: string;
  sizeBytes: number;
}

export interface ClipboardContent {
  hasText: boolean;
  hasImage: boolean;
  hasHTML: boolean;
  formats: string[];
  text?: string;
  html?: string;
  image?: ClipboardImageInfo;
}

export interface ClipboardSaveOptions {
  filename: string;
  format?: 'png' | 'jpg' | 'txt';
  quality?: number;
}

export interface ClipboardSaveResult {
  path: string;
  size: number;
}

// ─── Manager ────────────────────────────────────────────────────────

/**
 * ClipboardManager — reads, writes, and saves clipboard content (text and images).
 */
export class ClipboardManager {

  // === 4. Public methods ===

  read(): ClipboardContent {
    const formats = clipboard.availableFormats();
    const hasText = formats.some(f => f.includes('text/plain') || f.includes('text/uri-list'));
    const hasHTML = formats.some(f => f.includes('text/html'));
    const hasImage = formats.some(f => f.includes('image/'));

    const result: ClipboardContent = { hasText, hasImage, hasHTML, formats };

    if (hasText) {
      result.text = clipboard.readText();
    }
    if (hasHTML) {
      result.html = clipboard.readHTML();
    }
    if (hasImage) {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const pngBuffer = img.toPNG();
        if (pngBuffer.length <= MAX_IMAGE_BYTES) {
          const size = img.getSize();
          result.image = {
            width: size.width,
            height: size.height,
            base64: `data:image/png;base64,${pngBuffer.toString('base64')}`,
            sizeBytes: pngBuffer.length,
          };
        } else {
          log.warn(`Clipboard image too large (${pngBuffer.length} bytes), skipping base64`);
          const size = img.getSize();
          result.image = {
            width: size.width,
            height: size.height,
            base64: '',
            sizeBytes: pngBuffer.length,
          };
        }
      }
    }

    return result;
  }

  writeText(text: string): void {
    clipboard.writeText(text);
  }

  writeImage(base64Data: string): void {
    const raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    const img = nativeImage.createFromBuffer(buffer);
    if (img.isEmpty()) {
      throw new Error('Invalid image data');
    }
    clipboard.writeImage(img);
  }

  saveAs(options: ClipboardSaveOptions): ClipboardSaveResult {
    const { quality = 90 } = options;

    // Sanitize filename — only allow simple filenames, no path traversal
    const filename = path.basename(String(options.filename || ''));
    if (!filename || filename.startsWith('.')) {
      throw new Error('Invalid filename: must be a simple filename without path separators');
    }

    // Always save to the fixed safe directory — no user-controlled directory input.
    // This eliminates path injection entirely: the directory is a compile-time constant.
    const saveDir = DEFAULT_SAVE_DIR;
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    const safePath = path.join(saveDir, filename);

    // Detect format from filename extension if not specified
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const format = options.format || (ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'txt' ? 'txt' : 'png');

    let buffer: Buffer;

    if (format === 'txt') {
      const text = clipboard.readText();
      if (!text) {
        throw new Error('No text on clipboard to save');
      }
      buffer = Buffer.from(text, 'utf-8');
    } else {
      const img = clipboard.readImage();
      if (img.isEmpty()) {
        throw new Error('No image on clipboard to save');
      }
      buffer = format === 'jpg' ? img.toJPEG(quality) : img.toPNG();
    }

    fs.writeFileSync(safePath, buffer);
    log.info(`Saved clipboard to ${safePath} (${buffer.length} bytes)`);

    return { path: safePath, size: buffer.length };
  }
}
