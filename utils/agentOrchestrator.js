/**
 * AI Agent Orchestrator - ReAct Pattern Implementation
 * 
 * This implements the core agentic loop:
 * 1. Observation - Parse environment state
 * 2. Reasoning - LLM evaluates and plans
 * 3. Action - Execute tools/functions
 * 4. Feedback - Integrate results and iterate
 */

const aiService = require('./aiService');
const AgentSession = require('../models/AIPairSession');
const ChatMessage = require('../models/ChatMessage');
const vectorMemory = require('./vectorMemory');
const HITLGates = require('./hitlGates');

class AgentOrchestrator {
    constructor(io = null) {
        this.maxIterations = 10; // Prevent infinite loops
        this.maxRetries = 3; // Max retries per action
        this.tools = this.initializeTools();
        this.vectorMemory = vectorMemory;
        this.hitlGates = new HITLGates(io);
        
        // Tool alternatives for self-correction
        this.toolAlternatives = {
            'create_file': 'update_file',
            'delete_file': 'update_file',
            'run_command': 'execute_code'
        };
        
        // Start cleanup interval for expired confirmations
        setInterval(() => {
            this.hitlGates.clearExpiredConfirmations();
        }, 30000); // Every 30 seconds
    }
    
    /**
     * Set Socket.io instance for HITL communication
     */
    setSocketIO(io) {
        this.hitlGates.io = io;
    }

