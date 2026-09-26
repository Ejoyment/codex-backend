const TicketAnalysis = require('../models/TicketAnalysis');
const SupportTicket = require('../models/SupportTicket');
const aiService = require('../utils/aiService');
const githubService = require('../utils/githubService');
const LocalProject = require('../models/LocalProject');

async function analyzeTicket(ticketId, userId) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    
    const analysis = await TicketAnalysis.findOne({ ticketId, userId });
    if (analysis) {
        analysis.analysisStatus = 'analyzing';
        await analysis.save();
    } else {
        await TicketAnalysis.create({
            ticketId,
            userId,
            companyId: null,
            analysisStatus: 'analyzing'
        });
    }
    
    try {
        const latestMessage = ticket.messages[ticket.messages.length - 1];
        const ticketContext = `${ticket.subject}\n\n${latestMessage?.message || ''}`;
        
        const analysisPrompt = `You are an expert developer analyzing a support ticket. Extract structured context from the ticket.

Ticket:
${ticketContext}

Return JSON only with this schema:
{
  "errorType": "string",
  "affectedComponent": "string",
  "probableFile": "string",
  "probableLine": 0,
  "stackTrace": "string or null",
  "keywords": ["string"],
  "summary": "string"
}`;
        
        const aiResult = await aiService.chat([
            { role: 'user', content: analysisPrompt }
        ]);
        
        let extractedContext = {};
        try {
            const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) extractedContext = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error('Failed to parse ticket analysis JSON:', e);
        }
        
        const userProjects = await LocalProject.find({ userId, isArchived: false }).limit(5);
        const linkedFiles = [];
        
        if (extractedContext.probableFile && userProjects.length > 0) {
            for (const project of userProjects) {
                if (project.name && extractedContext.probableFile.toLowerCase().includes(project.name.toLowerCase())) {
                    linkedFiles.push({
                        filePath: extractedContext.probableFile,
                        repository: project.name,
                        branch: 'main',
                        relevanceScore: 0.8
                    });
                    break;
                }
            }
        }
        
        const updatedAnalysis = await TicketAnalysis.findOneAndUpdate(
            { ticketId, userId },
            {
                analysisStatus: 'completed',
                extractedContext,
                linkedFiles,
                analyzedAt: new Date()
            },
            { new: true }
        );
        
        return updatedAnalysis;
    } catch (error) {
        await TicketAnalysis.findOneAndUpdate(
            { ticketId, userId },
            { analysisStatus: 'failed' },
            { new: true }
        );
        throw error;
    }
}

async function generateTicketFix(ticketId, userId) {
    const analysis = await TicketAnalysis.findOne({ ticketId, userId });
    if (!analysis || analysis.analysisStatus !== 'completed') {
        throw new Error('Ticket has not been analyzed yet');
    }
    
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    
    const fixPrompt = `You are an expert developer. Based on the analyzed support ticket, generate a fix.

Ticket: ${ticket.subject}
Context: ${analysis.extractedContext.summary}
Affected Component: ${analysis.extractedContext.affectedComponent}
Probable File: ${analysis.extractedContext.probableFile}

Return JSON only with this schema:
{
  "description": "string",
  "patch": "string",
  "testCase": "string",
  "confidence": 0.0,
  "references": ["string"]
}`;
    
    const aiResult = await aiService.chat([
        { role: 'user', content: fixPrompt }
    ]);
    
    let suggestedFix = {};
    try {
        const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) suggestedFix = JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error('Failed to parse fix JSON:', e);
        suggestedFix = {
            description: aiResult.content,
            patch: '',
            testCase: '',
            confidence: 0.5,
            references: []
        };
    }
    
    analysis.suggestedFix = suggestedFix;
    await analysis.save();
    
    return analysis;
}

async function createTicketSandbox(ticketId, userId) {
    const analysis = await TicketAnalysis.findOne({ ticketId, userId });
    if (!analysis) throw new Error('Ticket analysis not found');
    
    const branchName = `fix/ticket-${ticketId}-${Date.now()}`;
    
    analysis.sandboxState = {
        url: `https://sandbox.buildrshq.com/ticket/${ticketId}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        branch: branchName,
        commitSha: 'pending'
    };
    await analysis.save();
    
    return analysis.sandboxState;
}

async function getTicketAnalyses(userId, status = null) {
    const query = { userId };
    if (status) query.analysisStatus = status;
    
    return await TicketAnalysis.find(query)
        .populate('ticketId', 'subject status ticketId')
        .sort({ createdAt: -1 });
}

module.exports = {
    analyzeTicket,
    generateTicketFix,
    createTicketSandbox,
    getTicketAnalyses
};
