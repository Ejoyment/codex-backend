/**
 * Meeting Summarizer with LLM
 * Extracts decisions, action items, and summarizes transcripts
 */

const aiService = require('./aiService');

class MeetingSummarizer {
    /**
     * Summarize meeting content
     */
    async summarizeMeeting(meeting) {
        const content = (meeting.notes || '') + '\n\n' + (meeting.transcript || '');
        if (!content || content.trim().length < 50) {
            return this.extractHeuristically(content, meeting);
        }

        try {
            const prompt = `Analyze this meeting transcript/notes and provide a structured summary.

Meeting: ${meeting.title}
Date: ${meeting.scheduledAt}

Content:
${content.substring(0, 4000)}

Provide output in JSON format:
{
  "summary": "2-3 sentence overview",
  "decisions": ["decision 1", "decision 2"],
  "actionItems": [{"text": "action item", "assignee": "name or null", "priority": "high/medium/low"}],
  "keyPoints": ["key point 1"],
  "mentionedFiles": ["file names mentioned"],
  "mentionedTasks": ["task references"],
  "blockers": ["blockers mentioned"]
}

Focus on actionable items and concrete decisions.`;

            const response = await aiService.chat([
                { role: 'user', content: prompt }
            ], {
                agentMode: false,
                instructions: 'Respond with valid JSON only.'
            });

            let cleaned = response.content.trim();
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            }

            const result = JSON.parse(cleaned);
            return {
                ...result,
                method: 'llm',
                summarizedAt: new Date()
            };
        } catch (error) {
            console.error('LLM summarization failed, using heuristics:', error.message);
            return this.extractHeuristically(content, meeting);
        }
    }

    extractHeuristically(content, meeting) {
        const decisions = [];
        const actionItems = [];
        const lines = content.split('\n');

        for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.includes('decided') || lower.includes('agreed') || lower.includes('we will')) {
                decisions.push(line.trim().substring(0, 150));
            }
            if (lower.includes('action') || lower.includes('todo') || lower.includes('need to') || lower.includes('@')) {
                actionItems.push({
                    text: line.trim().substring(0, 150),
                    assignee: null,
                    priority: 'medium'
                });
            }
        }

        return {
            summary: content.substring(0, 200).replace(/\n/g, ' ') + '...',
            decisions: decisions.slice(0, 10),
            actionItems: actionItems.slice(0, 10),
            keyPoints: [],
            mentionedFiles: [],
            mentionedTasks: [],
            blockers: [],
            method: 'heuristic',
            summarizedAt: new Date()
        };
    }
}

module.exports = new MeetingSummarizer();
