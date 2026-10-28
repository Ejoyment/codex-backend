/**
 * Agent Context Service
 * Builds comprehensive context bundle for AI agents
 */

const Company = require('../models/Company');
const User = require('../models/User');
const TeamTask = require('../models/TeamTask');
const LocalTask = require('../models/LocalTask');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const MeetingRoom = require('../models/MeetingRoom');
const CodeFile = require('../models/CodeFile');
const LocalProject = require('../models/LocalProject');
const SpecModel = require('../models/SpecModel');
const contextPermissions = require('./permissions/contextPermissions');
const contextLinker = require('./contextLinker');
const { CONTEXT_SOURCES, CONTEXT_LIMITS, TOKEN_CAPS, TIME_WINDOWS } = require('./agentContextTypes');
const vectorMemory = require('./vectorMemoryEnhanced');

class AgentContextService {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 90000; // 90 seconds
    }

    getCacheKey(opts) {
        const key = `${opts.userId}|${opts.companyId}|${opts.taskId || ''}|${opts.projectId || ''}|${opts.message?.slice(0, 100) || ''}|${opts.currentFile?.path || ''}`;
        return require('crypto').createHash('md5').update(key).digest('hex');
    }

    /**
     * Build comprehensive context bundle
     */
    async buildBundle(opts = {}) {
        const {
            userId,
            companyId,
            workspaceId,
            taskId,
            projectId,
            message = '',
            currentFile = null,
            includeConversations = true,
            includeMeetings = true,
            includeFiles = true,
            useCache = true
        } = opts;

        if (!userId) {
            throw new Error('userId is required');
        }

        // Check cache
        if (useCache) {
            const cacheKey = this.getCacheKey(opts);
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
                return cached.bundle;
            }
        }

        const bundle = {
            meta: {
                userId,
                companyId,
                workspaceId,
                taskId,
                projectId,
                sources: [],
                tokenEstimate: 0,
                builtAt: new Date(),
                contextHash: ''
            },
            people: {
                members: [],
                assignees: [],
                participantsInvolved: []
            },
            tasks: {
                activeTask: null,
                assignedToMe: [],
                relatedTasks: []
            },
            conversations: {
                relevantMessages: [],
                decisions: []
            },
            meetings: {
                relevant: []
            },
            files: {
                projectSnapshot: [],
                entryPoints: [],
                relatedToTask: []
            },
            knowledge: {
                teamConventions: null,
                vectorMatches: [],
                integrationsSummary: []
            },
            recentActivity: []
        };

        try {
            // 1. Load workspace members
            if (companyId && await contextPermissions.isCompanyMember(userId, companyId)) {
                await this.loadMembers(bundle, companyId);
                bundle.meta.sources.push(CONTEXT_SOURCES.MEMBERS);
            }

            // 2. Load tasks
            await this.loadTasks(bundle, { userId, companyId, taskId, projectId });
            if (bundle.tasks.activeTask || bundle.tasks.assignedToMe.length > 0) {
                bundle.meta.sources.push(CONTEXT_SOURCES.TASKS);
            }

            // 3. Load conversations (DMs, channels, threads)
            if (includeConversations && companyId) {
                await this.loadConversations(bundle, { userId, companyId, taskId, message });
                if (bundle.conversations.relevantMessages.length > 0) {
                    bundle.meta.sources.push(CONTEXT_SOURCES.MESSAGES);
                }
                // Also expand threads for top messages
                await this.expandThreads(bundle, userId, companyId);
            }

            // 4. Load meetings
            if (includeMeetings && companyId) {
                await this.loadMeetings(bundle, { userId, companyId, taskId });
                if (bundle.meetings.relevant.length > 0) {
                    bundle.meta.sources.push(CONTEXT_SOURCES.MEETINGS);
                }
            }

            // 5. Load files/project snapshot
            if (includeFiles && (workspaceId || companyId)) {
                await this.loadFiles(bundle, { userId, workspaceId, companyId, taskId, projectId, currentFile });
                if (bundle.files.projectSnapshot.length > 0) {
                    bundle.meta.sources.push(CONTEXT_SOURCES.FILES);
                }
            }

            // 6. Load vector memory matches
            if (message || bundle.tasks.activeTask) {
                await this.loadVectorMatches(bundle, { userId, companyId, message, task: bundle.tasks.activeTask });
                if (bundle.knowledge.vectorMatches.length > 0) {
                    bundle.meta.sources.push(CONTEXT_SOURCES.VECTOR_MEMORY);
                }
            }

            // Calculate token estimate
            bundle.meta.tokenEstimate = this.estimateTokens(bundle);
            bundle.meta.contextHash = require('crypto').createHash('md5').update(JSON.stringify(bundle)).digest('hex');

            // Cache
            if (useCache) {
                const cacheKey = this.getCacheKey(opts);
                this.cache.set(cacheKey, { bundle, timestamp: Date.now() });
            }
        } catch (error) {
            console.error('Error building context bundle:', error);
        }

        return bundle;
    }

    async loadMembers(bundle, companyId) {
        try {
            const company = await Company.findById(companyId)
                .populate('owner', 'name email avatar')
                .populate('members.user', 'name email avatar')
                .lean();
            if (!company) return;

            if (company.owner) {
                bundle.people.members.push({
                    userId: company.owner._id,
                    name: company.owner.name,
                    email: company.owner.email,
                    role: 'owner',
                    avatarUrl: company.owner.avatar
                });
            }

            for (const member of company.members || []) {
                if (member.user) {
                    bundle.people.members.push({
                        userId: member.user._id,
                        name: member.user.name,
                        email: member.user.email,
                        role: member.role || 'member',
                        avatarUrl: member.user.avatar
                    });
                }
            }
        } catch (error) {
            console.error('Error loading members:', error);
        }
    }

    async loadTasks(bundle, { userId, companyId, taskId, projectId }) {
        try {
            // Load assigned tasks
            const teamTaskQuery = { assignedTo: userId };
            if (companyId) teamTaskQuery.company = companyId;
            const teamTasks = await TeamTask.find(teamTaskQuery)
                .populate('createdBy', 'name')
                .populate('assignedTo', 'name')
                .populate('comments.user', 'name')
                .sort({ updatedAt: -1 })
                .limit(CONTEXT_LIMITS.MAX_ASSIGNED_TASKS)
                .lean();

            const localTaskQuery = { $or: [{ userId }, { assignee: userId }] };
            if (companyId) localTaskQuery.companyId = companyId;
            const localTasks = await LocalTask.find(localTaskQuery)
                .sort({ updatedAt: -1 })
                .limit(CONTEXT_LIMITS.MAX_ASSIGNED_TASKS)
                .lean();

            bundle.tasks.assignedToMe = [...teamTasks, ...localTasks].map(t => ({
                id: t._id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                type: t.company ? 'team' : 'local',
                dueDate: t.dueDate,
                projectId: t.project || t.projectId,
                updatedAt: t.updatedAt
            }));

            // Load active task if specified
            if (taskId) {
                let task = await TeamTask.findById(taskId)
                    .populate('createdBy', 'name')
                    .populate('assignedTo', 'name')
                    .populate('comments.user', 'name')
                    .lean();
                if (!task) {
                    task = await LocalTask.findById(taskId).lean();
                }
                if (task) {
                    bundle.tasks.activeTask = {
                        id: task._id,
                        title: task.title,
                        description: task.description,
                        status: task.status,
                        priority: task.priority,
                        createdBy: task.createdBy?.name || task.createdBy,
                        assignedTo: task.assignedTo?.name || task.assigneeName || task.assignee,
                        comments: (task.comments || []).map(c => ({
                            user: c.user?.name || 'User',
                            text: c.text,
                            createdAt: c.createdAt
                        })),
                        specIds: task.specIds || [],
                        branch: task.branch,
                        dueDate: task.dueDate,
                        projectId: task.project || task.projectId,
                        companyId: task.company || task.companyId
                    };
                }
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
        }
    }

    async loadConversations(bundle, { userId, companyId, taskId, message }) {
        try {
            const accessibleChannels = await contextPermissions.getAccessibleChannelIds(userId, companyId);
            const cutoff = new Date(Date.now() - TIME_WINDOWS.RECENT_MESSAGES);

            const query = {
                company: companyId,
                createdAt: { $gte: cutoff },
                deleted: { $ne: true },
                $or: [
                    { recipient: userId },
                    { sender: userId },
                    ...(accessibleChannels.length > 0 ? [{ channel: { $in: accessibleChannels } }] : [])
                ]
            };

            const messages = await Message.find(query)
                .populate('sender', 'name')
                .populate('recipient', 'name')
                .populate('channel', 'name')
                .sort({ createdAt: -1 })
                .limit(100)
                .lean();

            // Score and rank
            const scored = messages.map(msg => {
                const { score, reasons } = contextLinker.scoreMessage(msg, {
                    activeTask: bundle.tasks.activeTask,
                    userId,
                    projectId: bundle.meta.projectId
                });
                return { msg, score, reasons };
            });

            scored.sort((a, b) => b.score - a.score);

            bundle.conversations.relevantMessages = scored
                .slice(0, CONTEXT_LIMITS.MAX_RELEVANT_MESSAGES)
                .map(({ msg, score, reasons }) => ({
                    id: msg._id,
                    type: msg.recipient ? 'dm' : 'channel',
                    channelId: msg.channel?._id,
                    channelName: msg.channel?.name || (msg.recipient ? 'DM' : 'Unknown'),
                    sender: { id: msg.sender?._id, name: msg.sender?.name || 'User' },
                    recipient: msg.recipient ? { id: msg.recipient._id, name: msg.recipient.name } : null,
                    content: msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content,
                    fullContent: msg.content,
                    mentions: msg.mentions || [],
                    parentMessageId: msg.parentMessage,
                    createdAt: msg.createdAt,
                    relevanceScore: score,
                    reasons
                }));

            // Extract decisions
            bundle.conversations.decisions = contextLinker.extractDecisions(
                scored.slice(0, 10).map(s => s.msg)
            );
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }

    async loadMeetings(bundle, { userId, companyId, taskId }) {
        try {
            const cutoff = new Date(Date.now() - TIME_WINDOWS.MEETINGS);
            const meetings = await MeetingRoom.find({
                company: companyId,
                scheduledAt: { $gte: cutoff },
                $or: [
                    { host: userId },
                    { 'participants.user': userId }
                ]
            })
                .sort({ scheduledAt: -1 })
                .limit(10)
                .lean();

            const scored = meetings.map(meeting => {
                const { score, reasons } = contextLinker.scoreMeeting(meeting, {
                    activeTask: bundle.tasks.activeTask,
                    userId
                });
                return { meeting, score, reasons };
            });

            scored.sort((a, b) => b.score - a.score);

            bundle.meetings.relevant = scored
                .slice(0, CONTEXT_LIMITS.MAX_MEETINGS)
                .map(({ meeting, score, reasons }) => {
                    const content = (meeting.notes || '') + ' ' + (meeting.transcript || '');
                    const actionItems = contextLinker.extractActionItems(content);
                    return {
                        meetingId: meeting._id,
                        title: meeting.title,
                        scheduledAt: meeting.scheduledAt,
                        status: meeting.status,
                        host: meeting.host,
                        participants: meeting.participants || [],
                        summary: meeting.notes || (meeting.transcript ? meeting.transcript.substring(0, 200) + '...' : ''),
                        actionItems,
                        decisions: [],
                        linkedTaskIds: meeting.linkedTaskIds || [],
                        relevanceScore: score,
                        reasons
                    };
                });
        } catch (error) {
            console.error('Error loading meetings:', error);
        }
    }

    async loadFiles(bundle, { userId, workspaceId, companyId, taskId, projectId, currentFile }) {
        try {
            const query = {};
            if (workspaceId) query.company = workspaceId;
            else if (companyId) query.company = companyId;

            // Get recently modified files
            const files = await CodeFile.find(query)
                .sort({ updatedAt: -1 })
                .limit(CONTEXT_LIMITS.MAX_RECENT_FILES * 2)
                .lean();

            bundle.files.projectSnapshot = files
                .slice(0, CONTEXT_LIMITS.MAX_PROJECT_FILES)
                .map(f => ({
                    path: f.path,
                    name: f.name,
                    language: f.language,
                    updatedAt: f.updatedAt,
                    lastModifiedBy: f.lastModifiedBy,
                    reason: 'recent'
                }));

            if (currentFile) {
                bundle.files.entryPoints = [{
                    path: currentFile.path,
                    name: currentFile.name,
                    language: currentFile.language,
                    reason: 'current'
                }];
            }
        } catch (error) {
            console.error('Error loading files:', error);
        }
    }

    async loadVectorMatches(bundle, { userId, companyId, message, task }) {
        try {
            const query = message || (task ? `${task.title} ${task.description || ''}` : '');
            if (!query) return;

            const memories = await vectorMemory.retrieveEnhanced 
                ? await vectorMemory.retrieveEnhanced(query, CONTEXT_LIMITS.MAX_VECTOR_MATCHES, userId, companyId, { preferMessages: true, preferFiles: true })
                : await vectorMemory.retrieve(query, CONTEXT_LIMITS.MAX_VECTOR_MATCHES, userId, companyId);
            if (memories && memories.length > 0) {
                bundle.knowledge.vectorMatches = memories.map(m => ({
                    content: (m.content || '').substring(0, 200),
                    type: m.metadata?.type || 'unknown',
                    score: m.score,
                    metadata: m.metadata
                }));
            }
        } catch (error) {
            console.error('Error loading vector matches:', error);
        }
    }

    async expandThreads(bundle, userId, companyId) {
        try {
            const Message = require('../models/Message');
            const contextPermissions = require('./permissions/contextPermissions');
            const topMessages = bundle.conversations.relevantMessages.slice(0, 5);
            for (const msg of topMessages) {
                if (msg.id) {
                    const parent = await Message.findById(msg.id).populate('sender', 'name').lean();
                    if (parent && parent.channel) {
                        const canAccess = await contextPermissions.canAccessChannel(userId, parent.channel, companyId);
                        if (!canAccess) continue;
                    }
                    if (parent && parent.recipient) {
                        const canAccessDm = await contextPermissions.canAccessDM(userId, parent.recipient, companyId);
                        if (!canAccessDm) continue;
                    }
                    const replies = await Message.find({ parentMessage: msg.id })
                        .populate('sender', 'name')
                        .sort({ createdAt: 1 })
                        .limit(5)
                        .lean();
                    if (replies.length > 0) {
                        msg.threadReplies = replies.map(r => ({
                            id: r._id,
                            sender: r.sender?.name || 'User',
                            content: r.content.length > 200 ? r.content.substring(0, 200) + '...' : r.content,
                            createdAt: r.createdAt
                        }));
                    }
                }
            }
        } catch (error) {
            console.error('Error expanding threads:', error);
        }
    }

    estimateTokens(bundle) {
        const str = JSON.stringify(bundle);
        return Math.ceil(str.length / 4);
    }

    /**
     * Convert bundle to prompt summary
     */
    toPromptSummary(bundle) {
        let summary = '';

        if (bundle.tasks.activeTask) {
            summary += `\n[PRIORITY CONTEXT - TASK]\n`;
            summary += `- Active Task: ${bundle.tasks.activeTask.title} (Status: ${bundle.tasks.activeTask.status}, Priority: ${bundle.tasks.activeTask.priority})\n`;
            summary += `- Created by: ${bundle.tasks.activeTask.createdBy}, Assigned to: ${bundle.tasks.activeTask.assignedTo}\n`;
            if (bundle.tasks.activeTask.description) {
                summary += `- Description: ${bundle.tasks.activeTask.description.substring(0, 300)}${bundle.tasks.activeTask.description.length > 300 ? '...' : ''}\n`;
            }
            if (bundle.tasks.activeTask.comments && bundle.tasks.activeTask.comments.length > 0) {
                summary += `- Comments/Clarifications:\n`;
                for (const c of bundle.tasks.activeTask.comments.slice(0, 5)) {
                    summary += `  * ${c.user}: "${c.text.substring(0, 150)}${c.text.length > 150 ? '...' : ''}"\n`;
                }
            }
            if (bundle.tasks.activeTask.branch) {
                summary += `- Branch: ${bundle.tasks.activeTask.branch}\n`;
            }
            summary += '\n';
        }

        if (bundle.tasks.assignedToMe.length > 0) {
            summary += `[ASSIGNED TO YOU]\n`;
            for (const t of bundle.tasks.assignedToMe.slice(0, 5)) {
                summary += `- ${t.title} (${t.status}, ${t.priority})\n`;
            }
            summary += '\n';
        }

        if (bundle.people.members.length > 0) {
            summary += `[WORKSPACE MEMBERS]\n`;
            summary += bundle.people.members.slice(0, 10).map(m => `- ${m.name} (${m.role})`).join('\n') + '\n\n';
        }

        if (bundle.conversations.relevantMessages.length > 0) {
            summary += `[RELEVANT DISCUSSIONS]\n`;
            for (const msg of bundle.conversations.relevantMessages.slice(0, 10)) {
                summary += `- [${msg.type === 'dm' ? 'DM' : msg.channelName}] ${msg.sender.name}: "${msg.content}"\n`;
                if (msg.threadReplies && msg.threadReplies.length > 0) {
                    for (const reply of msg.threadReplies) {
                        summary += `  └─ ${reply.sender}: "${reply.content}"\n`;
                    }
                }
            }
            summary += '\n';
        }

        if (bundle.conversations.decisions.length > 0) {
            summary += `[KEY DECISIONS/CLARIFICATIONS]\n`;
            for (const d of bundle.conversations.decisions.slice(0, 8)) {
                summary += `- ${d.text}\n`;
            }
            summary += '\n';
        }

        if (bundle.meetings.relevant.length > 0) {
            summary += `[MEETINGS (RELEVANT)]\n`;
            for (const m of bundle.meetings.relevant.slice(0, 3)) {
                summary += `- ${m.title} (${new Date(m.scheduledAt).toLocaleDateString()})\n`;
                if (m.actionItems.length > 0) {
                    summary += `  Action Items: ${m.actionItems.map(a => a.text).join('; ')}\n`;
                }
            }
            summary += '\n';
        }

        if (bundle.files.projectSnapshot.length > 0) {
            summary += `[PROJECT SNAPSHOT]\n`;
            summary += bundle.files.projectSnapshot.slice(0, 15).map(f => `- ${f.path} (${f.language || 'unknown'})`).join('\n') + '\n\n';
        }

        summary += `[INSTRUCTIONS]\n`;
        summary += `- Treat task comments, DMs, and meeting notes as requirements/clarifications even if missing from the original description.\n`;
        summary += `- If implementing for this task, satisfy all clarifications found above.\n`;
        summary += `- Use tools to read files before editing. Stay scoped to workspace.\n`;
        summary += `- Context sources: ${bundle.meta.sources.join(', ')} | Est. tokens: ~${bundle.meta.tokenEstimate}\n`;

        return summary;
    }
}

module.exports = new AgentContextService();
