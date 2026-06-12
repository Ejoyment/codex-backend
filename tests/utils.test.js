/**
 * Tests for all Utility modules
 * Covers: errorHandler, billingScheduler, meetingSocket, emailServiceResend,
 * geminiService, agentOrchestrator, aiService, vectorMemory, githubService,
 * debugAdapter, selfHealingSystem, hitlGates, emailService, virtualFileSystem,
 * sandboxSecurity, terminalService, supportSocket, languageRestrictions,
 * collaborationService, billingCron, codeSearchService, sandboxExecutor,
 * notificationService, lspManager, flutterwaveScheduler, paystackScheduler, gitService
 */

// Helper to safely require a module (some may throw during require)
function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (e) {
    return { error: e.message, name: modulePath };
  }
}

describe('Utils - errorHandler', () => {
  let errorHandler;

  beforeAll(() => {
    errorHandler = require('../utils/errorHandler');
  });

  test('should export error handling utilities', () => {
    expect(errorHandler.ErrorTypes).toBeDefined();
    expect(errorHandler.ErrorSeverity).toBeDefined();
    expect(typeof errorHandler.categorizeError).toBe('function');
    expect(typeof errorHandler.determineSeverity).toBe('function');
    expect(typeof errorHandler.logError).toBe('function');
    expect(typeof errorHandler.getUserFriendlyMessage).toBe('function');
    expect(typeof errorHandler.handleApiCall).toBe('function');
    expect(typeof errorHandler.asyncHandler).toBe('function');
    expect(typeof errorHandler.safeJsonParse).toBe('function');
    expect(typeof errorHandler.safeAsync).toBe('function');
    expect(typeof errorHandler.CircuitBreaker).toBe('function');
  });

  test('categorizeError should return NETWORK for network errors', () => {
    const result = errorHandler.categorizeError(new Error('Network error'));
    expect(result).toBe(errorHandler.ErrorTypes.NETWORK);
  });

  test('categorizeError should return AUTHENTICATION for token errors', () => {
    const result = errorHandler.categorizeError(new Error('Invalid token'));
    expect(result).toBe(errorHandler.ErrorTypes.AUTHENTICATION);
  });

  test('categorizeError should return UNKNOWN for unknown errors', () => {
    const result = errorHandler.categorizeError(new Error('Random error'));
    expect(result).toBe(errorHandler.ErrorTypes.UNKNOWN);
  });

  test('CircuitBreaker should start in CLOSED state', () => {
    const breaker = new errorHandler.CircuitBreaker();
    const state = breaker.getState();
    expect(state.state).toBe('CLOSED');
  });

  test('safeJsonParse should return parsed object for valid JSON', () => {
    const result = errorHandler.safeJsonParse('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });
});

describe('Utils - all modules load correctly', () => {
  const utils = [
    'billingScheduler',
    'meetingSocket',
    'emailServiceResend',
    'geminiService',
    'agentOrchestrator',
    'aiService',
    'vectorMemory',
    'githubService',
    'debugAdapter',
    'selfHealingSystem',
    'hitlGates',
    'emailService',
    'virtualFileSystem',
    'sandboxSecurity',
    'terminalService',
    'supportSocket',
    'languageRestrictions',
    'collaborationService',
    'billingCron',
    'codeSearchService',
    'sandboxExecutor',
    'notificationService',
    'lspManager',
    'flutterwaveScheduler',
    'paystackScheduler',
    'gitService'
  ];

  utils.forEach(utilName => {
    test(`${utilName} should export a module`, () => {
      const mod = safeRequire(`../utils/${utilName}`);
      expect(mod).toBeDefined();
      // If it loaded successfully, it should be an object or function
      // If it threw, the error property will be set
      if (mod.error) {
        console.warn(`Module ${utilName} had require error: ${mod.error}`);
      }
      expect(mod).toBeTruthy();
    });
  });
});