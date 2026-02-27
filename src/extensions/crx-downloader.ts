import https from 'https';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { tandemDir, ensureDir } from '../utils/paths';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  extensionId: string;
  name: string;
  version: string;
  installPath: string;
  signatureVerified: boolean; // true if CRX3 signature verified OK
  contentScriptPatterns?: string[]; // e.g. ["<all_urls>", "https://github.com/*"]
  error?: string;
  warning?: string; // e.g. "manifest.json missing 'key' field..."
}

interface CrxVerificationResult {
  valid: boolean;
  format: 'crx2' | 'crx3';
  downloadedFromGoogle: boolean; // all redirects stayed on *.google.com / *.googleapis.com
  manifestValid: boolean;
  hasKeyField: boolean;
  error?: string;
}

interface DownloadResult {
  buffer: Buffer;
  allHostsGoogle: boolean; // whether all redirect hosts were *.google.com / *.googleapis.com
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CRX_MAGIC = Buffer.from('Cr24');
const EXTENSION_ID_REGEX = /^[a-p]{32}$/;
const CWS_URL_REGEX = /\/([a-p]{32})(?:[/?]|$)/;
const GOOGLE_HOST_REGEX = /\.(google\.com|googleapis\.com|googleusercontent\.com)$/;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 3000, 9000];
const DOWNLOAD_TIMEOUT_MS = 30000;

/**
 * CrxDownloader — Downloads CRX files from Chrome Web Store,
 * verifies integrity, extracts, and installs them to ~/.tandem/extensions/.
 */
export class CrxDownloader {
  private extensionsDir: string;

  constructor() {
    this.extensionsDir = ensureDir(tandemDir('extensions'));
  }

  /**
   * Main entry point: install an extension from Chrome Web Store.
   * Accepts a CWS URL or bare extension ID.
   */
  async installFromCws(input: string): Promise<InstallResult> {
    const extensionId = this.extractExtensionId(input);
    if (!extensionId) {
      return {
        success: false,
        extensionId: '',
        name: '',
        version: '',
        installPath: '',
        signatureVerified: false,
        error: `Invalid extension ID or CWS URL: ${input}`,
      };
    }

    // Already-installed check
    const existingPath = path.join(this.extensionsDir, extensionId);
    if (fs.existsSync(existingPath)) {
      const manifestPath = path.join(existingPath, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const contentScriptPatterns = this.extractContentScriptPatterns(manifest);
          console.log(`🧩 Extension ${extensionId} already installed at ${existingPath}`);
          return {
            success: true,
            extensionId,
            name: manifest.name || extensionId,
            version: manifest.version || '0.0.0',
            installPath: existingPath,
            signatureVerified: false,
            contentScriptPatterns,
          };
        } catch {
          // Manifest exists but invalid — fall through to reinstall
        }
      }
    }

    // Build CWS download URL
    const chromiumVersion = process.versions.chrome ?? '130.0.0.0';
    const cwsUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${chromiumVersion}&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;

    console.log(`🧩 Downloading extension ${extensionId} from CWS (prodversion=${chromiumVersion})`);

    // Download with retry
    let downloadResult: DownloadResult;
    try {
      downloadResult = await this.downloadWithRetry(cwsUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        extensionId,
        name: '',
        version: '',
        installPath: '',
        signatureVerified: false,
        error: `Download failed: ${message}`,
      };
    }

    // Verify CRX format
    const verification = this.verifyCrxFormat(downloadResult.buffer, downloadResult.allHostsGoogle);
    if (!verification.valid) {
      return {
        success: false,
        extensionId,
        name: '',
        version: '',
        installPath: '',
        signatureVerified: false,
        error: `CRX verification failed: ${verification.error}`,
      };
    }

    console.log(`🧩 CRX format verified: ${verification.format}, downloadedFromGoogle=${verification.downloadedFromGoogle}`);

