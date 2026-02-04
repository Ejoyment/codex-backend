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

class AgentOrchestrator {
    constructor() {
        this.maxIterations = 10; // Prevent infinite loops
        this.tools = this.initializeTools();
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
                    testFile: 'string - Optional specific test file'
                },
                execute: async (params, context) => {
                    // Placeholder for test execution
                    return {
                        success: true,
                        message: 'Test execution not yet implemented',
                        results: {
                            passed: 0,
                            failed: 0,
                            skipped: 0
                        }
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
        let lastObservation = this.observe(context);

        while (iteration < this.maxIterations && !goalAchieved) {
            iteration++;
            console.log(`\n=== Agent Iteration ${iteration} ===`);

            // 1. OBSERVATION - Current state
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
                break;
            }

            // 3. ACTION - Execute the chosen tool
            const actionResult = await this.act(reasoning.action, context);

            // 4. FEEDBACK - Integrate result for next iteration
            lastObservation = this.feedback(observation, actionResult);

            // Store iteration
            session.iterations.push({
                iteration,
                observation,
                reasoning,
                action: reasoning.action,
                result: actionResult
            });

            // Save to database
            await this.saveIteration(sessionId, {
                iteration,
                thought: reasoning.thought,
                action: reasoning.action,
                result: actionResult
            });
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
    observe(context) {
        return {
            workspace: {
                id: context.workspaceId,
                name: context.workspaceName
            },
            files: context.files || [],
            currentFile: context.currentFile || null,
            availableTools: Object.keys(this.tools),
            timestamp: new Date()
        };
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
     * ACTION - Execute the chosen tool
     */
    async act(action, context) {
        const tool = this.tools[action.tool];
        
        if (!tool) {
            return {
                success: false,
                error: `Unknown tool: ${action.tool}`
            };
        }

        try {
            console.log(`Executing tool: ${action.tool}`, action.parameters);
            const result = await tool.execute(action.parameters, context);
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * FEEDBACK - Integrate action result into observation
     */
    feedback(observation, actionResult) {
        return {
            ...observation.state,
            lastAction: actionResult,
            timestamp: new Date()
        };
    }

    /**
     * Build reasoning prompt for LLM
     */
    buildReasoningPrompt(goal, observation, context) {
        return `You are an autonomous AI agent working in a code editor. Your goal is:

**GOAL**: ${goal}

**CURRENT STATE** (Iteration ${observation.iteration}):
- Workspace: ${observation.state.workspace.name}
- Files: ${observation.state.files.length} files
- Current File: ${observation.state.currentFile?.name || 'None'}

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
