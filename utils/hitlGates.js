/**
 * Human-in-the-Loop (HITL) Gates
 * 
 * Provides safety gates for dangerous agent operations
 * Requires human confirmation before executing high-risk actions
 */

class HITLGates {
    constructor(io) {
        this.io = io; // Socket.io instance for real-time communication
        
        // Tools that require confirmation
        this.dangerousTools = [
            'delete_file',
            'create_multiple_files', // Bulk operations
            'run_tests', // Can be resource intensive
            'execute_code' // Security risk
        ];
        
        // Risk levels
        this.riskLevels = {
            LOW: 1,
            MEDIUM: 5,
            HIGH: 8,
            CRITICAL: 10
        };
        
        // Pending confirmations
        this.pendingConfirmations = new Map();
    }

    /**
     * Check if tool requires confirmation
     */
    requiresConfirmation(tool, params, userTier) {
        // Enterprise users can bypass some confirmations
        if (userTier === 'enterprise') {
            return ['delete_file'].includes(tool); // Only critical operations
        }
        
        // Professional users need confirmation for dangerous tools
        if (userTier === 'professional') {
            return this.dangerousTools.includes(tool);
        }
        
        // Free users need confirmation for all agent actions
        return true;
    }

    /**
     * Request confirmation from user
     */
    async requestConfirmation(tool, params, userId, context) {
        const confirmationId = `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Assess risk
        const risk = this.assessRisk(tool, params, context);
        
        // Generate preview
        const preview = await this.generatePreview(tool, params, context);
        
        // Create confirmation request
        const request = {
            id: confirmationId,
            tool,
            params,
            risk,
            preview,
            timestamp: new Date(),
            expiresAt: new Date(Date.now() + 60000) // 1 minute timeout
        };
        
        // Store pending confirmation
        this.pendingConfirmations.set(confirmationId, {
            request,
            userId,
            resolve: null,
            reject: null
        });
        
        // Emit to frontend
        if (this.io) {
            this.io.to(userId).emit('agent:confirmation_required', request);
        }
        
        // Wait for user response with timeout
        return new Promise((resolve, reject) => {
            const pending = this.pendingConfirmations.get(confirmationId);
            pending.resolve = resolve;
            pending.reject = reject;
            
            // Auto-reject after timeout
            setTimeout(() => {
                if (this.pendingConfirmations.has(confirmationId)) {
                    this.pendingConfirmations.delete(confirmationId);
                    reject(new Error('Confirmation timeout - user did not respond within 60 seconds'));
                }
            }, 60000);
        });
    }

    /**
     * Handle user response to confirmation
     */
    handleConfirmationResponse(confirmationId, approved, reason = null) {
        const pending = this.pendingConfirmations.get(confirmationId);
        
        if (!pending) {
            return {
                success: false,
                error: 'Confirmation not found or expired'
            };
        }
        
        // Remove from pending
        this.pendingConfirmations.delete(confirmationId);
        
        // Resolve or reject based on user decision
        if (approved) {
            pending.resolve({
                approved: true,
                timestamp: new Date()
            });
        } else {
            pending.reject(new Error(`User rejected action: ${reason || 'No reason provided'}`));
        }
        
        return {
            success: true,
            approved
        };
    }

    /**
     * Assess risk level of an action
     */
    assessRisk(tool, params, context) {
        let score = 0;
        let factors = [];
        
        // Base risk by tool
        const toolRisks = {
            'delete_file': 9,
            'create_multiple_files': 6,
            'execute_code': 8,
            'run_tests': 5,
            'update_file': 3,
            'create_file': 2
        };
        
        score = toolRisks[tool] || 1;
        factors.push(`Base risk for ${tool}: ${score}`);
        
        // Increase risk for bulk operations
        if (params.files && Array.isArray(params.files) && params.files.length > 5) {
            score += 2;
            factors.push(`Bulk operation (${params.files.length} files): +2`);
        }
        
        // Increase risk for code execution
        if (tool === 'execute_code') {
            if (params.code && params.code.includes('require(')) {
                score += 1;
                factors.push('Code contains require(): +1');
            }
            if (params.code && params.code.includes('fs.')) {
                score += 2;
                factors.push('Code accesses filesystem: +2');
            }
        }
        
        // Decrease risk for test environments
        if (context.environment === 'test') {
            score = Math.max(1, score - 2);
            factors.push('Test environment: -2');
        }
        
        // Cap at 10
        score = Math.min(10, score);
        
        // Determine level
        let level = 'LOW';
        if (score >= 8) level = 'CRITICAL';
        else if (score >= 6) level = 'HIGH';
        else if (score >= 4) level = 'MEDIUM';
        
        return {
            score,
            level,
            factors,
            impact: this.describeImpact(tool, params, context)
        };
    }

    /**
     * Describe the impact of an action
     */
    describeImpact(tool, params, context) {
        switch (tool) {
            case 'delete_file':
                return `Will permanently delete file: ${params.fileId || 'unknown'}. This action cannot be undone.`;
            
            case 'create_multiple_files':
                const count = params.files ? params.files.length : 0;
                return `Will create ${count} new files in your workspace.`;
            
            case 'execute_code':
                return `Will execute code in a sandboxed environment. Code: ${params.code?.substring(0, 100)}...`;
            
            case 'run_tests':
                return `Will run test suite. This may take several seconds and consume resources.`;
            
            case 'update_file':
                return `Will modify file: ${params.fileId || 'unknown'}. Previous version will be saved.`;
            
            case 'create_file':
                return `Will create new file: ${params.name || 'unknown'} at ${params.path || '/'}`;
            
            default:
                return `Will execute ${tool} with provided parameters.`;
        }
    }

    /**
     * Generate preview of what will happen
     */
    async generatePreview(tool, params, context) {
        const preview = {
            tool,
            action: this.describeImpact(tool, params, context),
            details: []
        };
        
        try {
            switch (tool) {
                case 'delete_file':
                    if (params.fileId) {
                        const CodeFile = require('../models/CodeFile');
                        const file = await CodeFile.findById(params.fileId).select('name path language');
                        if (file) {
                            preview.details.push(`File: ${file.name}`);
                            preview.details.push(`Path: ${file.path}`);
                            preview.details.push(`Language: ${file.language}`);
                        }
                    }
                    break;
                
                case 'create_multiple_files':
                    if (params.files && Array.isArray(params.files)) {
                        preview.details.push(`Files to create: ${params.files.length}`);
                        params.files.slice(0, 5).forEach(f => {
                            preview.details.push(`  - ${f.name} (${f.language})`);
                        });
                        if (params.files.length > 5) {
                            preview.details.push(`  ... and ${params.files.length - 5} more`);
                        }
                    }
                    break;
                
                case 'execute_code':
                    preview.details.push(`Language: ${params.language || 'javascript'}`);
                    preview.details.push(`Timeout: ${params.timeout || 5000}ms`);
                    preview.details.push(`Code preview:`);
                    const codeLines = (params.code || '').split('\n').slice(0, 10);
                    codeLines.forEach(line => {
                        preview.details.push(`  ${line}`);
                    });
                    if ((params.code || '').split('\n').length > 10) {
                        preview.details.push(`  ... (${(params.code || '').split('\n').length - 10} more lines)`);
                    }
                    break;
                
                case 'run_tests':
                    if (params.testFile) {
                        preview.details.push(`Test file: ${params.testFile}`);
                    } else {
                        preview.details.push(`Will run all test files in workspace`);
                    }
                    preview.details.push(`Framework: ${params.framework || 'jest'}`);
                    break;
                
                case 'update_file':
                    if (params.fileId) {
                        const CodeFile = require('../models/CodeFile');
                        const file = await CodeFile.findById(params.fileId).select('name path');
                        if (file) {
                            preview.details.push(`File: ${file.name}`);
                            preview.details.push(`Path: ${file.path}`);
                        }
                    }
                    if (params.content) {
                        const lines = params.content.split('\n').length;
                        preview.details.push(`New content: ${lines} lines`);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error generating preview:', error);
            preview.details.push('Unable to generate detailed preview');
        }
        
        return preview;
    }

    /**
     * Auto-approve safe operations
     */
    shouldAutoApprove(tool, params, userTier) {
        // Enterprise users can auto-approve most operations
        if (userTier === 'enterprise') {
            return !['delete_file'].includes(tool);
        }
        
        // Professional users can auto-approve read operations
        if (userTier === 'professional') {
            const safeTools = ['read_file', 'list_files', 'search_code', 'analyze_code'];
            return safeTools.includes(tool);
        }
        
        // Free users need confirmation for everything
        return false;
    }

    /**
     * Get pending confirmations for a user
     */
    getPendingConfirmations(userId) {
        const pending = [];
        
        this.pendingConfirmations.forEach((value, key) => {
            if (value.userId === userId) {
                pending.push({
                    id: key,
                    ...value.request
                });
            }
        });
        
        return pending;
    }

    /**
     * Clear expired confirmations
     */
    clearExpiredConfirmations() {
        const now = Date.now();
        
        this.pendingConfirmations.forEach((value, key) => {
            if (value.request.expiresAt < now) {
                value.reject(new Error('Confirmation expired'));
                this.pendingConfirmations.delete(key);
            }
        });
    }
}

module.exports = HITLGates;
