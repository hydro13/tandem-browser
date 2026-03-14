import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { tandemDir } from '../utils/paths';
import { resolvePathWithinRoot, tryParseUrl } from '../utils/security';

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

/**
 * FormMemoryManager — Remembers every form Robin fills in.
 * 
 * Stores form data per domain in ~/.tandem/forms/{domain}.json
 * Sensitive fields (type=password) are AES-256-GCM encrypted.
 * Encryption key is stored/generated in ~/.tandem/config.json
 */
export class FormMemoryManager {
  private formsDir: string;
  private encryptionKey: Buffer | null = null;
  private configPath: string;

  constructor() {
    const baseDir = tandemDir();
    this.formsDir = path.join(baseDir, 'forms');
    this.configPath = path.join(baseDir, 'config.json');

    if (!fs.existsSync(this.formsDir)) {
      fs.mkdirSync(this.formsDir, { recursive: true });
    }

    this.initEncryptionKey();
  }

  /** Initialize or load the encryption key from config */
  private initEncryptionKey(): void {
    try {
      let config: Record<string, unknown> = {};
      if (fs.existsSync(this.configPath)) {
        config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      }

      if (config.formEncryptionKey && typeof config.formEncryptionKey === 'string') {
        this.encryptionKey = Buffer.from(config.formEncryptionKey, 'hex');
      } else {
        // Generate new 256-bit key
        this.encryptionKey = crypto.randomBytes(32);
        config.formEncryptionKey = this.encryptionKey.toString('hex');
        const configDir = path.dirname(this.configPath);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      }
    } catch {
      // Fallback: generate ephemeral key (won't persist across restarts)
      this.encryptionKey = crypto.randomBytes(32);
    }
  }

  /** Encrypt a value with AES-256-GCM */
  private encrypt(plaintext: string): string {
    if (!this.encryptionKey) return plaintext;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /** Decrypt a value with AES-256-GCM */
  private decrypt(ciphertext: string): string {
    if (!this.encryptionKey) return ciphertext;
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
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Record a form submission. Called when a form submit is detected.
   * Sensitive fields are encrypted before storage.
   */
  recordForm(url: string, fields: FormField[]): FormEntry {
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
}
