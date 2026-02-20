import { session } from 'electron';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export class StateManager {
  private stateDir: string;

  constructor() {
    this.stateDir = path.join(app.getPath('userData'), 'sessions');
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /** Save session cookies to disk */
  async save(name: string, partition: string): Promise<string> {
    const sess = session.fromPartition(partition);
    const cookies = await sess.cookies.get({});
    const data: { cookies: Electron.Cookie[]; savedAt: number; encrypted: boolean } = {
      cookies,
      savedAt: Date.now(),
      encrypted: false,
    };
    let content = JSON.stringify(data, null, 2);
    let filePath: string;

    const encKey = process.env.TANDEM_SESSION_KEY;
    if (encKey) {
      content = this.encrypt(content, encKey);
      data.encrypted = true;
      filePath = path.join(this.stateDir, `${name}.enc`);
    } else {
      filePath = path.join(this.stateDir, `${name}.json`);
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /** Load session cookies from disk into a partition */
  async load(name: string, partition: string): Promise<{ cookiesRestored: number }> {
    // Try .enc first, then .json
    let filePath = path.join(this.stateDir, `${name}.enc`);
    let encrypted = true;
    if (!fs.existsSync(filePath)) {
      filePath = path.join(this.stateDir, `${name}.json`);
      encrypted = false;
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`State '${name}' not found`);
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    if (encrypted) {
      const encKey = process.env.TANDEM_SESSION_KEY;
      if (!encKey) {
        throw new Error('TANDEM_SESSION_KEY required to load encrypted state');
      }
      content = this.decrypt(content, encKey);
    }

    const data = JSON.parse(content);
    const sess = session.fromPartition(partition);
    let restored = 0;

    for (const cookie of data.cookies) {
      try {
        // Build the cookie URL from domain + path
        const secure = cookie.secure ? 'https' : 'http';
        const domain = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        const url = `${secure}://${domain}${cookie.path || '/'}`;
        await sess.cookies.set({
          url,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite as 'unspecified' | 'no_restriction' | 'lax' | 'strict' | undefined,
          expirationDate: cookie.expirationDate,
        });
        restored++;
      } catch (_e: any) {
        // Skip cookies that fail to set (e.g. expired)
      }
    }

    return { cookiesRestored: restored };
  }

  /** List saved states */
  list(): string[] {
    if (!fs.existsSync(this.stateDir)) return [];
    return fs.readdirSync(this.stateDir)
      .filter(f => f.endsWith('.json') || f.endsWith('.enc'))
      .map(f => f.replace(/\.(json|enc)$/, ''));
  }

  private encrypt(data: string, key: string): string {
    const keyBuf = crypto.createHash('sha256').update(key).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + tag + ':' + encrypted;
  }

  private decrypt(data: string, key: string): string {
    const parts = data.split(':');
    if (parts.length < 3) throw new Error('Invalid encrypted data format');
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts.slice(2).join(':');
    const keyBuf = crypto.createHash('sha256').update(key).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