    /**
     * Initialize available tools that the agent can use
     * Each tool has a schema that the LLM can understand
     */
    initializeTools() {
        return {
            read_file: {
                name: 'read_file',
                description: 'Read the contents of a file from the workspace',
                parameters: {
                    fileId: 'string - The ID of the file to read',
                    path: 'string - The path of the file'
                },
                execute: async (params, context) => {
                    const CodeFile = require('../models/CodeFile');
                    const file = await CodeFile.findById(params.fileId);
                    return {
                        success: true,
                        content: file.content,
                        language: file.language,
                        path: file.path
                    };
                }
            },
            
            create_file: {
                name: 'create_file',
                description: 'Create a new file in the workspace',
                parameters: {
                    name: 'string - File name',
                    content: 'string - File content',
                    language: 'string - Programming language',
                    path: 'string - Directory path'
                },
                execute: async (params, context) => {
                    const CodeFile = require('../models/CodeFile');
                    const file = await CodeFile.create({
                        name: params.name,
                        content: params.content || '',
                        language: params.language,
                        path: params.path || '/',
                        company: context.workspaceId,
                        createdBy: context.userId,
                        lastModifiedBy: context.userId
                    });
                    return {
                        success: true,
                        fileId: file._id,
                        message: `Created ${params.name}`
                    };
                }
            },
            
            update_file: {
                name: 'update_file',
                description: 'Update an existing file',
                parameters: {
                    fileId: 'string - File ID',
                    content: 'string - New content'
                },
                execute: async (params, context) => {
                    const CodeFile = require('../models/CodeFile');
                    const file = await CodeFile.findById(params.fileId);
                    
                    // Save version history
                    file.versions.push({
                        content: file.content,
                        modifiedBy: file.lastModifiedBy,
                        modifiedAt: file.updatedAt,
                        comment: 'AI Agent Update'
                    });
                    
                    file.content = params.content;
                    file.lastModifiedBy = context.userId;
                    await file.save();
                    
                    return {
                        success: true,
                        message: `Updated ${file.name}`
                    };
                }
            },
            
            delete_file: {
                name: 'delete_file',
                description: 'Delete a file from the workspace',
                parameters: {
                    fileId: 'string - File ID'
                },
                execute: async (params, context) => {
                    const CodeFile = require('../models/CodeFile');
                    const file = await CodeFile.findByIdAndDelete(params.fileId);
                    return {
                        success: true,
                        message: `Deleted ${file.name}`
                    };
                }
            },
            
            list_files: {
                name: 'list_files',
                description: 'List all files in the workspace',
                parameters: {
                    path: 'string - Optional directory path filter'
                },
                execute: async (params, context) => {
                    const CodeFile = require('../models/CodeFile');
                    const query = { company: context.workspaceId };
                    if (params.path) query.path = params.path;
                    
                    const files = await CodeFile.find(query).select('name path language _id');
                    return {
                        success: true,
                        files: files.map(f => ({
                            id: f._id,
                            name: f.name,
                            path: f.path,
                            language: f.language
                        }))
                    };
                }
            },
            
            search_code: {
                name: 'search_code',
                description: 'Search for code patterns across all files',
                parameters: {
                    query: 'string - Search query',
                    language: 'string - Optional language filter'
                },
                execute: async (params, context) => {
                    const CodeFile = require('../models/CodeFile');
                    const query = {
                        company: context.workspaceId,
                        content: { $regex: params.query, $options: 'i' }
                    };
                    if (params.language) query.language = params.language;
                    
                    const files = await CodeFile.find(query).select('name path content');
                    return {
                        success: true,
                        results: files.map(f => ({
                            file: f.name,
                            path: f.path,
                            matches: this.extractMatches(f.content, params.query)
                        }))
                    };
                }
            },
            
            analyze_code: {
                name: 'analyze_code',
                description: 'Analyze code for errors, patterns, or improvements',
                parameters: {
                    fileId: 'string - File ID to analyze',
                    analysisType: 'string - Type: syntax, security, performance, style'
                },
                execute: async (params, context) => {
                    const CodeFile = require('../models/CodeFile');
                    const file = await CodeFile.findById(params.fileId);
                    
                    // Simple analysis (can be enhanced with actual linters)
                    const analysis = {
                        syntax: this.checkSyntax(file.content, file.language),
                        complexity: this.calculateComplexity(file.content),
                        suggestions: this.generateSuggestions(file.content, file.language)
                    };
                    
                    return {
                        success: true,
                        analysis
                    };
                }
            },
            
            run_tests: {
                name: 'run_tests',
                description: 'Run tests for the codebase',
                parameters: {
                    testFile: 'string - Optional specific test file',
                    framework: 'string - Test framework (jest, mocha, default: jest)'
                },
                execute: async (params, context) => {
                    const sandboxExecutor = require('./sandboxExecutor');
                    const CodeFile = require('../models/CodeFile');
                    
                    // If specific test file provided, run it
                    if (params.testFile) {
                        const file = await CodeFile.findOne({
                            company: context.workspaceId,
                            path: params.testFile
                        });
                        
                        if (!file) {
                            return {
                                success: false,
                                error: `Test file not found: ${params.testFile}`
                            };
                        }
                        
                        const result = await sandboxExecutor.executeTests(
                            file.content,
                            file.language,
                            params.framework || 'jest'
                        );
                        
                        return {
                            success: result.success,
                            output: result.output,
                            errors: result.errors,
                            executionTime: result.executionTime
                        };
                    }
                    
                    // Otherwise, find and run all test files
                    const testFiles = await CodeFile.find({
                        company: context.workspaceId,
                        $or: [
                            { name: /\.test\.(js|ts)$/ },
                            { name: /\.spec\.(js|ts)$/ },
                            { path: /\/tests?\// }
                        ]
                    });
                    
                    if (testFiles.length === 0) {
                        return {
                            success: false,
                            message: 'No test files found'
                        };
                    }
                    
                    const results = [];
                    for (const file of testFiles) {
                        const result = await sandboxExecutor.executeTests(
                            file.content,
                            file.language,
                            params.framework || 'jest'
                        );
                        results.push({
                            file: file.name,
                            success: result.success,
                            output: result.output
                        });
                    }
                    
                    return {
                        success: true,
                        totalTests: results.length,
                        passed: results.filter(r => r.success).length,
                        failed: results.filter(r => !r.success).length,
                        results
                    };
                }
            },
            
            create_multiple_files: {
                name: 'create_multiple_files',
                description: 'Create multiple files at once (for project scaffolding)',
                parameters: {
                    files: 'array - Array of file objects with name, content, language, path'
                },
                execute: async (params, context) => {
                    const CodeFile = require('../models/CodeFile');
                    const created = [];
                    
                    for (const fileData of params.files) {
                        const file = await CodeFile.create({
                            name: fileData.name,
                            content: fileData.content || '',
                            language: fileData.language,
                            path: fileData.path || '/',
                            company: context.workspaceId,
                            createdBy: context.userId,
                            lastModifiedBy: context.userId
                        });
                        created.push({
                            id: file._id,
                            name: file.name,
                            path: file.path
                        });
                    }
                    
                    return {
                        success: true,
                        created: created.length,
                        files: created
                    };
                }
            },

            execute_code: {
                name: 'execute_code',
                description: 'Execute code safely in a sandbox environment',
                parameters: {
                    code: 'string - Code to execute',
                    language: 'string - Programming language (javascript, python, etc.)',
                    timeout: 'number - Optional timeout in milliseconds (default: 5000)'
                },
                execute: async (params, context) => {
                    const sandboxExecutor = require('./sandboxExecutor');
                    
                    // Validate code first
                    const validation = sandboxExecutor.validateCode(params.code, params.language);
                    if (!validation.valid) {
                        return {
                            success: false,
                            error: validation.error
                        };
                    }
                    
                    // Execute in sandbox
                    const result = await sandboxExecutor.execute(
                        params.code,
                        params.language || 'javascript',
                        { timeout: params.timeout }
                    );
                    
                    return result;
                }
            }
        };
    }

    /**
     * Main ReAct Loop
     * Implements: Observe → Reason → Act → Feedback
     */
    async executeAgenticLoop(goal, context, sessionId) {
        const session = {
            goal,
            context,
            sessionId,
            iterations: [],
            maxIterations: this.maxIterations
        };

        let iteration = 0;
        let goalAchieved = false;
        let lastObservation = await this.observe(context, goal);

        while (iteration < this.maxIterations && !goalAchieved) {
            iteration++;
            console.log(`\n=== Agent Iteration ${iteration} ===`);

            // 1. OBSERVATION - Current state with memory retrieval
            const observation = {
                iteration,
                state: lastObservation,
                previousActions: session.iterations.map(i => ({
                    action: i.action,
                    result: i.result
                }))
            };

            // 2. REASONING - LLM decides next action
            const reasoning = await this.reason(goal, observation, context);
            
            if (!reasoning.success) {
                console.error('Reasoning failed:', reasoning.error);
                break;
            }

            // Check if goal is achieved
            if (reasoning.goalAchieved) {
                goalAchieved = true;
                session.iterations.push({
                    iteration,
                    observation,
                    reasoning,
                    action: null,
                    result: { success: true, message: 'Goal achieved' }
                });

                // Store successful pattern in vector memory
                await this.storeSuccessfulPattern(goal, session, context);
                break;
            }

            // 3. ACTION - Execute the chosen tool
            const actionResult = await this.act(reasoning.action, context);

            // 4. FEEDBACK - Integrate result for next iteration
            lastObservation = await this.feedback(observation, actionResult, context, goal);

            // Store iteration
            const iterationData = {
                iteration,
                observation,
                reasoning,
                action: reasoning.action,
                result: actionResult
            };
            session.iterations.push(iterationData);

            // Save to database
            await this.saveIteration(sessionId, {
                iteration,
                thought: reasoning.thought,
                action: reasoning.action,
                result: actionResult
            });

            // Store successful action patterns
            if (actionResult.success) {
                await this.storeActionPattern(reasoning, actionResult, context);
            }
        }

        return {
            success: goalAchieved || iteration < this.maxIterations,
            iterations: session.iterations,
            finalState: lastObservation,
            summary: this.generateSummary(session)
        };
    }

    /**
     * OBSERVATION - Parse current environment state
     */
    async observe(context, goal) {
        const observation = {
            workspace: {
                id: context.workspaceId,
                name: context.workspaceName
            },
            files: context.files || [],
            currentFile: context.currentFile || null,
            availableTools: Object.keys(this.tools),
            timestamp: new Date()
        };

        // Retrieve relevant memories from vector store
        try {
            const memories = await this.vectorMemory.retrieve(
                goal, // Use goal as query
                5, // Top 5 similar memories
                context.userId,
                context.workspaceId
            );

            if (memories && memories.length > 0) {
                observation.relevantMemories = memories.map(m => ({
                    content: m.content,
                    type: m.metadata?.type,
                    language: m.metadata?.language,
                    score: m.score
                }));
                console.log(`📚 Retrieved ${memories.length} relevant memories`);
            }
        } catch (error) {
            console.error('Failed to retrieve memories:', error);
            // Non-critical, continue without memories
        }

        return observation;
    }

    /**
     * REASONING - LLM evaluates and plans next action
     */
    async reason(goal, observation, context) {
        const prompt = this.buildReasoningPrompt(goal, observation, context);
        
        try {
            const response = await aiService.chat([
                { role: 'user', content: prompt }
            ], {
                agentMode: true,
                instructions: 'You are in ReAct agent mode. Respond with JSON only.'
            });

            // Parse LLM response
            const parsed = this.parseReasoningResponse(response.content);
            return parsed;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * ACTION - Execute the chosen tool with retry and self-correction
     */
    async act(action, context) {
        return await this.executeWithRetry(action, context);
    }

    /**
     * Execute action with retry logic and self-correction
     */
    async executeWithRetry(action, context, attempt = 1) {
        const tool = this.tools[action.tool];
        
        if (!tool) {
            return {
                success: false,
                error: `Unknown tool: ${action.tool}`
            };
        }

        try {
            // Check if HITL confirmation is required
            const userTier = context.userTier || 'freebie';
            
            if (this.hitlGates.requiresConfirmation(action.tool, action.parameters, userTier)) {
                console.log(`🔒 HITL Gate: Requesting confirmation for ${action.tool}`);
                
                try {
                    const confirmation = await this.hitlGates.requestConfirmation(
                        action.tool,
                        action.parameters,
                        context.userId,
                        context
                    );
                    
                    if (!confirmation.approved) {
                        return {
                            success: false,
                            error: 'Action rejected by user',
                            userRejected: true
                        };
                    }
                    
                    console.log(`✓ User approved ${action.tool}`);
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        confirmationFailed: true
                    };
                }
            }
            
            console.log(`Executing tool: ${action.tool} (attempt ${attempt}/${this.maxRetries})`, action.parameters);
            const result = await tool.execute(action.parameters, context);
            
            if (result.success) {
                return result;
            }
            
            // If failed and retries available, analyze error and retry
            if (attempt < this.maxRetries) {
                console.log(`⚠️ Action failed, analyzing error for retry...`);
                const correction = await this.analyzeError(result.error || result.message, action, context);
                
                if (correction.shouldRetry) {
                    console.log(`🔄 Retry ${attempt + 1}: ${correction.reasoning}`);
                    
                    // Use corrected parameters or alternative tool
                    const nextAction = {
                        tool: correction.alternativeTool || action.tool,
                        parameters: correction.adjustedParameters || action.parameters
                    };
                    
                    return await this.executeWithRetry(nextAction, context, attempt + 1);
                }
            }
            
            return result;
            
        } catch (error) {
            console.error(`❌ Tool execution error:`, error.message);
            
            // Try alternative tool if available and retries remain
            if (attempt < this.maxRetries) {
                const alternativeTool = this.getAlternativeTool(action.tool);
                
                if (alternativeTool) {
                    console.log(`🔄 Switching to alternative tool: ${alternativeTool}`);
                    
                    const nextAction = {
                        tool: alternativeTool,
                        parameters: this.adaptParametersForTool(action.parameters, alternativeTool)
                    };
                    
                    return await this.executeWithRetry(nextAction, context, attempt + 1);
                }
            }
            
            return {
                success: false,
                error: error.message,
                attempts: attempt
            };
        }
    }

    /**
     * Analyze error and suggest corrections using AI
     */
    async analyzeError(error, action, context) {
        try {
            const prompt = `Analyze this error and suggest a correction:

**Tool**: ${action.tool}
**Parameters**: ${JSON.stringify(action.parameters, null, 2)}
**Error**: ${error}

**Available Tools**: ${Object.keys(this.tools).join(', ')}

Analyze the error and respond with JSON:
{
  "shouldRetry": true/false,
  "reasoning": "explanation of the error and correction strategy",
  "adjustedParameters": { "corrected": "parameters" },
  "alternativeTool": "alternative_tool_name or null"
}

RESPOND WITH JSON ONLY.`;

            const response = await aiService.chat([
                { role: 'user', content: prompt }
            ], {
                agentMode: true,
                instructions: 'Analyze error and suggest correction. JSON only.'
            });

            // Parse response
            let cleaned = response.content.trim();
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            }
            
            const correction = JSON.parse(cleaned);
            return correction;
            
        } catch (error) {
            console.error('Failed to analyze error:', error);
            return {
                shouldRetry: false,
                reasoning: 'Could not analyze error',
                adjustedParameters: null,
                alternativeTool: null
            };
        }
    }

    /**
     * Get alternative tool for self-correction
     */
    getAlternativeTool(toolName) {
        return this.toolAlternatives[toolName] || null;
    }

    /**
     * Adapt parameters when switching to alternative tool
     */
    adaptParametersForTool(params, newTool) {
        // Smart parameter adaptation based on tool
        const adapted = { ...params };
        
        // Example adaptations
        if (newTool === 'update_file' && params.name) {
            // Converting from create_file to update_file
            // Need to find fileId from name
            adapted.content = params.content;
            delete adapted.name;
            delete adapted.language;
        }
        
        return adapted;
    }

    /**
     * FEEDBACK - Integrate action result into observation
     */
    async feedback(observation, actionResult, context, goal) {
        return await this.observe(context, goal); // Re-observe with updated state
    }

    /**
     * Store successful pattern in vector memory
     */
    async storeSuccessfulPattern(goal, session, context) {
        try {
            const pattern = {
                goal,
                iterations: session.iterations.length,
                actions: session.iterations.map(i => i.action?.tool).filter(Boolean),
                summary: this.generateSummary(session)
            };

            await this.vectorMemory.store(
                JSON.stringify(pattern),
                {
                    type: 'successful_pattern',
                    goal,
                    iterationCount: session.iterations.length,
                    timestamp: new Date()
                },
                context.userId,
                context.workspaceId
            );

            console.log('✓ Stored successful pattern in vector memory');
        } catch (error) {
            console.error('Failed to store pattern:', error);
        }
    }

    /**
     * Store individual action pattern
     */
    async storeActionPattern(reasoning, actionResult, context) {
        try {
            const pattern = {
                thought: reasoning.thought,
                action: reasoning.action,
                result: actionResult
            };

            await this.vectorMemory.store(
                JSON.stringify(pattern),
                {
                    type: 'action_pattern',
                    tool: reasoning.action.tool,
                    success: actionResult.success,
                    timestamp: new Date()
                },
                context.userId,
                context.workspaceId
            );
        } catch (error) {
            console.error('Failed to store action pattern:', error);
        }
    }

    /**
     * Build reasoning prompt for LLM
     */
    buildReasoningPrompt(goal, observation, context) {
        let memoriesSection = '';
        if (observation.state.relevantMemories && observation.state.relevantMemories.length > 0) {
            memoriesSection = `\n**RELEVANT PAST EXPERIENCES**:
${observation.state.relevantMemories.map((m, i) => 
    `${i + 1}. [${m.type}] ${m.content.substring(0, 200)}... (similarity: ${(m.score * 100).toFixed(1)}%)`
).join('\n')}

Use these past experiences to inform your decision, but adapt to the current context.
`;
        }

        return `You are an autonomous AI agent working in a code editor. Your goal is:

**GOAL**: ${goal}

**CURRENT STATE** (Iteration ${observation.iteration}):
- Workspace: ${observation.state.workspace.name}
- Files: ${observation.state.files.length} files
- Current File: ${observation.state.currentFile?.name || 'None'}
${memoriesSection}
**PREVIOUS ACTIONS**:
${observation.previousActions.map((a, i) => `${i + 1}. ${a.action?.tool}: ${a.result.success ? '✓' : '✗'} ${a.result.message || ''}`).join('\n')}

**AVAILABLE TOOLS**:
${Object.entries(this.tools).map(([name, tool]) => `- ${name}: ${tool.description}`).join('\n')}

**YOUR TASK**:
Analyze the current state and decide the next action to achieve the goal.

**RESPOND IN THIS EXACT JSON FORMAT**:
{
  "thought": "Your reasoning about what to do next",
  "goalAchieved": false,
  "action": {
    "tool": "tool_name",
    "parameters": {
      "param1": "value1"
    }
  }
}

If the goal is achieved, set "goalAchieved": true and omit "action".

RESPOND WITH JSON ONLY - NO MARKDOWN, NO EXPLANATIONS.`;
    }

    /**
     * Parse LLM reasoning response
     */
    parseReasoningResponse(content) {
        try {
            // Remove markdown code blocks if present
            let cleaned = content.trim();
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            }
            
            const parsed = JSON.parse(cleaned);
            return {
                success: true,
                thought: parsed.thought,
                goalAchieved: parsed.goalAchieved || false,
                action: parsed.action
            };
        } catch (error) {
            console.error('Failed to parse reasoning:', content);
            return {
                success: false,
                error: 'Failed to parse LLM response',
                rawContent: content
            };
        }
    }