    // Extract CRX to extension directory
    let installPath: string;
    try {
      installPath = this.extractCrx(downloadResult.buffer, extensionId, verification.format);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        extensionId,
        name: '',
        version: '',
        installPath: '',
        signatureVerified: false,
        error: `CRX extraction failed: ${message}`,
      };
    }

    // Read and validate manifest
    const manifest = this.readManifest(installPath);
    if (!manifest) {
      // Clean up failed install
      fs.rmSync(installPath, { recursive: true, force: true });
      return {
        success: false,
        extensionId,
        name: '',
        version: '',
        installPath: '',
        signatureVerified: false,
        error: 'Extracted extension has no valid manifest.json',
      };
    }

    // Check manifest validity
    const manifestName = typeof manifest.name === 'string' ? manifest.name : '';
    const manifestVersion = typeof manifest.version === 'string' ? manifest.version : '';

    if (!manifestName || !manifestVersion) {
      fs.rmSync(installPath, { recursive: true, force: true });
      return {
        success: false,
        extensionId,
        name: '',
        version: '',
        installPath: '',
        signatureVerified: false,
        error: 'manifest.json missing required "name" or "version" fields',
      };
    }

    // Key field check
    let warning: string | undefined;
    if (!manifest.key) {
      warning = 'manifest.json missing "key" field — extension ID may not match CWS ID, OAuth flows may break';
      console.warn(`⚠️ Extension ${extensionId}: ${warning}`);
    }

    // Content script inventory for security auditing
    const contentScriptPatterns = this.extractContentScriptPatterns(manifest);
    if (contentScriptPatterns.length > 0) {
      console.log(`🧩 Extension ${extensionId} content script patterns: ${contentScriptPatterns.join(', ')}`);
    }

    console.log(`🧩 Extension ${extensionId} installed: ${manifestName} v${manifestVersion}`);

    // CRX3 RSA signature verification not yet implemented — warn user
    console.warn(`⚠️ Extension ${extensionId} installed WITHOUT cryptographic signature verification. Only install extensions from trusted sources (Chrome Web Store).`);

    return {
      success: true,
      extensionId,
      name: manifestName,
      version: manifestVersion,
      installPath,
      signatureVerified: false,
      contentScriptPatterns,
      warning: warning || 'Extension signature not verified — installed from Google CDN only',
    };
  }

  /**
   * Extract extension ID from a CWS URL or bare ID.
   */
  extractExtensionId(input: string): string | null {
    const trimmed = input.trim();

    // Bare extension ID
    if (EXTENSION_ID_REGEX.test(trimmed)) {
      return trimmed;
    }

    // CWS URL
    const match = trimmed.match(CWS_URL_REGEX);
    if (match) {
      return match[1];
    }

    return null;
  }

  /**
   * Download a file with retry and exponential backoff.
   * Only retries on 5xx / network errors, not 4xx.
   */
  private async downloadWithRetry(url: string): Promise<DownloadResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.downloadFile(url);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const is4xx = lastError.message.includes('HTTP 4');
        if (is4xx) {
          throw lastError; // Don't retry client errors
        }
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_BACKOFF_MS[attempt];
          console.log(`🧩 Download attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Download failed after retries');
  }

  /**
   * HTTP GET with redirect following. Returns the response buffer and
   * tracks whether all hosts in the redirect chain were Google-owned.
   */
  private downloadFile(url: string): Promise<DownloadResult> {
    return new Promise((resolve, reject) => {
      const chromiumVersion = process.versions.chrome ?? '130.0.0.0';
      const headers = {
        'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromiumVersion} Safari/537.36`,
        'Accept': 'application/x-chrome-extension',
      };

      const visitedHosts: string[] = [];

      const makeRequest = (requestUrl: string, redirectCount: number) => {
        if (redirectCount > 10) {
          reject(new Error('Too many redirects'));
          return;
        }

        const parsedUrl = new URL(requestUrl);
        visitedHosts.push(parsedUrl.hostname);

        const req = https.get(requestUrl, { headers, timeout: DOWNLOAD_TIMEOUT_MS }, (res) => {
          // Handle redirects
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, requestUrl).toString();
            res.resume(); // Consume response body to free up memory
            makeRequest(redirectUrl, redirectCount + 1);
            return;
          }

          // Check status code
          if (res.statusCode === 204) {
            res.resume();
            reject(new Error(`HTTP 204 No Content — extension may not exist or endpoint rejected the request`));
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} from ${parsedUrl.hostname}`));
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const allHostsGoogle = visitedHosts.every(h =>
              GOOGLE_HOST_REGEX.test(h)
            );
            resolve({ buffer, allHostsGoogle });
          });
          res.on('error', reject);
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
        });
      };

      makeRequest(url, 0);
    });
  }

  /**
   * Verify CRX format integrity (NOT full cryptographic signature verification).
   *
   * Checks:
   * 1. Magic bytes Cr24
   * 2. Version 2 or 3
   * 3. Download stayed on Google domains
   * 4. (ZIP validity and manifest checked separately after extraction)
   */
  private verifyCrxFormat(buffer: Buffer, allHostsGoogle: boolean): CrxVerificationResult {
    // Check minimum size
    if (buffer.length < 12) {
      return { valid: false, format: 'crx3', downloadedFromGoogle: allHostsGoogle, manifestValid: false, hasKeyField: false, error: 'File too small to be a valid CRX' };
    }

    // 1. Magic bytes
    if (!buffer.subarray(0, 4).equals(CRX_MAGIC)) {
      // Check if it's an HTML error page
      const head = buffer.subarray(0, 100).toString('utf-8').toLowerCase();
      if (head.includes('<html') || head.includes('<!doctype')) {
        return { valid: false, format: 'crx3', downloadedFromGoogle: allHostsGoogle, manifestValid: false, hasKeyField: false, error: 'Response is HTML (likely an error page), not a CRX file' };
      }
      return { valid: false, format: 'crx3', downloadedFromGoogle: allHostsGoogle, manifestValid: false, hasKeyField: false, error: `Invalid magic bytes: expected Cr24, got ${buffer.subarray(0, 4).toString()}` };
    }

    // 2. Version
    const version = buffer.readUInt32LE(4);
    if (version !== 2 && version !== 3) {
      return { valid: false, format: 'crx3', downloadedFromGoogle: allHostsGoogle, manifestValid: false, hasKeyField: false, error: `Unknown CRX version: ${version}` };
    }

    const format = version === 2 ? 'crx2' : 'crx3';

    // 3. Download source
    if (!allHostsGoogle) {
      return { valid: false, format, downloadedFromGoogle: false, manifestValid: false, hasKeyField: false, error: 'Download redirected outside Google domains (potential MITM)' };
    }

    return { valid: true, format, downloadedFromGoogle: true, manifestValid: false, hasKeyField: false };
  }

  /**
   * Parse CRX header, extract ZIP payload, and save to extensions directory.
   */
  private extractCrx(crxBuffer: Buffer, extensionId: string, format: 'crx2' | 'crx3'): string {
    let zipStart: number;

    if (format === 'crx2') {
      // CRX2: [magic:4][version:4][pubkey_len:4][sig_len:4][pubkey][sig][zip]
      const pubkeyLen = crxBuffer.readUInt32LE(8);
      const sigLen = crxBuffer.readUInt32LE(12);
      zipStart = 16 + pubkeyLen + sigLen;
    } else {
      // CRX3: [magic:4][version:4][header_size:4][header_bytes][zip]
      const headerSize = crxBuffer.readUInt32LE(8);
      zipStart = 12 + headerSize;
    }

    if (zipStart >= crxBuffer.length) {
      throw new Error(`Invalid CRX: ZIP start offset (${zipStart}) exceeds buffer size (${crxBuffer.length})`);
    }

    const zipBuffer = crxBuffer.subarray(zipStart);

    // Verify ZIP validity
    let zip: AdmZip;
    try {
      zip = new AdmZip(Buffer.from(zipBuffer));
      // Verify we can read entries
      const entries = zip.getEntries();
      if (entries.length === 0) {
        throw new Error('ZIP archive is empty');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid ZIP payload: ${message}`);
    }

    // Extract to extension directory
    const installPath = path.join(this.extensionsDir, extensionId);
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true, force: true });
    }
    fs.mkdirSync(installPath, { recursive: true });

    zip.extractAllTo(installPath, true);

    return installPath;
  }

  /**
   * Read and parse manifest.json from an extension directory.
   */
  private readManifest(extPath: string): Record<string, unknown> | null {
    const manifestPath = path.join(extPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Extract content script URL patterns from a manifest for security auditing.
   */
  private extractContentScriptPatterns(manifest: Record<string, unknown>): string[] {
    const patterns: string[] = [];
    const contentScripts = manifest.content_scripts;
    if (Array.isArray(contentScripts)) {
      for (const cs of contentScripts) {
        if (cs && typeof cs === 'object' && 'matches' in cs && Array.isArray(cs.matches)) {
          for (const pattern of cs.matches) {
            if (typeof pattern === 'string' && !patterns.includes(pattern)) {
              patterns.push(pattern);
            }
          }
        }
      }
    }
    return patterns;
  }
}
