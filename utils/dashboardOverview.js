const LocalProject = require('../models/LocalProject');
const LocalTask = require('../models/LocalTask');
const AgentExecution = require('../models/AgentExecution');
const Deployment = require('../models/Deployment');
const CollaborationSession = require('../models/CollaborationSession');
const CodeChange = require('../models/CodeChange');
const AuditLog = require('../models/AuditLog');
const TeamActivity = require('../models/TeamActivity');
const Company = require('../models/Company');
const McpServer = require('../models/McpServer');
const Integration = require('../models/Integration');

const OPEN_TASK_STATUSES = ['pending', 'in-progress', 'in_progress', 'in_review', 'backlog', 'blocked'];
const DONE_TASK_STATUSES = ['completed', 'done'];
const RUNNING_AGENT_STATUSES = ['queued', 'running', 'awaiting_review', 'awaiting_approval'];

function initialsOf(name) {
    if (!name) return '··';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '··';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortId(id) {
    return String(id || '').slice(-6).toUpperCase();
}

function relativeTime(date) {
    if (!date) return '';
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
}

function progressForStatus(status) {
    switch (status) {
        case 'queued': return 8;
        case 'running': return 60;
        case 'awaiting_review':
        case 'awaiting_approval': return 90;
        case 'completed': return 100;
        default: return 25;
    }
}

function stepTextForExecution(exec) {
    const map = {
        queued: 'Queued • waiting for an available runner',
        running: 'Implementing changes • running checks',
        awaiting_review: 'Ready for review • changes proposed',
        awaiting_approval: 'Awaiting your approval to apply changes',
        completed: 'Completed • changes applied',
        failed: 'Failed • needs attention',
    };
    return map[exec.status] || exec.status;
}

async function getCompanyIds(userId) {
    const companies = await Company.find({
        $or: [{ owner: userId }, { 'members.userId': userId }],
    }).select('_id name').lean();
    return companies;
}

async function computeOverview(userId) {
    const companyDocs = await getCompanyIds(userId);
    const companyIds = companyDocs.map((c) => c._id);

    const [projects, tasks, executions, deployments, sessions, changes, integrations] = await Promise.all([
        LocalProject.find({ userId, isArchived: false }).sort({ updatedAt: -1 }).limit(20).lean(),
        LocalTask.find({ userId }).sort({ updatedAt: -1 }).limit(100).lean(),
        AgentExecution.find({ userId }).sort({ updatedAt: -1 }).limit(25).lean(),
        Deployment.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
        CollaborationSession.find({
            status: 'active',
            $or: [{ createdBy: userId }, ...(companyIds.length ? [{ companyId: { $in: companyIds } }] : [])],
        }).sort({ updatedAt: -1 }).limit(10).lean(),
        CodeChange.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
        Integration.find({ userId, isActive: true }).lean(),
    ]);

    const [teamActivities, auditLogs, mcpServers] = await Promise.all([
        companyIds.length ? TeamActivity.find({ company: { $in: companyIds } }).sort({ createdAt: -1 }).limit(10).lean() : [],
        companyIds.length ? AuditLog.find({ company: { $in: companyIds } }).sort({ createdAt: -1 }).limit(10).lean() : [],
        companyIds.length ? McpServer.find({ company: { $in: companyIds } }).lean() : [],
    ]);

    const primaryProject = projects[0] || null;
    const activeExecutions = executions.filter((e) => RUNNING_AGENT_STATUSES.includes(e.status));
    const runningAgent = activeExecutions[0] || null;

    const openTasks = tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status)).length;
    const inProgressTasks = tasks.filter((t) => ['in_progress', 'in-progress', 'running'].includes(t.status));
    const inReviewTasks = tasks.filter((t) => ['in_review', 'blocked'].includes(t.status));
    const completedTasks = tasks.filter((t) => DONE_TASK_STATUSES.includes(t.status));

    const workspace = {
        name: primaryProject?.name || companyDocs[0]?.name || 'Personal workspace',
        status: 'Healthy',
        branch: runningAgent?.branch || 'main',
        fullName: primaryProject ? `workspace/${primaryProject.name}` : (companyDocs[0]?.name || 'workspace'),
        updatedAt: primaryProject?.updatedAt || null,
        openTasks,
        agentsRunning: activeExecutions.length,
        validationPercent: runningAgent?.validationResult?.score
            ?? (runningAgent?.validationResult?.percent)
            ?? null,
    };

    // ---- Needs your attention : real blockers ----
    const needsAttention = [];

    for (const exec of activeExecutions.filter((e) => ['awaiting_approval', 'awaiting_review'].includes(e.status)).slice(0, 3)) {
        needsAttention.push({
            id: `agent-${exec._id}`,
            type: 'ai_agent',
            title: exec.taskTitle,
            subtitle: `${exec.branch || 'agent-branch'} • ${(exec.filesChanged?.length || 0)} files changed`,
            badge: exec.status === 'awaiting_approval' ? 'AI AGENT • AWAITING APPROVAL' : 'AI AGENT • IN REVIEW',
            severity: 'info',
            href: '/ai-pair',
        });
    }

    for (const dep of deployments.filter((d) => ['failed', 'pending', 'building'].includes(d.status)).slice(0, 3)) {
        needsAttention.push({
            id: `deploy-${dep._id}`,
            type: 'deployment',
            title: dep.errorMessage || `Deployment ${dep.status}`,
            subtitle: `${dep.subdomain || dep.repoFullName || 'preview'} • ${relativeTime(dep.createdAt)}`,
            badge: dep.status === 'failed' ? 'DEPLOYMENT • FAILED' : 'DEPLOYMENT • IN PROGRESS',
            severity: dep.status === 'failed' ? 'error' : 'warning',
            href: '/ci-cd',
        });
    }

    for (const task of tasks.filter((t) => t.status === 'blocked').slice(0, 3)) {
        needsAttention.push({
            id: `task-${task._id}`,
            type: 'validation',
            title: task.title,
            subtitle: `${(task.labels && task.labels[0]) || 'blocked task'} • ${relativeTime(task.updatedAt)}`,
            badge: 'TASK • BLOCKED',
            severity: 'warning',
            href: '/tasks',
        });
    }

    // ---- Active development : latest running agent ----
    let activeDevelopment = null;
    if (runningAgent) {
        const logs = (runningAgent.logs || []).slice(-6).map((l) => l.message).filter(Boolean);
        activeDevelopment = {
            id: runningAgent._id,
            taskCode: `AG-${shortId(runningAgent._id)}`,
            taskTitle: runningAgent.taskTitle,
            status: String(runningAgent.status || '').toUpperCase(),
            progressPercent: progressForStatus(runningAgent.status),
            stepText: stepTextForExecution(runningAgent),
            branch: runningAgent.branch || '',
            filesChanged: runningAgent.filesChanged?.length || runningAgent.diffSummary?.filesChanged || 0,
            checks: (runningAgent.validationResult?.checks?.length) || 0,
            terminalLog: logs.join('\n'),
        };
    }

    // ---- Sprint : real task breakdown ----
    const sprintItems = [...inProgressTasks, ...inReviewTasks].slice(0, 5).map((t) => ({
        id: t._id,
        code: t.githubIssueNumber ? `#${t.githubIssueNumber}` : shortId(t._id),
        title: t.title,
        status: t.status === 'in_review' || t.status === 'blocked' ? 'review' : 'in_progress',
        assignee: initialsOf(t.assigneeName),
    }));

    const sprint = {
        inProgress: inProgressTasks.length,
        inReview: inReviewTasks.length,
        completed: completedTasks.length,
        items: sprintItems,
    };

    // ---- Ship readiness : derive from deployments + validations ----
    const successfulDeploys = deployments.filter((d) => d.status === 'success').length;
    const totalDeploys = deployments.length;
    const validationExecs = executions.filter((e) => e.validationResult);
    const validationPassed = validationExecs.filter((e) => e.validationResult?.passed !== false).length;

    let shipPercent = null;
    const checks = [];
    if (totalDeploys > 0) {
        checks.push({ label: 'Deployments', value: `${successfulDeploys}/${totalDeploys} successful`, ok: successfulDeploys === totalDeploys });
    }
    if (validationExecs.length > 0) {
        checks.push({ label: 'Validation', value: `${validationPassed}/${validationExecs.length} passed`, ok: validationPassed === validationExecs.length });
    }
    const tasksWithPr = tasks.filter((t) => t.pullRequestId).length;
    if (tasksWithPr > 0) {
        checks.push({ label: 'Pull requests', value: `${tasksWithPr} linked`, ok: true });
    }
    const securityExec = executions.find((e) => e.validationResult?.security);
    if (securityExec) {
        checks.push({ label: 'Security scan', value: securityExec.validationResult.security, ok: securityExec.validationResult.securityPassed !== false });
    }
    if (checks.length > 0) {
        shipPercent = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
    }

    // ---- Debug rooms : active collaboration sessions ----
    const debugRooms = sessions.map((s) => ({
        id: s._id,
        sessionId: s.sessionId,
        title: s.contextRef ? `Debug Room: ${s.contextRef}` : `Debug Room (${s.type})`,
        type: s.type,
        participants: (s.participants || []).map((p) => initialsOf(p.name)),
        participantNames: (s.participants || []).map((p) => p.name).filter(Boolean),
        status: 'LIVE',
    })).filter((r) => r.participants.length > 0);

    // ---- Recent activity : merge code changes, team activity, audit ----
    const activityItems = [];

    for (const c of changes) {
        activityItems.push({
            id: `change-${c._id}`,
            type: 'code',
            title: `${c.operation} ${c.filePath}`,
            subtitle: `Code change • ${c.status}`,
            timestamp: c.createdAt,
        });
    }
    for (const a of teamActivities) {
        activityItems.push({
            id: `team-${a._id}`,
            type: 'team',
            title: a.action,
            subtitle: 'Team activity',
            timestamp: a.createdAt,
        });
    }
    for (const l of auditLogs) {
        activityItems.push({
            id: `audit-${l._id}`,
            type: l.category === 'deployment' ? 'deploy' : l.category === 'git' ? 'git' : 'system',
            title: l.event,
            subtitle: `${l.category} • ${l.target || l.email || ''}`.trim(),
            timestamp: l.createdAt,
        });
    }

    activityItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recentActivity = activityItems.slice(0, 6).map((i) => ({
        ...i,
        relativeTime: relativeTime(i.timestamp),
    }));

    // ---- Workspace connections ----
    const connections = [];
    for (const integ of integrations) {
        connections.push({
            id: `int-${integ._id}`,
            provider: integ.provider,
            title: `${integ.provider} connected`,
            subtitle: integ.providerUsername || integ.providerEmail || 'active',
            status: 'ok',
        });
    }
    const enabledMcp = mcpServers.filter((s) => s.enabled !== false);
    if (mcpServers.length > 0) {
        connections.push({
            id: 'mcp',
            provider: 'mcp',
            title: `${enabledMcp.length} MCP server${enabledMcp.length === 1 ? '' : 's'} online`,
            subtitle: `${mcpServers.length} configured`,
            status: enabledMcp.length === mcpServers.length ? 'ok' : 'warn',
        });
    }
    if (totalDeploys > 0) {
        connections.push({
            id: 'deployments',
            provider: 'deploy',
            title: `${successfulDeploys} live deployment${successfulDeploys === 1 ? '' : 's'}`,
            subtitle: `${totalDeploys} total`,
            status: 'ok',
        });
    }

    // ---- Topbar CI / deploy status ----
    const latestDeploy = deployments[0] || null;
    let ciStatus = null;
    if (validationExecs.length > 0) {
        ciStatus = {
            label: validationPassed === validationExecs.length ? 'Checks Passing' : 'Checks Failing',
            tone: validationPassed === validationExecs.length ? 'ok' : 'error',
        };
    }
    let deployStatus = null;
    if (latestDeploy) {
        const live = latestDeploy.status === 'success';
        deployStatus = {
            label: live ? 'Staging Live' : `Deploy ${latestDeploy.status}`,
            tone: live ? 'ok' : (latestDeploy.status === 'failed' ? 'error' : 'warn'),
        };
    }

    return {
        workspace,
        needsAttention,
        activeDevelopment,
        sprint,
        shipReadiness: { percent: shipPercent, checks },
        debugRooms,
        recentActivity,
        connections,
        ciStatus,
        deployStatus,
        isEmpty:
            projects.length === 0 &&
            tasks.length === 0 &&
            executions.length === 0 &&
            deployments.length === 0 &&
            sessions.length === 0 &&
            changes.length === 0 &&
            integrations.length === 0 &&
            companyDocs.length === 0,
    };
}

module.exports = { computeOverview };
