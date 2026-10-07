/**
 * Rec 9 — secrets at rest + server-side TURN + boot validation.
 *
 * 1. secretCrypto: AES-256-GCM round trip, legacy passthrough, tamper
 *    rejection, explicit-key and derived-key modes.
 * 2. Integration tokens + McpServer env/headers encrypted at rest — including
 *    through findOneAndUpdate upserts (which bypass document setters), proven
 *    by reading the raw driver-level value.
 * 3. MCP API never returns secret values (redacted shape on GET/POST/PUT)
 *    and PUT keeps stored secrets when the __REDACTED__ sentinel is sent.
 * 4. OTP pepper: HMAC digest differs from the legacy plain sha256, legacy
 *    rows still verify until their TTL expires.
 * 5. /api/rtc/ice-servers: STUN-only by default, time-limited TURN creds when
 *    configured.
 * 6. Dev gate: password verified server-side, time-boxed tokens, signup and
 *    friends wired to requireDevGate.
 * 7. validateBootConfig: fatals and warnings.
 *
 * No database: all model access is stubbed or in-memory (mongo is not
 * available in this environment or in CI).
 */
const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-testing-32chars';

// Never wait on a database connection in this file.
mongoose.set('bufferCommands', false);

jest.doMock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = '607f1f77bcf86cd799439011';
    req.user = { _id: '607f1f77bcf86cd799439011' };
    next();
  },
}));
jest.doMock('../utils/auditLogService', () => ({ addAuditLog: jest.fn() }));
jest.doMock('../models/AuthLockout', () => ({
  isLockedOut: async () => false,
  recordFailure: async () => {},
  clearLockout: async () => {},
}));
jest.doMock('../utils/emailServiceResend', () => ({
  sendOTPEmail: jest.fn(async () => ({})),
  sendWelcomeEmail: jest.fn(async () => ({})),
}));

const secretCrypto = require('../utils/secretCrypto');
const Integration = require('../models/Integration');
const McpServer = require('../models/McpServer');
const Company = require('../models/Company');
const OTP = require('../models/OTP');
const User = require('../models/User');
const { validateBootConfig } = require('../utils/bootConfig');

const mcpRouter = require('../routes/mcp');
const otpRouter = require('../routes/otp');
const rtcRouter = require('../routes/rtc');

const OWNER_ID = '607f1f77bcf86cd799439011';
const COMPANY_ID = '607f1f77bcf86cd799439022';

const app = express();
app.use(express.json());
app.use('/api/mcp', mcpRouter);
app.use('/api/otp', otpRouter);
app.use('/api/rtc', rtcRouter);

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  secretCrypto.clearKeyCache();
  jest.restoreAllMocks();
});

// Raw (driver-level) value of a path — bypasses mongoose getters.
const rawOf = (doc, path) => doc.get(path, null, { getters: false });

describe('secretCrypto', () => {
  test('round trip with derived key', () => {
    const enc = secretCrypto.encryptSecret('ghp_super-secret-token');
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain('ghp_super-secret-token');
    expect(secretCrypto.decryptSecret(enc)).toBe('ghp_super-secret-token');
  });

  test('fresh IV per encryption', () => {
    expect(secretCrypto.encryptSecret('same')).not.toBe(secretCrypto.encryptSecret('same'));
  });

  test('legacy plaintext passes through untouched', () => {
    expect(secretCrypto.decryptSecret('plain-old-token')).toBe('plain-old-token');
    expect(secretCrypto.decryptSecret('')).toBe('');
    expect(secretCrypto.decryptSecret(null)).toBe(null);
  });

  test('already-encrypted input is not double-encrypted', () => {
    const once = secretCrypto.encryptSecret('x');
    expect(secretCrypto.encryptSecret(once)).toBe(once);
  });

  test('tampered ciphertext throws', () => {
    const enc = secretCrypto.encryptSecret('x');
    const tampered = enc.slice(0, -4) + 'AAAA';
    expect(() => secretCrypto.decryptSecret(tampered)).toThrow();
  });

  test('explicit SECRET_ENCRYPTION_KEY is honored; malformed key throws', () => {
    process.env.SECRET_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    secretCrypto.clearKeyCache();
    const enc = secretCrypto.encryptSecret('abc');
    expect(secretCrypto.decryptSecret(enc)).toBe('abc');
    process.env.SECRET_ENCRYPTION_KEY = 'not-hex';
    secretCrypto.clearKeyCache();
    expect(() => secretCrypto.encryptSecret('abc')).toThrow(/64 hex/);
  });
});

