const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
} = require('@aws-sdk/client-s3');

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const EXTENSION_BY_MIME = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
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
    const prefix = String(process.env.R2_PROFILE_PREFIX || 'profiles').replace(/^\/+|\/+$/g, '');
    return { accountId, bucket, accessKeyId, secretAccessKey, publicUrl, endpoint, prefix };
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
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fromName) ? fromName : '.jpg';
}

function validate(file) {
    if (!file || !file.buffer) throw Object.assign(new Error('No file uploaded'), { status: 400 });
    if (!Number.isFinite(file.size) || file.size <= 0) throw Object.assign(new Error('Empty upload'), { status: 400 });
    if (file.size > MAX_BYTES) throw Object.assign(new Error('Profile pictures must be 5MB or smaller'), { status: 413 });
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
        throw Object.assign(new Error('Only jpg, png, gif, or webp images are allowed'), { status: 400 });
    }
}

function keyFor(userId, file) {
    const prefix = config().prefix;
    return `${prefix}/${userId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extensionFor(file)}`;
}

function publicUrlForKey(key) {
    return `${config().publicUrl}/${String(key).replace(/^\/+/, '')}`;
}

function keyFromUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const clean = raw.split('?')[0];
    const base = config().publicUrl;
    if (base && clean.startsWith(`${base}/`)) {
        return decodeURIComponent(clean.slice(base.length + 1));
    }
    if (raw.startsWith(`${config().prefix}/`)) return raw;
    return null;
}

async function saveProfilePicture(file, userId) {
    validate(file);
    if (!userId) throw Object.assign(new Error('A user is required'), { status: 400 });

    if (isR2Configured()) {
        const key = keyFor(userId, file);
        await r2Client().send(new PutObjectCommand({
            Bucket: config().bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            CacheControl: 'public, max-age=31536000, immutable',
        }));
        return { storage: 'r2', key, url: publicUrlForKey(key) };
    }

    const uploadDir = path.join(__dirname, '..', 'uploads', 'profiles');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const filename = `profile-${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${extensionFor(file)}`;
    await fs.promises.writeFile(path.join(uploadDir, filename), file.buffer);
    return { storage: 'local', key: filename, url: `/uploads/profiles/${filename}` };
}

async function deleteProfilePicture(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;

    if (raw.startsWith('/uploads/')) {
        const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
        const filePath = path.resolve(__dirname, '..', `.${raw.split('?')[0]}`);
        if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) return false;
        try {
            await fs.promises.unlink(filePath);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') return false;
            throw error;
        }
    }

    const key = keyFromUrl(raw);
    if (!key) return false;
    if (!isR2Configured()) return false;
    await r2Client().send(new DeleteObjectCommand({
        Bucket: config().bucket,
        Key: key,
    }));
    return true;
}

async function deleteProfilePicturesForUser(userId) {
    if (!userId) return { deleted: 0 };
    let deleted = 0;
    if (isR2Configured()) {
        const Prefix = `${config().prefix}/${userId}/`;
        let ContinuationToken;
        do {
            const listed = await r2Client().send(new ListObjectsV2Command({
                Bucket: config().bucket,
                Prefix,
                ContinuationToken,
            }));
            const objects = (listed.Contents || []).map((entry) => ({ Key: entry.Key })).filter((entry) => entry.Key);
            if (objects.length) {
                await r2Client().send(new DeleteObjectsCommand({
                    Bucket: config().bucket,
                    Delete: { Objects: objects, Quiet: true },
                }));
                deleted += objects.length;
            }
            ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
        } while (ContinuationToken);
    }
    return { deleted };
}

module.exports = {
    MAX_BYTES,
    isR2Configured,
    saveProfilePicture,
    deleteProfilePicture,
    deleteProfilePicturesForUser,
};
