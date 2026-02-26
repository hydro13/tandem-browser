import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// PBKDF2 parameters for key derivation
const ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

export class PasswordCrypto {
    /**
     * Derive an AES-256-GCM key from a master password.
     * Returns salt and derived key.
     */
    static deriveKey(password: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
        const s = salt || crypto.randomBytes(SALT_LENGTH);
        const key = crypto.pbkdf2Sync(password, s, ITERATIONS, KEY_LENGTH, 'sha256');
        return { key, salt: s };
    }

    /**
     * Encrypt a plaintext string using the given key.
     * Format of output buffer: [salt (16)] [iv (12)] [authTag (16)] [ciphertext]
     */
    static encrypt(plaintext: string, key: Buffer, salt: Buffer): Buffer {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(plaintext, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const authTag = cipher.getAuthTag();

        // Store as a single buffer
        return Buffer.concat([salt, iv, authTag, encrypted]);
    }

    /**
     * Decrypt a buffer containing [salt][iv][authTag][ciphertext] back into plaintext.
     */
    static decrypt(encryptedBuffer: Buffer, parsedKey?: Buffer, password?: string): string {
        const salt = encryptedBuffer.subarray(0, SALT_LENGTH);
        const iv = encryptedBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const authTag = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
        const ciphertext = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

        let key = parsedKey;
        if (!key && password) {
            key = this.deriveKey(password, salt).key;
        }

        if (!key) throw new Error('Must provide either key or derived password');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString('utf8');
    }

    /**
     * Generates a strong random master password or vault item password.
     */
    static generatePassword(length = 24): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><,./-=';
        let pswd = '';
        const randomBytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            pswd += chars[randomBytes[i] % chars.length];
        }
        return pswd;
    }
}
