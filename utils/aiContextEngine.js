const figmaContextService = require('./figmaContextService');
const teamMemoryService = require('./teamMemoryService');
const ticketCodeBridge = require('./ticketCodeBridge');
const aiService = require('./aiService');
const IntegrationData = require('../models/IntegrationData');

async function buildCrossToolContext(userId, companyId, options = {}) {
    const context = {
        userId,
        companyId,
        generatedAt: new Date(),
        sources: [],
        figma: null,
        teamConventions: null,
        ticketContext: null,
        integrations: null,
        codeContext: null
    };
    
    try {
        if (options.includeFigma && options.figmaFileKey) {
            const figmaTokens = await figmaContextService.getDesignTokensForAI(userId, options.figmaFileKey, options.contextType || 'codegen');
            context.figma = figmaTokens;
            if (figmaTokens.designSystem) {
                context.sources.push('figma');
            }
        }
    } catch (error) {
        console.error('Context engine: Figma context failed:', error.message);
    }
    
    try {
        if (options.includeTeamConventions && companyId) {
            const techStack = options.techStack || null;
            const conventionsPrompt = await teamMemoryService.getConventionsPrompt(companyId, techStack);
            context.teamConventions = {
                prompt,
                raw: await teamMemoryService.getTeamConventions(companyId, null, techStack)
            };
            if (context.teamConventions.raw.length > 0) {
                context.sources.push('team_conventions');
            }
        }
    } catch (error) {
        console.error('Context engine: Team conventions failed:', error.message);
    }
    
    try {
        if (options.includeTicketContext && options.ticketId) {
            const analysis = await ticketCodeBridge.getTicketAnalyses(userId);
            const ticketAnalysis = analysis.find(a => a.ticketId.toString() === options.ticketId);
            if (ticketAnalysis) {
                context.ticketContext = ticketAnalysis;
                context.sources.push('support_ticket');
            }
        }
    } catch (error) {
        console.error('Context engine: Ticket context failed:', error.message);
    }
    
    try {
        if (options.includeIntegrations) {
            const Integration = require('../models/Integration');
            const integrations = await Integration.find({ userId, isActive: true }).select('provider status lastSyncAt');
            const integrationData = [];
            
            for (const integration of integrations) {
                const data = await IntegrationData.find({ userId, platform: integration.provider })
                    .sort({ lastSynced: -1 })
                    .limit(5);
                integrationData.push({
                    provider: integration.provider,
                    status: integration.status,
                    lastSyncAt: integration.lastSyncAt,
                    recentData: data.map(d => ({ dataType: d.dataType, summary: d.summary }))
                });
            }
            
            context.integrations = integrationData;
            if (integrationData.length > 0) {
                context.sources.push('integrations');
            }
        }
    } catch (error) {
        console.error('Context engine: Integrations failed:', error.message);
    }
    
    try {
        if (options.includeCodeContext) {
            const LocalProject = require('../models/LocalProject');
            const projects = await LocalProject.find({ userId, isArchived: false }).limit(5);
            context.codeContext = {
                projects: projects.map(p => ({
                    id: p._id,
                    name: p.name,
                    status: p.status,
                    priority: p.priority,
                    tags: p.tags,
                    updatedAt: p.updatedAt
                }))
            };
            if (projects.length > 0) {
                context.sources.push('local_projects');
            }
        }
    } catch (error) {
        console.error('Context engine: Code context failed:', error.message);
    }
    
    return context;
}

async function buildAIPromptWithContext(userId, companyId, userMessage, options = {}) {
    const context = await buildCrossToolContext(userId, companyId, options);
    
    let systemPrompt = 'You are BuildrsHQ AI, a unified development assistant with access to the user\'s entire software ecosystem.';
    
    const contextParts = [];
    
    if (context.figma?.designSystem) {
        contextParts.push(`\n\n[FIGMA DESIGN CONTEXT]\n${JSON.stringify(context.figma.designSystem, null, 2)}`);
    }
    
    if (context.teamConventions?.prompt) {
        contextParts.push(`\n${context.teamConventions.prompt}`);
    }
    
    if (context.ticketContext?.extractedContext) {
        contextParts.push(`\n[SUPPORT TICKET CONTEXT]\n${JSON.stringify(context.ticketContext.extractedContext, null, 2)}`);
    }
    
    if (context.integrations && context.integrations.length > 0) {
        contextParts.push(`\n[CONNECTED INTEGRATIONS]\n${context.integrations.map(i => `- ${i.provider}: ${i.status}`).join('\n')}`);
    }
    
    if (context.codeContext?.projects && context.codeContext.projects.length > 0) {
        contextParts.push(`\n[ACTIVE PROJECTS]\n${context.codeContext.projects.map(p => `- ${p.name} (${p.status})`).join('\n')}`);
    }
    
    const messages = [
        { role: 'system', content: systemPrompt + contextParts.join('') },
        { role: 'user', content: userMessage }
    ];
    
    return { context, messages };
}

module.exports = {
    buildCrossToolContext,
    buildAIPromptWithContext
};