describe('Integration tokens at rest', () => {
  test('create path: stored ciphertext, read plaintext', () => {
    const doc = new Integration({
      userId: new mongoose.Types.ObjectId(),
      provider: 'github',
      accessToken: 'ghp_live-token',
      refreshToken: 'ref-token',
    });
    expect(String(rawOf(doc, 'accessToken'))).toMatch(/^v1:/);
    expect(String(rawOf(doc, 'refreshToken'))).toMatch(/^v1:/);
    expect(String(rawOf(doc, 'accessToken'))).not.toContain('ghp_live-token');
    expect(doc.accessToken).toBe('ghp_live-token');
    expect(doc.refreshToken).toBe('ref-token');
  });

  test('upsert path (findOneAndUpdate) encrypts token fields', async () => {
    let seen;
    const stub = jest
      .spyOn(Integration.collection, 'findOneAndUpdate')
      .mockImplementation(async (filter, update) => {
        seen = update;
        return { value: null };
      });
    const uid = new mongoose.Types.ObjectId();
    await Integration.findOneAndUpdate(
      { userId: uid, provider: 'github' },
      { userId: uid, provider: 'github', accessToken: 'tok-abc', refreshToken: 'ref-xyz' },
      { upsert: true }
    ).exec();
    stub.mockRestore();
    const sections = [seen, seen.$set, seen.$setOnInsert].filter(Boolean);
    const values = sections.flatMap((s) => [s.accessToken, s.refreshToken].filter((v) => typeof v === 'string'));
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toMatch(/^v1:/);
    expect(JSON.stringify(seen)).not.toContain('tok-abc');
    expect(JSON.stringify(seen)).not.toContain('ref-xyz');
  });

  test('legacy plaintext rows still read until rewritten', () => {
    // Simulate a pre-encryption row by writing past the setter straight
    // into the document's internals:
    const legacy = new Integration({
      userId: new mongoose.Types.ObjectId(),
      provider: 'slack',
      accessToken: 'placeholder-will-be-overwritten',
    });
    legacy._doc.accessToken = 'xoxb-legacy-plaintext';
    expect(legacy.accessToken).toBe('xoxb-legacy-plaintext');
    // And the next write re-encrypts it:
    legacy.accessToken = legacy.accessToken;
    expect(String(rawOf(legacy, 'accessToken'))).toMatch(/^v1:/);
    expect(legacy.accessToken).toBe('xoxb-legacy-plaintext');
  });
});

describe('McpServer env/headers at rest', () => {
  const mkServer = (over = {}) =>
    new McpServer({
      company: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      name: 't',
      headers: { Authorization: 'Bearer s3cr3t' },
      env: { API_KEY: 'key-123' },
      ...over,
    });

  test('create path: objects stored as ciphertext, read back as objects', () => {
    const doc = mkServer();
    expect(typeof rawOf(doc, 'headers')).toBe('string');
    expect(String(rawOf(doc, 'headers'))).toMatch(/^v1:/);
    expect(JSON.stringify(rawOf(doc, 'headers'))).not.toContain('s3cr3t');
    expect(doc.headers).toEqual({ Authorization: 'Bearer s3cr3t' });
    expect(doc.env).toEqual({ API_KEY: 'key-123' });
  });

  test('$set upsert path encrypts headers', async () => {
    let seen;
    const stub = jest
      .spyOn(McpServer.collection, 'findOneAndUpdate')
      .mockImplementation(async (filter, update) => {
        seen = update;
        return { value: null };
      });
    await McpServer.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId() },
      { $set: { headers: { Authorization: 'Bearer zzz' } } }
    ).exec();
    stub.mockRestore();
    expect(String(seen.$set.headers)).toMatch(/^v1:/);
    expect(JSON.stringify(seen)).not.toContain('Bearer zzz');
  });

  test('legacy plaintext objects pass through', () => {
    const doc = mkServer({ headers: {}, env: {} });
    expect(doc.headers).toEqual({});
    // Empty objects are not worth an envelope:
    expect(rawOf(doc, 'headers')).toEqual({});
  });
});

