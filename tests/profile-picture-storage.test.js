const fs = require('fs');
const path = require('path');
const {
    isR2Configured,
    saveProfilePicture,
    deleteProfilePicture,
} = require('../utils/profilePictureStorage');

describe('profile picture storage', () => {
    const original = { ...process.env };

    afterEach(() => {
        for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL', 'R2_ENDPOINT']) {
            if (original[key] === undefined) delete process.env[key];
            else process.env[key] = original[key];
        }
    });

    test('falls back to local disk when R2 is not configured', async () => {
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;
        delete process.env.R2_BUCKET;
        delete process.env.R2_PUBLIC_URL;

        expect(isR2Configured()).toBe(false);
        const stored = await saveProfilePicture({
            buffer: Buffer.from('image-bytes'),
            size: Buffer.byteLength('image-bytes'),
            mimetype: 'image/png',
            originalname: 'avatar.png',
        }, 'user-1');

        expect(stored.storage).toBe('local');
        expect(stored.url.startsWith('/uploads/profiles/')).toBe(true);
        const diskPath = path.join(__dirname, '..', stored.url);
        expect(fs.existsSync(diskPath)).toBe(true);

        await deleteProfilePicture(stored.url);
        expect(fs.existsSync(diskPath)).toBe(false);
    });

    test('rejects files that are not allowed images', async () => {
        await expect(saveProfilePicture({
            buffer: Buffer.from('nope'),
            size: 4,
            mimetype: 'application/pdf',
            originalname: 'resume.pdf',
        }, 'user-1')).rejects.toThrow(/Only jpg, png, gif, or webp/);
    });
});
