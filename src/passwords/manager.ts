import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';
import { PasswordCrypto } from '../security/crypto';

export interface VaultItem {
    id?: number;
    domain: string;
    username: string;
    encryptedBlob: Buffer; // serialized JSON payload (password, notes, 2fa, etc) encrypted via VaultKey
    created_at?: string;
    updated_at?: string;
}

export class PasswordManager {
    private db: Database.Database;
    private vaultKey: Buffer | null = null;
    private isUnlocked: boolean = false;

    constructor() {
        const dir = tandemDir('security');
        fs.mkdirSync(dir, { recursive: true });

        this.db = new Database(path.join(dir, 'vault.db'));
        this.db.pragma('journal_mode = WAL');
        this.init();
    }

    private init() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        username TEXT NOT NULL,
        encryptedBlob BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(domain, username)
      );

      CREATE TABLE IF NOT EXISTS vault_meta (
        key TEXT PRIMARY KEY,
        value BLOB NOT NULL
      );
    `);
    }

    /**
     * Initializes or verifies the master password.
     * If the vault is new, it sets the master password.
     * If it exists, it verifies it and caches the derived key in memory.
     */
    public async unlock(masterPassword: string): Promise<boolean> {
        const meta = this.db.prepare('SELECT value FROM vault_meta WHERE key = ?').get('master_verification') as { value: Buffer };

        if (!meta) {
            // Vault is brand new. Create a verification payload.
            const { key, salt } = PasswordCrypto.deriveKey(masterPassword);
            const testPayload = PasswordCrypto.encrypt('VERIFIED', key, salt);
            this.db.prepare('INSERT INTO vault_meta (key, value) VALUES (?, ?)').run('master_verification', testPayload);
            this.vaultKey = key;
            this.isUnlocked = true;
            return true;
        }

        try {
            // Try resolving the payload. Crypto will throw an auth tag error if incorrect.
            const decrypted = PasswordCrypto.decrypt(meta.value, undefined, masterPassword);
            if (decrypted === 'VERIFIED') {
                // Derive key and cache it
                const salt = meta.value.subarray(0, 16); // Extract original salt
                this.vaultKey = PasswordCrypto.deriveKey(masterPassword, salt).key;
                this.isUnlocked = true;
                return true;
            }
            return false;
        } catch (e) {
            return false; // Wrong password
        }
    }

    public lock() {
        this.vaultKey = null;
        this.isUnlocked = false;
    }

    public get isVaultUnlocked() {
        return this.isUnlocked;
    }

    /**
     * Add or update an item in the vault.
     */
    public saveItem(domain: string, username: string, payload: Record<string, unknown>): void {
        if (!this.isUnlocked || !this.vaultKey) throw new Error('Vault is locked');

        // Always generate a fresh salt+IV per item securely via our crypto layer.
        const salt = require('crypto').randomBytes(16);
        const encrypted = PasswordCrypto.encrypt(JSON.stringify(payload), this.vaultKey, salt);

        const stmt = this.db.prepare(`
      INSERT INTO vault (domain, username, encryptedBlob) 
      VALUES (?, ?, ?)
      ON CONFLICT(domain, username) DO UPDATE SET 
        encryptedBlob = excluded.encryptedBlob,
        updated_at = CURRENT_TIMESTAMP
    `);
        stmt.run(domain.toLowerCase(), username, encrypted);
    }

    /**
     * Retrieve structured payload for a domain + user.
     */
    public getItem(domain: string, username: string): Record<string, unknown> | null {
        if (!this.isUnlocked || !this.vaultKey) throw new Error('Vault is locked');

        const row = this.db.prepare('SELECT encryptedBlob FROM vault WHERE domain = ? AND username = ?')
            .get(domain.toLowerCase(), username) as { encryptedBlob: Buffer };

        if (!row) return null;

        try {
            const plaintext = PasswordCrypto.decrypt(row.encryptedBlob, this.vaultKey);
            return JSON.parse(plaintext);
        } catch (e) {
            console.error('Failed to decrypt vault item (corrupt / wrong key)', e);
            return null;
        }
    }

    /**
     * Get all identities for a specific domain (for autofill dropdowns).
     */
    public getIdentitiesForDomain(domain: string): Array<{ username: string, payload: Record<string, unknown> }> {
        if (!this.isUnlocked || !this.vaultKey) throw new Error('Vault is locked');

        const rows = this.db.prepare('SELECT username, encryptedBlob FROM vault WHERE domain = ?').all(domain.toLowerCase()) as Array<{ username: string, encryptedBlob: Buffer }>;

        const results = [];
        for (const r of rows) {
            try {
                const plaintext = PasswordCrypto.decrypt(r.encryptedBlob, this.vaultKey);
                results.push({ username: r.username, payload: JSON.parse(plaintext) });
            } catch (e) {
                // ignore broken items silently during lists
            }
        }
        return results;
    }

    /**
     * Check if vault is completely empty/brand new.
     */
    public isNewVault(): boolean {
        const meta = this.db.prepare('SELECT key FROM vault_meta WHERE key = ?').get('master_verification');
        return !meta;
    }
}
let _instance: PasswordManager | null = null;

export function getPasswordManager(): PasswordManager {
  if (!_instance) {
    _instance = new PasswordManager();
  }
  return _instance;
}
