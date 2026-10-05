/**
 * At-rest encryption for third-party secrets stored in Mongo
 * (Integration tokens, MCP env/headers).
 *
 * AES-256-GCM with a random 96-bit IV per value. Envelope format:
 *   v1:<base64 iv>:<base64 auth tag>:<base64 ciphertext>
 *
 * The `v1:` prefix doubles as a migration marker: values without it are
 * treated as legacy plaintext and returned as-is, so pre-encryption rows
 * keep working and are re-encrypted on their next write.
 *
 * Key: SECRET_ENCRYPTION_KEY (64 hex chars = 32 bytes) when set, otherwise
 * derived from JWT_SECRET via scrypt (JWT_SECRET is already fail-fast
 * required at boot, so a key is always available).
 */
const crypto = require('crypto');

const PREFIX = 'v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

let cachedKey = null;

function getKey() {
    if (cachedKey) return cachedKey;
    const configured = process.env.SECRET_ENCRYPTION_KEY;
    if (configured) {
        if (!/^[0-9a-fA-F]{64}$/.test(configured)) {
            throw new Error(
                'SECRET_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
            );
        }
        cachedKey = Buffer.from(configured, 'hex');
        return cachedKey;
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error('Cannot derive secret-encryption key: JWT_SECRET is not set.');
    }
    cachedKey = crypto.scryptSync(jwtSecret, 'codex-secret-encryption-v1', 32);
    return cachedKey;
}

// Test helper: drop the cached key (e.g. after changing env in tests).
function clearKeyCache() {
    cachedKey = null;
}

function isEncryptedSecret(value) {
    return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptSecret(plaintext) {
    if (plaintext === undefined || plaintext === null) return plaintext;
    if (typeof plaintext !== 'string') plaintext = String(plaintext);
    if (plaintext === '' || isEncryptedSecret(plaintext)) return plaintext;
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptSecret(payload) {
    if (payload === undefined || payload === null) return payload;
    if (!isEncryptedSecret(payload)) return payload; // legacy plaintext passthrough
    const parts = payload.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
        throw new Error('Malformed encrypted secret envelope.');
    }
    const [ivB64, tagB64, ctB64] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return decipher.update(Buffer.from(ctB64, 'base64'), undefined, 'utf8') + decipher.final('utf8');
}

module.exports = {
    PREFIX,
    encryptSecret,
    decryptSecret,
    isEncryptedSecret,
    clearKeyCache,
};