    /**
     * Save iteration to database
     */
    async saveIteration(sessionId, iteration) {
        await ChatMessage.create({
            sessionId,
            role: 'system',
            content: JSON.stringify(iteration),
            metadata: {
                type: 'agent_iteration',
                iteration: iteration.iteration
            }
        });
    }

    /**
     * Generate summary of agent session
     */
    generateSummary(session) {
        const actions = session.iterations.map(i => i.action?.tool).filter(Boolean);
        const successful = session.iterations.filter(i => i.result?.success).length;
        
        return {
            goal: session.goal,
            totalIterations: session.iterations.length,
            actionsExecuted: actions,
            successfulActions: successful,
            finalThought: session.iterations[session.iterations.length - 1]?.reasoning?.thought
        };
    }

    // Helper methods
    extractMatches(content, query) {
        const lines = content.split('\n');
        const matches = [];
        lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
                matches.push({ line: index + 1, content: line.trim() });
            }
        });
        return matches.slice(0, 5); // Limit to 5 matches
    }

    checkSyntax(content, language) {
        // Placeholder - would integrate with actual linters
        return { valid: true, errors: [] };
    }

    calculateComplexity(content) {
        const lines = content.split('\n').length;
        const functions = (content.match(/function|=>|def /g) || []).length;
        return { lines, functions, score: Math.min(10, Math.floor(lines / 10)) };
    }

    generateSuggestions(content, language) {
        // Placeholder - would use AI or static analysis
        return ['Consider adding comments', 'Extract repeated code into functions'];
    }
}

module.exports = new AgentOrchestrator();
