const mongoose = require('mongoose');

const dashboardStateSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    workspaceName: { type: String, default: 'buildr-web' },
    workspaceStatus: { type: String, default: 'Healthy' },
    activeBranch: { type: String, default: 'Main' },
    openTasksCount: { type: Number, default: 7 },
    agentsRunningCount: { type: Number, default: 2 },
    validationPercent: { type: Number, default: 94 },
    needsAttention: [{
        id: { type: String },
        type: { type: String }, // ai_agent, validation, deployment
        title: { type: String },
        subtitle: { type: String },
        badge: { type: String },
        severity: { type: String, default: 'warning' }
    }],
    activeDevelopment: {
        title: { type: String, default: 'Atlas is implementing' },
        taskCode: { type: String, default: 'CMD-128' },
        taskTitle: { type: String, default: 'Global command menu' },
        progressPercent: { type: Number, default: 68 },
        stepText: { type: String, default: 'Step 4 of 6 • Running tests' },
        status: { type: String, default: 'RUNNING' },
        terminalLog: { type: String, default: '$ pnpm test command-menu\\nRUN v2.1.3 /workspace/buildr-web\\n✓ src/components/CommandMenu.test.tsx (8)\\n✓ src/hooks/useCommands.test.ts (4)\\n● Checking TypeScript contracts...' }
    },
    sprints: {
        inProgressCount: { type: Number, default: 4 },
        inReviewCount: { type: Number, default: 3 },
        completedCount: { type: Number, default: 12 },
        items: [{
            id: { type: String },
            code: { type: String },
            title: { type: String },
            status: { type: String }, // in_progress, review, completed
            assignee: { type: String }
        }]
    },
    shipReadinessPercent: { type: Number, default: 94 },
    debugRooms: [{
        id: { type: String },
        title: { type: String },
        participants: [{ type: String }],
        status: { type: String, default: 'LIVE' }
    }],
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DashboardState', dashboardStateSchema);
