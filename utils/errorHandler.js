/**
 * Centralized Error Handling Utility
 * Provides consistent error handling, logging, and graceful fallbacks
 */

// Error types for categorization
const ErrorTypes = {
    NETWORK: 'NETWORK_ERROR',
    DATABASE: 'DATABASE_ERROR',
    VALIDATION: 'VALIDATION_ERROR',
    AUTHENTICATION: 'AUTHENTICATION_ERROR',
    AUTHORIZATION: 'AUTHORIZATION_ERROR',
    EXTERNAL_API: 'EXTERNAL_API_ERROR',
    PAYMENT: 'PAYMENT_ERROR',
    FILE_SYSTEM: 'FILE_SYSTEM_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR'
};

// Error severity levels
const ErrorSeverity = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
};

/**
 * Categorize error based on error object
 */
function categorizeError(error) {
    if (!error) return ErrorTypes.UNKNOWN;
    
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    
    // Network errors
    if (message.includes('network') || message.includes('econnrefused') || 
        message.includes('timeout') || code === 'enotfound' || 
        code === 'econnreset' || message.includes('fetch failed')) {
        return ErrorTypes.NETWORK;
    }
    
    // Database errors
    if (message.includes('mongo') || message.includes('database') || 
        message.includes('connection') || code.includes('mongo')) {
        return ErrorTypes.DATABASE;
    }
    
    // Authentication errors
    if (message.includes('token') || message.includes('unauthorized') || 
        message.includes('authentication') || error.status === 401) {
        return ErrorTypes.AUTHENTICATION;
    }
    
    // Authorization errors
    if (message.includes('forbidden') || message.includes('permission') || 
        error.status === 403) {
        return ErrorTypes.AUTHORIZATION;
    }
    
    // Validation errors
    if (message.includes('validation') || message.includes('invalid') || 
        error.status === 400) {
        return ErrorTypes.VALIDATION;
    }
    
    // Payment errors
    if (message.includes('payment') || message.includes('paystack') || 
        message.includes('stripe') || message.includes('billing')) {
        return ErrorTypes.PAYMENT;
    }
    
    // File system errors
    if (message.includes('enoent') || message.includes('file') || 
        message.includes('directory') || code.includes('enoent')) {
        return ErrorTypes.FILE_SYSTEM;
    }
    
    return ErrorTypes.UNKNOWN;
}

/**
 * Determine error severity
 */
function determineSeverity(errorType, error) {
    // Critical errors that require immediate attention
    if (errorType === ErrorTypes.DATABASE || 
        errorType === ErrorTypes.PAYMENT ||
        error.message?.includes('crash') ||
        error.message?.includes('fatal')) {
        return ErrorSeverity.CRITICAL;
    }
    
    // High severity errors
    if (errorType === ErrorTypes.AUTHENTICATION || 
        errorType === ErrorTypes.EXTERNAL_API) {
        return ErrorSeverity.HIGH;
    }
    
    // Medium severity errors
    if (errorType === ErrorTypes.NETWORK || 
        errorType === ErrorTypes.AUTHORIZATION) {
        return ErrorSeverity.MEDIUM;
    }
    
    // Low severity errors
    return ErrorSeverity.LOW;
}

/**
 * Log error with context
 */
function logError(error, context = {}) {
    const errorType = categorizeError(error);
    const severity = determineSeverity(errorType, error);
    
    const logEntry = {
        timestamp: new Date().toISOString(),
        type: errorType,
        severity: severity,
        message: error.message || 'Unknown error',
        stack: error.stack,
        context: context,
        code: error.code,
        status: error.status
    };
    
    // Log based on severity
    if (severity === ErrorSeverity.CRITICAL) {
        console.error('🚨 CRITICAL ERROR:', JSON.stringify(logEntry, null, 2));
    } else if (severity === ErrorSeverity.HIGH) {
        console.error('❌ HIGH SEVERITY ERROR:', JSON.stringify(logEntry, null, 2));
    } else if (severity === ErrorSeverity.MEDIUM) {
        console.warn('⚠️  MEDIUM SEVERITY ERROR:', JSON.stringify(logEntry, null, 2));
    } else {
        console.log('ℹ️  LOW SEVERITY ERROR:', JSON.stringify(logEntry, null, 2));
    }
    
    return logEntry;
}

/**
 * Get user-friendly error message
 */