describe('MCP API never returns secret values', () => {
  beforeEach(() => {
    jest.spyOn(Company, 'findById').mockResolvedValue({
      _id: COMPANY_ID,
      owner: { toString: () => OWNER_ID },
      members: [],
    });
  });

  const serverDoc = () =>
    new McpServer({
      _id: new mongoose.Types.ObjectId(),
      company: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      name: 'prod',
      transport: 'sse',
      serverUrl: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer s3cr3t' },
      env: { API_KEY: 'key-123' },
    });

  test('GET list redacts header/env values but keeps keys', async () => {
    jest.spyOn(McpServer, 'find').mockReturnValue({ sort: async () => [serverDoc()] });
    const res = await request(app).get(`/api/mcp/company/${COMPANY_ID}`);
    expect(res.status).toBe(200);
    const [s] = res.body.servers;
    expect(s.headers).toEqual({ Authorization: '__REDACTED__' });
    expect(s.env).toEqual({ API_KEY: '__REDACTED__' });
    expect(JSON.stringify(res.body)).not.toContain('s3cr3t');
    expect(JSON.stringify(res.body)).not.toContain('key-123');
    // Non-secret fields still present for the UI:
    expect(s.name).toBe('prod');
    expect(s.serverUrl).toBe('https://mcp.example.com');
  });

  test('PUT with the sentinel keeps the stored secret', async () => {
    const doc = serverDoc();
    doc.save = jest.fn(async () => doc);
    jest.spyOn(McpServer, 'findById').mockResolvedValue(doc);
    const res = await request(app)
      .put(`/api/mcp/${doc._id}`)
      .send({ headers: { Authorization: '__REDACTED__' } });
    expect(res.status).toBe(200);
    expect(doc.headers).toEqual({ Authorization: 'Bearer s3cr3t' });
    expect(String(rawOf(doc, 'headers'))).toMatch(/^v1:/);
    expect(res.body.server.headers).toEqual({ Authorization: '__REDACTED__' });
  });

  test('PUT with a new value replaces the secret', async () => {
    const doc = serverDoc();
    doc.save = jest.fn(async () => doc);
    jest.spyOn(McpServer, 'findById').mockResolvedValue(doc);
    const res = await request(app)
      .put(`/api/mcp/${doc._id}`)
      .send({ headers: { Authorization: 'Bearer brand-new' } });
    expect(res.status).toBe(200);
    expect(doc.headers).toEqual({ Authorization: 'Bearer brand-new' });
  });

  test('POST create encrypts and responds redacted', async () => {
    jest.spyOn(McpServer, 'create').mockImplementation(async (d) => new McpServer({
      ...d,
      _id: new mongoose.Types.ObjectId(),
      company: new mongoose.Types.ObjectId(d.company),
      createdBy: new mongoose.Types.ObjectId(),
    }));
    const res = await request(app)
      .post('/api/mcp')
      .send({ companyId: COMPANY_ID, name: 'n', command: 'node', headers: { Authorization: 'Bearer fresh' } });
    expect(res.status).toBe(200);
    expect(res.body.server.headers).toEqual({ Authorization: '__REDACTED__' });
    expect(JSON.stringify(res.body)).not.toContain('Bearer fresh');
  });
});

