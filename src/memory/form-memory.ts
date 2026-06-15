import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { tandemDir } from '../utils/paths';
import { resolvePathWithinRoot, tryParseUrl } from '../utils/security';
import type { SecretStore } from '../security/secret-store';
import { getDefaultSecretStore } from '../security/secret-store';
import { createLogger } from '../utils/logger';

const log = createLogger('FormMemory');

// Name of the AES-256-GCM key record in the safeStorage-backed secret store.
const ENCRYPTION_KEY_SECRET = 'form-memory-encryption-key';
const KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormField {
  name: string;
  type: string;
  id: string;
  value: string;
  encrypted?: boolean;
}

export interface FormEntry {
  url: string;
  fields: FormField[];
  timestamp: number;
}

export interface DomainFormData {
  domain: string;
  entries: FormEntry[];
  lastUpdated: number;
}

// Sensitive field types that get encrypted
const SENSITIVE_TYPES = ['password'];

// ─── Manager ─────────────────────────────────────────────────────────────────

/**
 * FormMemoryManager — Remembers every form the user fills in.
 *
 * Stores form data per domain in ~/.tandem/forms/{domain}.json.
 * Sensitive fields (type=password) are AES-256-GCM encrypted.
 */
export class FormMemoryManager {

  // === 1. Private state ===

  private formsDir: string;
  private encryptionKey: Buffer | null = null;
  private configPath: string;
  private secretStore: SecretStore;

  // === 2. Constructor ===

  constructor(secretStore: SecretStore = getDefaultSecretStore()) {
    this.secretStore = secretStore;
    const baseDir = tandemDir();
    this.formsDir = path.join(baseDir, 'forms');
    this.configPath = path.join(baseDir, 'config.json');

    if (!fs.existsSync(this.formsDir)) {
      fs.mkdirSync(this.formsDir, { recursive: true });
    }

    this.initEncryptionKey();
  }

  // === 4. Public methods ===

  /**
   * Record a form submission. Called when a form submit is detected.
   * Sensitive fields are encrypted before storage.
   *
   * Fail-closed: throws when the encryption key is unavailable rather than
   * persisting data that could not be protected.
   */
  recordForm(url: string, fields: FormField[]): FormEntry {
    if (!this.encryptionKey) {
      log.warn('Refusing to record form data: encryption key unavailable (fail-closed)');
      throw new Error('Form memory is disabled: encryption key unavailable');
    }
    const domain = this.getDomain(url);

    // Encrypt sensitive fields
    const storedFields: FormField[] = fields.map(f => {
      if (SENSITIVE_TYPES.includes(f.type) && f.value) {
        return { ...f, value: this.encrypt(f.value), encrypted: true };
      }
      return { ...f, encrypted: false };
    });

    const entry: FormEntry = {
      url,
      fields: storedFields,
      timestamp: Date.now(),
    };

    let data = this.loadDomain(domain);
    if (!data) {
      data = { domain, entries: [], lastUpdated: Date.now() };
    }

    data.entries.push(entry);
    // Keep max 100 entries per domain
    if (data.entries.length > 100) {
      data.entries = data.entries.slice(-100);
    }
    data.lastUpdated = Date.now();

    this.saveDomain(data);
    return entry;
  }

  /** Get all stored form data (all domains) */
  listAll(): { domain: string; entryCount: number; lastUpdated: number }[] {
    try {
      const files = fs.readdirSync(this.formsDir).filter(f => f.endsWith('.json'));
      return files.map(f => {
        try {
          const data: DomainFormData = JSON.parse(
            fs.readFileSync(resolvePathWithinRoot(this.formsDir, f), 'utf-8')
          );
          return {
            domain: data.domain,
            entryCount: data.entries.length,
            lastUpdated: data.lastUpdated,
          };
        } catch {
          return null;
        }
      }).filter(Boolean) as { domain: string; entryCount: number; lastUpdated: number }[];
    } catch {
      return [];
    }
  }

  /** Get form data for a specific domain, decrypting sensitive fields */
  getForDomain(domain: string): DomainFormData | null {
    const data = this.loadDomain(domain);
    if (!data) return null;

    // Decrypt sensitive fields for reading
    const decrypted: DomainFormData = {
      ...data,
      entries: data.entries.map(entry => ({
        ...entry,
        fields: entry.fields.map(f => {
          if (f.encrypted && f.value) {
            return { ...f, value: this.decrypt(f.value) };
          }
          return f;
        }),
      })),
    };

    return decrypted;
  }

  /**
   * Get fill suggestions for a domain.
   * Returns the most recent form fields, merged across entries.
   * Useful for auto-fill.
   */
  getFillData(domain: string): FormField[] | null {
    const data = this.getForDomain(domain);
    if (!data || data.entries.length === 0) return null;

    // Merge fields from most recent entries (latest wins)
    const fieldMap = new Map<string, FormField>();
    for (const entry of data.entries) {
      for (const field of entry.fields) {
        const key = field.name || field.id || `${field.type}-${field.id}`;
        if (key && field.value) {
          fieldMap.set(key, field);
        }
      }
    }

    return Array.from(fieldMap.values());
  }

