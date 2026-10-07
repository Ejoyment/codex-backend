/**
 * Tests for all Middleware
 * Covers: auth.js, teamRestrictions.js, subscription.js, permissionMatrix.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });

describe('Middleware - Auth', () => {
  let authenticateToken;

  beforeAll(() => {
    jest.resetModules();
    // Re-mock to ensure clean state
    jest.mock('jsonwebtoken', () => ({
      sign: jest.fn(() => 'mock-jwt-token'),
      verify: jest.fn((token, secret, cb) => {
        if (cb) {
          cb(null, { id: 'mock-user-id', userId: 'mock-user-id' });
        } else {
          return { id: 'mock-user-id', userId: 'mock-user-id' };
        }
      }),
    }));
    // Liveness is fail-closed: the probe must resolve live for next() to run.
    // spyOn (not jest.mock) so the other describes in this file keep the real
    // User model; both resolves here hit the post-reset registry that the
    // freshly-required authenticateToken also uses.
    const User = require('../models/User');
    jest.spyOn(User, 'exists').mockResolvedValue({ _id: 'mock-user-id' });
    authenticateToken = require('../middleware/auth').authenticateToken;
  });

  test('should return 401 if no token provided', () => {
    const req = { headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should call next if valid token provided', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    // authenticateToken is async: it now also confirms the account still exists.
    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe('mock-user-id');
  });

  test('should return 403 if token is invalid', async () => {
    jest.resetModules();
    jest.mock('jsonwebtoken', () => ({
      verify: jest.fn((token, secret, cb) => {
        if (cb) {
          cb(new Error('Invalid token'), null);
        } else {
          throw new Error('Invalid token');
        }
      }),
    }));

    const { authenticateToken: authBad } = require('../middleware/auth');
    const req = { headers: { authorization: 'Bearer bad-token' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await authBad(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Middleware - teamRestrictions', () => {
  let teamRestrictions;

  beforeAll(() => {
    teamRestrictions = require('../middleware/teamRestrictions');
  });

  test('should export middleware functions', () => {
    expect(teamRestrictions).toBeDefined();
    // Should export at least one function or object with middleware
    expect(typeof teamRestrictions === 'function' || typeof teamRestrictions === 'object').toBe(true);
  });
});

describe('Middleware - subscription', () => {
  let subscriptionMiddleware;

  beforeAll(() => {
    subscriptionMiddleware = require('../middleware/subscription');
  });

  test('should export middleware functions', () => {
    expect(subscriptionMiddleware).toBeDefined();
  });
});

describe('Middleware - permissionMatrix', () => {
  let permissionMatrix;

  beforeAll(() => {
    permissionMatrix = require('../middleware/permissionMatrix');
  });

  test('should export middleware functions', () => {
    expect(permissionMatrix).toBeDefined();
  });

  test('should authorize team creation from the stored Pro trial subscription', async () => {
    const User = require('../models/User');
    const Subscription = require('../models/Subscription');
    const userId = '507f1f77bcf86cd799439011';
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: userId });
    jest.spyOn(User, 'updateOne').mockResolvedValue({ acknowledged: true });
    jest.spyOn(Subscription, 'findOne').mockResolvedValue(new Subscription({ userId, tier: 'pro', status: 'trial' }));

    const result = await permissionMatrix.checkPermission(userId, 'create', 'company');

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('pro');
    jest.restoreAllMocks();
  });
});

describe('Middleware - permissionMatrix field names (audit rec 7)', () => {
  let permissionMatrix;
  // NOTE: require models lazily here, not at describe-body time. This file
  // calls jest.resetModules() in earlier blocks, so describe-body requires
  // would bind stale pre-reset instances while the code under test holds
  // post-reset ones (spyOn would silently miss). The pre-existing test
  // above works for the same reason: it requires inside the test body.
  let User, CodeFile, Company;
  const models = () => {
    User = require('../models/User');
    CodeFile = require('../models/CodeFile');
    Company = require('../models/Company');
  };

  beforeAll(() => {
    models();
    permissionMatrix = require('../middleware/permissionMatrix');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("file check uses real fields: creator allowed, stranger denied, missing 404s", async () => {
    const file = { _id: 'f', company: 'c1', createdBy: 'userA', collaborators: [] };
    jest.spyOn(CodeFile, 'findById').mockResolvedValue(file);
    // Stranger path consults Company; creator path returns before any lookup.
    jest.spyOn(Company, 'findOne').mockResolvedValue(null);

    expect((await permissionMatrix.checkResourceAccess({ _id: 'userA' }, 'file', 'f')).allowed).toBe(true);
    const denied = await permissionMatrix.checkResourceAccess({ _id: 'userB' }, 'file', 'f');
    expect(denied.allowed).toBe(false);

    CodeFile.findById.mockResolvedValue(null);
    const missing = await permissionMatrix.checkResourceAccess({ _id: 'userA' }, 'file', 'f');
    expect(missing.allowed).toBe(false);
    expect(missing.reason).toMatch(/not found/i);
  });

  test('workspace check lets owners in (was 403) and keeps strangers out', async () => {
    const company = { _id: 'c1', owner: 'userA', members: [{ user: 'userM' }] };
    jest.spyOn(Company, 'findById').mockResolvedValue(company);

    expect((await permissionMatrix.checkResourceAccess({ _id: 'userA' }, 'workspace', 'c1')).allowed).toBe(true);
    expect((await permissionMatrix.checkResourceAccess({ _id: 'userM' }, 'workspace', 'c1')).allowed).toBe(true);
    const denied = await permissionMatrix.checkResourceAccess({ _id: 'userB' }, 'workspace', 'c1');
    expect(denied.allowed).toBe(false);

    Company.findById.mockResolvedValue(null);
    const missing = await permissionMatrix.checkResourceAccess({ _id: 'userA' }, 'workspace', 'c1');
    expect(missing.allowed).toBe(false);
  });

  test('maxFiles counts by `company`, never by nonexistent `companyId`', async () => {
    const Subscription = require('../models/Subscription');
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: 'userA' });
    jest.spyOn(User, 'updateOne').mockResolvedValue({ acknowledged: true });
    jest.spyOn(Subscription, 'findOne').mockResolvedValue({ userId: 'userA', tier: 'pro', status: 'active' });
    jest.spyOn(Company, 'find').mockImplementation(() => ({
      select: () => ({ lean: async () => [{ _id: 'c1' }] }),
    }));
    const countSpy = jest.spyOn(CodeFile, 'countDocuments').mockResolvedValue(7);

    await permissionMatrix.checkLimit('userA', 'maxFiles');

    expect(countSpy).toHaveBeenCalledTimes(1);
    const query = countSpy.mock.calls[0][0];
    expect(JSON.stringify(query)).not.toContain('companyId');
    expect(JSON.stringify(query)).toContain('company');
  });
});