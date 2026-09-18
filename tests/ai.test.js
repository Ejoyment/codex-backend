/**
 * Enterprise AI Tooling Fallback Tests
 * Tests: AI providers, error handling, orchestrator resilience
 * Covers: utils/geminiService, utils/aiService, utils/agentOrchestrator, utils/errorHandler
 */

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: jest.fn().mockResolvedValue({ response: { text: () => 'Mock AI response' } }),
      startChat: jest.fn(() => ({
        sendMessage: jest.fn().mockResolvedValue({ response: { text: () => 'Mock chat response' } }),
      })),
    })),
  })),
  HarmCategory: { HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT' },
  HarmBlockThreshold: { BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE' },
}));

jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('AI Service - Error Recovery', () => {
  let errorHandler;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_MODEL = 'gemini-2.0-flash-exp';
    errorHandler = require('../utils/errorHandler');
  });

  test('should categorize API timeout errors as NETWORK', () => {
    const error = new Error('Request timeout after 30000ms');
    const category = errorHandler.categorizeError(error);
    expect(category).toBe(errorHandler.ErrorTypes.NETWORK);
  });

  test('should categorize API fetch failures as NETWORK', () => {
    const error = new Error('fetch failed: Connection refused');
    const category = errorHandler.categorizeError(error);
    expect(category).toBe(errorHandler.ErrorTypes.NETWORK);
  });

  test('should retry failed operations with handleApiCall', async () => {
    let attempts = 0;
    const failingFn = async () => {
      attempts++;
      if (attempts < 2) throw new Error('Network error: timeout');
      return 'success';
    };
    const result = await errorHandler.handleApiCall(failingFn, { maxRetries: 3, retryDelay: 10 });
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  test('handleApiCall should throw after exhausting retries', async () => {
    const alwaysFail = async () => { throw new Error('Network error'); };
    await expect(errorHandler.handleApiCall(alwaysFail, { maxRetries: 1, retryDelay: 10 }))
      .rejects.toThrow('Network error');
  });

  test('handleApiCall should return fallback value if all retries fail', async () => {
    const alwaysFail = async () => { throw new Error('Network error'); };
    const result = await errorHandler.handleApiCall(alwaysFail, {
      maxRetries: 1,
      retryDelay: 10,
      fallbackValue: 'cached-response',
    });
    expect(result).toBe('cached-response');
  });

  test('should not retry validation errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Validation error'));
    await expect(errorHandler.handleApiCall(fn, { maxRetries: 3, retryDelay: 10 }))
      .rejects.toThrow('Validation error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('AI Service - Gemini Provider', () => {
  let geminiService;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  test('should export gemini service module', () => {
    geminiService = require('../utils/geminiService');
    expect(geminiService).toBeDefined();
  });
});

describe('AI Service - Agent Orchestrator', () => {
  test('should export agent orchestrator module', () => {
    const orchestrator = require('../utils/agentOrchestrator');
    expect(orchestrator).toBeDefined();
    expect(typeof orchestrator).toBe('object');
  });
});

describe('AI Service - Error Severity', () => {
  let errorHandler;

  beforeAll(() => {
    errorHandler = require('../utils/errorHandler');
  });

  test('database errors should be CRITICAL severity', () => {
    const dbError = new Error('MongoDB connection failed');
    const severity = errorHandler.determineSeverity(errorHandler.ErrorTypes.DATABASE, dbError);
    expect(severity).toBe(errorHandler.ErrorSeverity.CRITICAL);
  });

  test('payment errors should be CRITICAL severity', () => {
    const paymentError = new Error('Stripe payment failed');
    const severity = errorHandler.determineSeverity(errorHandler.ErrorTypes.PAYMENT, paymentError);
    expect(severity).toBe(errorHandler.ErrorSeverity.CRITICAL);
  });

  test('authentication errors should be HIGH severity', () => {
    const authError = new Error('Invalid token');
    const severity = errorHandler.determineSeverity(errorHandler.ErrorTypes.AUTHENTICATION, authError);
    expect(severity).toBe(errorHandler.ErrorSeverity.HIGH);
  });

  test('external API errors should be HIGH severity', () => {
    const apiError = new Error('GitHub API rate limit');
    const severity = errorHandler.determineSeverity(errorHandler.ErrorTypes.EXTERNAL_API, apiError);
    expect(severity).toBe(errorHandler.ErrorSeverity.HIGH);
  });
});

describe('Safe Async Operations', () => {
  let errorHandler;

  beforeAll(() => {
    errorHandler = require('../utils/errorHandler');
  });

  test('safeAsync should return operation result on success', async () => {
    const result = await errorHandler.safeAsync(async () => 'success', 'fallback');
    expect(result).toBe('success');
  });

  test('safeAsync should return fallback on failure', async () => {
    const result = await errorHandler.safeAsync(async () => { throw new Error('fail'); }, 'fallback');
    expect(result).toBe('fallback');
  });

  test('safeJsonParse should return fallback for invalid input', () => {
    const result = errorHandler.safeJsonParse('not-json', 'default-fallback');
    expect(result).toBe('default-fallback');
  });
  
  test('safeJsonParse should parse valid JSON', () => {
    const result = errorHandler.safeJsonParse('{"key":"value"}');
    expect(result).toEqual({ key: 'value' });
  });
});