  /** Delete all form data for a domain */
  deleteDomain(domain: string): boolean {
    const filePath = resolvePathWithinRoot(this.formsDir, this.domainToFilename(domain));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /** Check if we have form data for a given URL's domain */
  hasDataForUrl(url: string): boolean {
    const domain = this.getDomain(url);
    return this.loadDomain(domain) !== null;
  }

  // === 7. Private helpers ===

  /**
   * Initialize the encryption key from the safeStorage-backed SecretStore.
   *
   * Legacy installs stored the key as plaintext hex in config.json — next to
   * the data it encrypts. Such keys are migrated into the SecretStore once
   * and then removed from config.json; existing encrypted form data stays
   * decryptable because the key bytes do not change.
   *
   * Fail-closed: when no key can be loaded or persisted, recordForm refuses
   * to store new form data instead of silently using an ephemeral key.
   */
  private initEncryptionKey(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        // Migrate pre-fix installs: tighten any existing config.json to 0o600.
        try { fs.chmodSync(this.configPath, 0o600); } catch { /* best effort */ }
      }

      const stored = this.secretStore.get(ENCRYPTION_KEY_SECRET);
      if (stored && KEY_HEX_PATTERN.test(stored)) {
        this.encryptionKey = Buffer.from(stored, 'hex');
        this.removeLegacyConfigKey(stored);
        return;
      }

      const legacyKey = this.readLegacyConfigKey();
      if (legacyKey) {
        this.secretStore.set(ENCRYPTION_KEY_SECRET, legacyKey);
        this.encryptionKey = Buffer.from(legacyKey, 'hex');
        this.removeLegacyConfigKey(legacyKey);
        log.info('Migrated form-memory encryption key from config.json into the secret store');
        return;
      }

      // Fresh install: generate a new 256-bit key directly in the store.
      const key = crypto.randomBytes(32);
      this.secretStore.set(ENCRYPTION_KEY_SECRET, key.toString('hex'));
      this.encryptionKey = key;
    } catch (e) {
      this.encryptionKey = null;
      log.error(
        'Form-memory encryption key unavailable — refusing to persist new form data this session:',
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  /** Read the pre-secret-store plaintext key from config.json, if any. */
  private readLegacyConfigKey(): string | null {
    if (!fs.existsSync(this.configPath)) return null;
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as Record<string, unknown>;
      const key = config.formEncryptionKey;
      return typeof key === 'string' && KEY_HEX_PATTERN.test(key) ? key : null;
    } catch {
      return null;
    }
  }

  /**
   * Remove the legacy plaintext key from config.json. Only removes a value
   * that matches the active key — a differing value could still be needed to
   * decrypt data from an older backup, so it is left in place with a warning.
   */
  private removeLegacyConfigKey(activeKeyHex: string): void {
    try {
      if (!fs.existsSync(this.configPath)) return;
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as Record<string, unknown>;
      if (typeof config.formEncryptionKey !== 'string') return;
      if (config.formEncryptionKey.toLowerCase() !== activeKeyHex.toLowerCase()) {
        log.warn('config.json contains a form encryption key that differs from the secret-store key — leaving it in place');
        return;
      }
      delete config.formEncryptionKey;
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
      try { fs.chmodSync(this.configPath, 0o600); } catch { /* best effort */ }
      log.info('Removed legacy plaintext form encryption key from config.json');
    } catch (e) {
      log.warn('Could not remove legacy form encryption key from config.json:', e instanceof Error ? e.message : String(e));
    }
  }

  /** Encrypt a value with AES-256-GCM */
  private encrypt(plaintext: string): string {
    if (!this.encryptionKey) {
      // recordForm guards this path; throwing keeps it fail-closed if a new
      // caller bypasses the guard.
      throw new Error('Form memory encryption key unavailable');
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /** Decrypt a value with AES-256-GCM */
  private decrypt(ciphertext: string): string {
    if (!this.encryptionKey) return '[decryption unavailable]';
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) return ciphertext;
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return '[decryption failed]';
    }
  }

  /** Extract domain from URL */
  private getDomain(url: string): string {
    const parsedUrl = tryParseUrl(url);
    if (!parsedUrl) {
      return 'unknown';
    }
    return parsedUrl.hostname;
  }

  /** Sanitize domain for filesystem */
  private domainToFilename(domain: string): string {
    return domain.replace(/[^a-zA-Z0-9.-]/g, '_') + '.json';
  }

  /** Load form data for a domain */
  private loadDomain(domain: string): DomainFormData | null {
    const filePath = resolvePathWithinRoot(this.formsDir, this.domainToFilename(domain));
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /** Save form data for a domain */
  private saveDomain(data: DomainFormData): void {
    const filePath = resolvePathWithinRoot(this.formsDir, this.domainToFilename(data.domain));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    try { fs.chmodSync(filePath, 0o600); } catch { /* best effort */ }
  }
}
