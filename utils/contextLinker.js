/**
 * Context Linker
 * Links entities together and scores relevance
 */

const { RELEVANCE_WEIGHTS, RECENCY_DECAY, TIME_WINDOWS } = require('./agentContextTypes');
const meetingSummarizer = require('./meetingSummarizer');

class ContextLinker {
    /**
     * Calculate recency score based on age
     */
    getRecencyScore(timestamp) {
        if (!timestamp) return 0.5;
        const now = Date.now();
        const ageMs = now - new Date(timestamp).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);

        if (ageHours <= 1) return RECENCY_DECAY[1];
        if (ageHours <= 6) return RECENCY_DECAY[6];
        if (ageHours <= 24) return RECENCY_DECAY[24];
        if (ageHours <= 48) return RECENCY_DECAY[48];
        if (ageHours <= 72) return RECENCY_DECAY[72];
        if (ageHours <= 168) return RECENCY_DECAY[168];
        return RECENCY_DECAY[720];
    }

    /**
     * Score a message for relevance
     */
    scoreMessage(message, context) {
        let score = 0;
        const reasons = [];
        const { activeTask, userId, projectId } = context;

        // Direct mention
        if (message.mentions?.some(m => (m._id || m).toString() === userId.toString())) {
            score += RELEVANCE_WEIGHTS.DIRECT_MENTION;
            reasons.push('mentioned');
        }

        // DM
        if (message.recipient && (message.recipient.toString() === userId.toString() || message.sender?.toString() === userId.toString())) {
            score += RELEVANCE_WEIGHTS.DM_ABOUT_TASK;
            reasons.push('dm');
        }

        // Task related
        if (activeTask) {
            const content = (message.content || '').toLowerCase();
            const taskTitle = (activeTask.title || '').toLowerCase();
            if (taskTitle && content.includes(taskTitle)) {
                score += RELEVANCE_WEIGHTS.ACTIVE_TASK * 0.8;
                reasons.push('same_task');
            }
            // Check if sender/recipient involved with task
            if (activeTask.assignedTo && (
                message.sender?.toString() === activeTask.assignedTo.toString() ||
                activeTask.assignedTo.toString() === userId.toString()
            )) {
                score += 0.3;
            }
            if (activeTask.createdBy && (
                message.sender?.toString() === activeTask.createdBy.toString() ||
                message.recipient?.toString() === activeTask.createdBy.toString()
            )) {
                score += 0.2;
            }
        }

        // Thread
        if (message.parentMessage || (message.thread && message.thread.length > 0)) {
            score += RELEVANCE_WEIGHTS.THREAD_REPLY;
            reasons.push('thread');
        }

        // Same project context (if channel linked to project - heuristic)
        score += this.getRecencyScore(message.createdAt) * 0.3;

        return { score: Math.min(score, 1.0), reasons };
    }

    /**
     * Score a meeting for relevance
     */
    scoreMeeting(meeting, context) {
        let score = 0;
        const reasons = [];
        const { activeTask, userId, projectId } = context;

        // User is participant or host
        if (meeting.host?.toString() === userId.toString()) {
            score += 0.4;
            reasons.push('host');
        }
        if (meeting.participants?.some(p => p.user?.toString() === userId.toString())) {
            score += 0.3;
            reasons.push('participant');
        }

        // Linked to task
        if (activeTask && meeting.linkedTaskIds?.some(id => id.toString() === activeTask._id.toString())) {
            score += RELEVANCE_WEIGHTS.MEETING_ACTION_ITEM;
            reasons.push('linked_task');
        }

        // Task related by content
        if (activeTask) {
            const content = ((meeting.notes || '') + ' ' + (meeting.transcript || '')).toLowerCase();
            const taskTitle = (activeTask.title || '').toLowerCase();
            if (taskTitle && content.includes(taskTitle)) {
                score += 0.4;
                reasons.push('task_mentioned');
            }
        }

        score += this.getRecencyScore(meeting.scheduledAt) * 0.3;

        return { score: Math.min(score, 1.0), reasons };
    }

    async summarizeMeeting(meeting) {
        try {
            return await meetingSummarizer.summarizeMeeting(meeting);
        } catch (error) {
            return this.extractHeuristically ? this.extractHeuristically((meeting.notes || '') + ' ' + (meeting.transcript || ''), meeting) : { summary: meeting.notes || '' };
        }
    }

    /**
     * Extract decisions from messages
     */
    extractDecisions(messages) {
        const decisions = [];
        const patterns = [
            /(?:we should|let's|make sure to|do not forget to|remember to|keep it|use|don't forget|ensure|must|need to)\s+([^.!?\n]{10,200})/gi,
            /(?:decision|agreed|decided|clarif(?:y|ication)|note that):\s*([^.!?\n]{10,200})/gi,
            /(?:just|important|crucial|key):\s*([^.!?\n]{10,200})/gi
        ];

        for (const msg of messages) {
            if (!msg || !msg.content) continue;
            const content = msg.content || '';
            for (const pattern of patterns) {
                pattern.lastIndex = 0;
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    if (match[1] && match[1].trim().length > 10 && match[1].trim().length < 200) {
                        decisions.push({
                            text: match[1].trim(),
                            sourceMessageId: msg._id,
                            source: 'message',
                            sender: msg.sender,
                            inferredAt: msg.createdAt || new Date()
                        });
                    }
                }
            }
        }

        // Remove duplicates
        const seen = new Set();
        return decisions.filter(d => {
            const key = d.text.toLowerCase().replace(/\s+/g, ' ');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 15);
    }

    /**
     * Extract action items from meeting content
     */
    extractActionItems(content) {
        if (!content) return [];
        const actionItems = [];
        const patterns = [
            /(?:TODO|ACTION|ACTION ITEM):\s*([^\n]+)/gi,
            /(?:need to|must|should)\s+([^\n.]+)/gi
        ];

        for (const pattern of patterns) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
                if (match[1] && match[1].trim().length > 5) {
                    actionItems.push({
                        text: match[1].trim(),
                        assignee: null,
                        done: false
                    });
                }
            }
        }

        return actionItems.slice(0, 10);
    }
}

module.exports = new ContextLinker();