function getUserFriendlyMessage(errorType, error) {
    const messages = {
        [ErrorTypes.NETWORK]: 'Unable to connect to the server. Please check your internet connection and try again.',
        [ErrorTypes.DATABASE]: 'We\'re experiencing technical difficulties. Please try again in a few moments.',
        [ErrorTypes.VALIDATION]: 'Please check your input and try again.',
        [ErrorTypes.AUTHENTICATION]: 'Your session has expired. Please sign in again.',
        [ErrorTypes.AUTHORIZATION]: 'You don\'t have permission to perform this action.',
        [ErrorTypes.EXTERNAL_API]: 'An external service is temporarily unavailable. Please try again later.',
        [ErrorTypes.PAYMENT]: 'Payment processing failed. Please check your payment details and try again.',
        [ErrorTypes.FILE_SYSTEM]: 'File operation failed. Please try again.',
        [ErrorTypes.UNKNOWN]: 'An unexpected error occurred. Please try again.'
    };
    
    return messages[errorType] || messages[ErrorTypes.UNKNOWN];
}

/**
 * Handle API errors with retry logic
 */
async function handleApiCall(apiFunction, options = {}) {
    const {
        maxRetries = 3,
        retryDelay = 1000,
        exponentialBackoff = true,
        fallbackValue = null,
        context = {}
    } = options;
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiFunction();
        } catch (error) {
            lastError = error;
            const errorType = categorizeError(error);
            
            // Don't retry validation or authorization errors
            if (errorType === ErrorTypes.VALIDATION || 
                errorType === ErrorTypes.AUTHORIZATION) {
                throw error;
            }
            
            // Log the error
            logError(error, { ...context, attempt, maxRetries });
            
            // If this was the last attempt, throw the error
            if (attempt === maxRetries) {
                break;
            }
            
            // Calculate delay with exponential backoff
            const delay = exponentialBackoff 
                ? retryDelay * Math.pow(2, attempt - 1)
                : retryDelay;
            
            console.log(`⏳ Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // All retries failed
    if (fallbackValue !== null) {
        console.log('📦 Using fallback value after all retries failed');
        return fallbackValue;
    }
    
    throw lastError;
}

/**
 * Wrap async route handler with error handling
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            const errorType = categorizeError(error);
            const logEntry = logError(error, {
                method: req.method,
                path: req.path,
                userId: req.userId || req.user?.userId,
                ip: req.ip
            });
            
            // Send appropriate response
            const statusCode = error.status || error.statusCode || 500;
            const userMessage = getUserFriendlyMessage(errorType, error);
            
            res.status(statusCode).json({
                success: false,
                message: userMessage,
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
                errorId: logEntry.timestamp // For support reference
            });
        });
    };
}

/**
 * Handle database operations with retry
 */
async function handleDatabaseOperation(operation, options = {}) {
    return handleApiCall(operation, {
        maxRetries: 3,
        retryDelay: 500,
        context: { type: 'database' },
        ...options
    });
}

/**
 * Handle external API calls with timeout
 */
async function handleExternalApi(apiCall, options = {}) {
    const { timeout = 30000, ...otherOptions } = options;
    
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
    });
    
    return Promise.race([
        handleApiCall(apiCall, {
            maxRetries: 2,
            retryDelay: 2000,
            context: { type: 'external_api' },
            ...otherOptions
        }),
        timeoutPromise
    ]);
}

/**
 * Safe JSON parse with fallback
 */
function safeJsonParse(jsonString, fallback = null) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        logError(error, { context: 'JSON parse', input: jsonString?.substring(0, 100) });
        return fallback;
    }
}

/**
 * Safe async operation with fallback
 */
async function safeAsync(operation, fallback = null, context = {}) {
    try {
        return await operation();
    } catch (error) {
        logError(error, context);
        return fallback;
    }
}

/**
 * Circuit breaker for failing services
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000; // 1 minute
        this.failures = 0;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.nextAttempt = Date.now();
    }
    
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error('Circuit breaker is OPEN');
            }
            this.state = 'HALF_OPEN';
        }
        
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    
    onFailure() {
        this.failures++;
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.resetTimeout;
            console.warn(`⚠️  Circuit breaker opened after ${this.failures} failures`);
        }
    }
    
    getState() {
        return {
            state: this.state,
            failures: this.failures,
            nextAttempt: this.nextAttempt
        };
    }
}

module.exports = {
    ErrorTypes,
    ErrorSeverity,
    categorizeError,
    determineSeverity,
    logError,
    getUserFriendlyMessage,
    handleApiCall,
    asyncHandler,
    handleDatabaseOperation,
    handleExternalApi,
    safeJsonParse,
    safeAsync,
    CircuitBreaker
};