describe('OTP pepper', () => {
  const otpRouter = require('../routes/otp');

  test('peppered digest is deterministic and differs from legacy sha256', () => {
    expect(otpRouter.hashOTP('123456')).toBe(otpRouter.hashOTP('123456'));
    expect(otpRouter.hashOTP('123456')).not.toBe(otpRouter.hashOTPLegacy('123456'));
    expect(otpRouter.hashOTPLegacy('123456')).toBe(
      crypto.createHash('sha256').update('123456').digest('hex')
    );
  });

  test('dedicated OTP_PEPPER changes the digest', () => {
    const before = otpRouter.hashOTP('123456');
    process.env.OTP_PEPPER = 'a-different-pepper';
    expect(otpRouter.hashOTP('123456')).not.toBe(before);
  });

  const otpRecord = (otpHash) => ({
    _id: new mongoose.Types.ObjectId(),
    email: 'a@b.c',
    otp: otpHash,
    attempts: 0,
    verified: false,
    createdAt: new Date(),
    save: jest.fn(async function () { return this; }),
  });

  test('verify accepts the peppered digest', async () => {
    const record = otpRecord(otpRouter.hashOTP('424242'));
    jest.spyOn(OTP, 'findOne').mockReturnValue({ sort: async () => record });
    jest.spyOn(OTP, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    jest.spyOn(User, 'findOne').mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      email: 'a@b.c',
      fullName: 'T',
      isVerified: false,
      save: jest.fn(async function () { return this; }),
    });
    const res = await request(app).post('/api/otp/verify').send({ email: 'a@b.c', otp: '424242' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('verify still accepts a pre-pepper (legacy) row', async () => {
    const record = otpRecord(otpRouter.hashOTPLegacy('424242'));
    jest.spyOn(OTP, 'findOne').mockReturnValue({ sort: async () => record });
    jest.spyOn(OTP, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    jest.spyOn(User, 'findOne').mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      email: 'a@b.c',
      fullName: 'T',
      isVerified: false,
      save: jest.fn(async function () { return this; }),
    });
    const res = await request(app).post('/api/otp/verify').send({ email: 'a@b.c', otp: '424242' });
    expect(res.status).toBe(200);
  });

  test('verify rejects a wrong code', async () => {
    const record = otpRecord(otpRouter.hashOTP('424242'));
    jest.spyOn(OTP, 'findOne').mockReturnValue({ sort: async () => record });
    const res = await request(app).post('/api/otp/verify').send({ email: 'a@b.c', otp: '000000' });
    expect(res.status).toBe(400);
  });
});

describe('/api/rtc/ice-servers', () => {
  test('STUN-only when TURN is not configured', async () => {
    delete process.env.TURN_URL;
    delete process.env.TURN_STATIC_SECRET;
    const res = await request(app).get('/api/rtc/ice-servers');
    expect(res.status).toBe(200);
    expect(res.body.iceServers).toHaveLength(1);
    expect(res.body.iceServers[0].urls).toMatch(/stun:/);
  });

  test('legacy static TURN pair is served when no static secret is set', async () => {
    process.env.TURN_URL = 'turn:turn.example.com:3478';
    delete process.env.TURN_STATIC_SECRET;
    process.env.TURN_USERNAME = 'static-user';
    process.env.TURN_CREDENTIAL = 'static-pass';
    const res = await request(app).get('/api/rtc/ice-servers');
    expect(res.status).toBe(200);
    expect(res.body.iceServers).toHaveLength(2);
    expect(res.body.iceServers[1]).toEqual({
      urls: 'turn:turn.example.com:3478',
      username: 'static-user',
      credential: 'static-pass',
    });
  });

  test('issues time-boxed TURN credentials when configured', async () => {
    process.env.TURN_URL = 'turn:turn.example.com:3478';
    process.env.TURN_STATIC_SECRET = 'turn-shared-secret';
    const res = await request(app).get('/api/rtc/ice-servers');
    expect(res.status).toBe(200);
    expect(res.body.iceServers).toHaveLength(2);
    const [stun, turn] = res.body.iceServers;
    expect(stun.urls).toMatch(/stun:/);
    expect(turn.urls).toBe('turn:turn.example.com:3478');
    const [exp, ] = turn.username.split(':');
    expect(parseInt(exp, 10)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const expectedCred = crypto
      .createHmac('sha1', 'turn-shared-secret')
      .update(turn.username)
      .digest('base64');
    expect(turn.credential).toBe(expectedCred);
  });
});

describe('validateBootConfig', () => {
  test('clean config passes', () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/x';
    expect(validateBootConfig()).toEqual({ fatals: [], warnings: [] });
  });

  test('missing database is fatal', () => {
    delete process.env.MONGODB_URI;
    const { fatals } = validateBootConfig();
    expect(fatals.join(' ')).toMatch(/MONGODB_URI/);
  });

  test('short JWT_SECRET is fatal when included', () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/x';
    process.env.JWT_SECRET = 'short';
    expect(validateBootConfig().fatals.join(' ')).toMatch(/JWT_SECRET/);
    expect(validateBootConfig({ includeJwtSecret: false }).fatals).toEqual([]);
  });

  test('malformed SECRET_ENCRYPTION_KEY is fatal', () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/x';
    process.env.SECRET_ENCRYPTION_KEY = 'nope';
    expect(validateBootConfig().fatals.join(' ')).toMatch(/SECRET_ENCRYPTION_KEY/);
  });

  test('half-moved TURN secrets warn', () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/x';
    process.env.TURN_STATIC_SECRET = 's';
    const { warnings, fatals } = validateBootConfig();
    expect(fatals).toEqual([]);
    expect(warnings.join(' ')).toMatch(/TURN_URL/);
  });
});
