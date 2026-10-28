/**
 * Agent Context Types and Constants
 * Defines constants for context building, ranking, and token budgets
 */

const CONTEXT_SOURCES = {
    TASKS: 'tasks',
    MEMBERS: 'members',
    MESSAGES: 'messages',
    MEETINGS: 'meetings',
    FILES: 'files',
    VECTOR_MEMORY: 'vector_memory',
    TEAM_CONVENTIONS: 'team_conventions',
    INTEGRATIONS: 'integrations',
    FIGMA: 'figma',
    TICKETS: 'tickets'
};

const RELEVANCE_WEIGHTS = {
    TASK_COMMENT: 1.0,
    ACTIVE_TASK: 1.0,
    DM_ABOUT_TASK: 0.9,
    DIRECT_MENTION: 0.9,
    THREAD_REPLY: 0.8,
    MEETING_ACTION_ITEM: 0.8,
    MEETING_DECISION: 0.8,
    CHANNEL_THREAD: 0.7,
    SAME_PROJECT: 0.6,
    RECENT_FILE: 0.6,
    SEMANTIC_MATCH: 0.5,
    RECENT_ACTIVITY: 0.4
};

const RECENCY_DECAY = {
    // hours -> decay factor
    1: 1.0,
    6: 0.95,
    24: 0.85,
    48: 0.75,
    72: 0.65,
    168: 0.5, // 1 week
    720: 0.3  // 30 days
};

const TIME_WINDOWS = {
    TASK_RELATED: 48 * 60 * 60 * 1000, // 48 hours
    RECENT_MESSAGES: 72 * 60 * 60 * 1000, // 72 hours
    MEETINGS: 7 * 24 * 60 * 60 * 1000, // 7 days
    RECENT_FILES: 48 * 60 * 60 * 1000 // 48 hours
};

const TOKEN_CAPS = {
    DEFAULT: 3500,
    HIGH_TIER: 5000,
    ENTERPRISE: 6500
};

const CONTEXT_LIMITS = {
    MAX_ASSIGNED_TASKS: 10,
    MAX_RELEVANT_MESSAGES: 15,
    MAX_THREAD_REPLIES: 5,
    MAX_MEETINGS: 5,
    MAX_PROJECT_FILES: 30,
    MAX_RECENT_FILES: 15,
    MAX_VECTOR_MATCHES: 8,
    MAX_MEMBERS_DISPLAY: 20
};

module.exports = {
    CONTEXT_SOURCES,
    RELEVANCE_WEIGHTS,
    RECENCY_DECAY,
    TIME_WINDOWS,
    TOKEN_CAPS,
    CONTEXT_LIMITS
};
