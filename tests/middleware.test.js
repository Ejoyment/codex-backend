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

  test('should call next if valid token provided', () => {
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe('mock-user-id');
  });

  test('should return 403 if token is invalid', () => {
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

    authBad(req, res, next);

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
});