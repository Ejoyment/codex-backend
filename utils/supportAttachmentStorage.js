const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'application/pdf']);
const EXTENSION_BY_MIME = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'application/pdf': '.pdf',
};

let cachedClient = null;
let cachedSignature = '';

function config() {
    const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
    const bucket = String(process.env.R2_BUCKET || '').trim();
    const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
    const publicUrl = String(process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    const endpoint = String(process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '')
        || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
    const prefix = String(process.env.R2_SUPPORT_PREFIX || 'support').replace(/^\/+|\/+$/g, '');
    return { bucket, accessKeyId, secretAccessKey, publicUrl, endpoint, prefix };
}

function isR2Configured() {
    const { bucket, accessKeyId, secretAccessKey, publicUrl, endpoint } = config();
    return Boolean(bucket && accessKeyId && secretAccessKey && publicUrl && endpoint);
}

function r2Client() {
    const cfg = config();
    const signature = `${cfg.endpoint}|${cfg.accessKeyId}|${cfg.bucket}`;
    if (cachedClient && cachedSignature === signature) return cachedClient;
    cachedClient = new S3Client({
        region: 'auto',
        endpoint: cfg.endpoint,
        forcePathStyle: true,
        credentials: {
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
        },
    });
    cachedSignature = signature;
    return cachedClient;
}

function extensionFor(file) {
    const fromMime = EXTENSION_BY_MIME[String(file?.mimetype || '').toLowerCase()];
    if (fromMime) return fromMime;
    const fromName = path.extname(String(file?.originalname || '')).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.pdf'].includes(fromName) ? fromName : '.bin';
}

function validate(file) {
    if (!file || !file.buffer) throw Object.assign(new Error('No file uploaded'), { status: 400 });
    if (!Number.isFinite(file.size) || file.size <= 0) throw Object.assign(new Error('Empty upload'), { status: 400 });
    if (file.size > MAX_BYTES) throw Object.assign(new Error('Attachments must be 10MB or smaller'), { status: 413 });
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
        throw Object.assign(new Error('Only PNG, JPG, or PDF files are allowed'), { status: 400 });
    }
}

function safeName(file) {
    const name = String(file?.originalname || 'attachment').replace(/[\\/]/g, '').trim();
    return (name || 'attachment').slice(0, 180);
}

async function saveSupportAttachment(file) {
    validate(file);
    const suffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extensionFor(file)}`;
    const name = safeName(file);

    if (isR2Configured()) {
        const cfg = config();
        const key = `${cfg.prefix}/${suffix}`;
        await r2Client().send(new PutObjectCommand({
            Bucket: cfg.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            // Capability-style URL: the random key keeps the document private
            // in practice while still being downloadable from the summary.
            CacheControl: 'private, max-age=31536000, immutable',
        }));
        return {
            name,
            size: file.size,
            mimeType: file.mimetype,
            url: `${cfg.publicUrl}/${key}`,
            key,
            storage: 'r2',
        };
    }

    const uploadDir = path.join(__dirname, '..', 'uploads', 'support');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const filename = `support-${suffix}`;
    await fs.promises.writeFile(path.join(uploadDir, filename), file.buffer);
    return {
        name,
        size: file.size,
        mimeType: file.mimetype,
        url: `/uploads/support/${filename}`,
        key: filename,
        storage: 'local',
    };
}

module.exports = {
    MAX_BYTES,
    MAX_FILES,
    ALLOWED_MIME,
    isR2Configured,
    saveSupportAttachment,
};
