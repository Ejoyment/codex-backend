// Domain triggers for notifications.
//
// Every function here is fire-and-forget from the caller's perspective: it
// returns a promise that resolves to the service result, and the service itself
// never throws. Callers use `.catch()` defensively so a notification problem
// can never surface as a failed API request.
const NotificationService = require('./notificationService');

const str = (v) => (v == null ? '' : String(v));
const idOf = (v) => (v == null ? null : v._id ? String(v._id) : String(v));
const preview = (text, len = 120) => {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    return flat.length > len ? `${flat.slice(0, len - 1)}…` : flat;
};
const memberIds = (channel) =>
    (channel?.members || [])
        .map((m) => idOf(m.user || m.userId || m))
        .filter(Boolean);
const displayName = (user) =>
    user?.fullName || user?.name || user?.email || 'Someone';

/** Fire a notification without ever letting it reject. */
function fire(promise, context) {
    Promise.resolve(promise).catch((error) => {
        console.error(`[notifications] ${context} failed:`, error?.message || error);
    });
}

// ------------------------------------------------------------------ messaging

/**
 * A channel message notifies the other members; mentioned users get a louder,
 * high-priority entry. Direct messages go only to the recipient.
 */
function notifyNewMessage({ message, channel, recipientId, mentions }) {
    fire(
        (async () => {
            const sender = message.sender;
            const senderId = idOf(message.sender?._id || message.sender);
            const senderName = displayName(sender);
            const body = preview(message.content);
            const mentioned = (mentions || []).map(idOf).filter(Boolean);

            if (recipientId) {
                return NotificationService.notifyUser(idOf(recipientId), {
                    type: 'direct_message',
                    title: `Message from ${senderName}`,
                    message: body || 'Sent you a message',
                    actorId: senderId,
                    actorName: senderName,
                    actorAvatar: sender?.profilePicture || null,
                    company: message.company,
                    channel: message.channel,
                    data: { channelId: str(message.channel), preview: body },
                    link: '/messaging',
                    priority: 'normal',
                });
            }

            const recipients = memberIds(channel);
            if (!recipients.length) return { created: 0, skipped: 0 };

            const base = {
                actorId: senderId,
                actorName: senderName,
                actorAvatar: sender?.profilePicture || null,
                company: message.company,
                channel: message.channel,
                data: {
                    channelId: str(message.channel),
                    channelName: channel?.name || null,
                    messageId: str(message._id),
                    preview: body,
                },
                link: '/messaging',
            };

            // Mentioned members first so they always get the high-priority entry.
            if (mentioned.length) {
                await NotificationService.notify({
                    ...base,
                    userIds: mentioned,
                    type: 'mention',
                    title: `${senderName} mentioned you in #${channel?.name || 'a channel'}`,
                    message: body,
                    priority: 'high',
                    dedupeKey: `mention:${message._id}`,
                });
            }

            const mentionedSet = new Set(mentioned);
            const others = recipients.filter((id) => !mentionedSet.has(id));
            if (!others.length) return { created: 0, skipped: 0 };

            return NotificationService.notify({
                ...base,
                userIds: others,
                type: 'message',
                title: `${senderName} in #${channel?.name || 'a channel'}`,
                message: body,
                priority: 'low',
                dedupeKey: `channel:${channel?._id || message.channel}`,
            });
        })(),
        'notifyNewMessage'
    );
}

function notifyStandupPosted({ standup, channel, author }) {
    fire(
        NotificationService.notify({
            userIds: memberIds(channel),
            type: 'standup_posted',
            title: `${displayName(author)} posted a standup`,
            message: preview(standup?.today || standup?.message || 'Daily standup update'),
            actorId: idOf(author),
            actorName: displayName(author),
            actorAvatar: author?.profilePicture || null,
            company: standup?.company,
            channel: standup?.channel,
            data: {
                channelId: str(standup?.channel),
                channelName: channel?.name || null,
                standupId: str(standup?._id),
            },
            link: '/standup',
            priority: 'low',
            dedupeKey: `standup:${standup?._id}`,
        }),
        'notifyStandupPosted'
    );
}

// ---------------------------------------------------------------------- tasks

function notifyTaskAssigned({ task, assigneeId, assigner }) {
    fire(
        NotificationService.notifyUser(idOf(assigneeId), {
            type: 'task_assigned',
            title: 'Task assigned to you',
            message: `${displayName(assigner)} assigned you "${preview(task?.title, 80)}"`,
            actorId: idOf(assigner),
            actorName: displayName(assigner),
            actorAvatar: assigner?.profilePicture || null,
            company: task?.company,
            project: task?.project,
            task: idOf(task),
            data: { taskId: str(task?._id), title: task?.title, status: task?.status },
            link: '/tasks',
            priority: 'high',
            dedupeKey: `task-assigned:${task?._id}:${idOf(assigneeId)}`,
        }),
        'notifyTaskAssigned'
    );
}

function notifyTaskStatusChanged({ task, status, actor, assigneeId }) {
    const done = status === 'done';
    fire(
        NotificationService.notifyUser(idOf(assigneeId), {
            type: done ? 'task_completed' : 'task_status_changed',
            title: done ? 'Task completed' : 'Task status updated',
            message: done
                ? `${displayName(actor)} completed "${preview(task?.title, 80)}"`
                : `${displayName(actor)} moved "${preview(task?.title, 80)}" to ${status}`,
            actorId: idOf(actor),
            actorName: displayName(actor),
            actorAvatar: actor?.profilePicture || null,
            company: task?.company,
            project: task?.project,
            task: idOf(task),
            data: { taskId: str(task?._id), status, title: task?.title },
            link: '/tasks',
            priority: done ? 'normal' : 'low',
        }),
        'notifyTaskStatusChanged'
    );
}

// ---------------------------------------------------------------------- specs

function notifySpecEvent({ type, spec, actor, ownerId, detail }) {
    const titles = {
        spec_created: 'Spec created',
        spec_updated: 'Spec updated',
        spec_verified: 'Spec verified',
        spec_failed: 'Spec verification failed',
    };
    const failed = type === 'spec_failed';
    fire(
        NotificationService.notifyUser(idOf(ownerId), {
            type,
            title: titles[type] || 'Spec updated',
            message: detail || preview(spec?.title || spec?.name, 100),
            actorId: idOf(actor),
            actorName: actor ? displayName(actor) : null,
            company: spec?.company,
            project: spec?.project,
            data: { specId: str(spec?._id) || str(spec) },
            link: '/specs',
            priority: failed ? 'high' : 'normal',
        }),
        'notifySpecEvent'
    );
}

// --------------------------------------------------------------------- agents

function notifyAgentEvent({ type, execution, userId, detail }) {
    const titles = {
        agent_started: 'Agent run started',
        agent_completed: 'Agent run finished',
        agent_failed: 'Agent run failed',
        agent_needs_input: 'Agent needs your input',
    };
    const loud = type === 'agent_failed' || type === 'agent_needs_input';
    fire(
        NotificationService.notifyUser(idOf(userId), {
            type,
            title: titles[type] || 'Agent update',
            message: detail || preview(execution?.task || execution?.prompt, 120),
            company: execution?.company,
            project: execution?.project,
            data: { executionId: str(execution?._id) || str(execution), status: type },
            link: '/ai-pair',
            priority: loud ? 'high' : type === 'agent_completed' ? 'normal' : 'low',
        }),
        'notifyAgentEvent'
    );
}

// ------------------------------------------------------------------- meetings

function notifyMeetingEvent({ type, meeting, userIds, actor, detail }) {
    const titles = {
        meeting_scheduled: 'Meeting scheduled',
        meeting_started: 'Meeting started',
        meeting_ended: 'Meeting ended',
    };
    fire(
        NotificationService.notify({
            userIds: (userIds || []).map(idOf).filter(Boolean),
            type,
            title: titles[type] || 'Meeting update',
            message: detail || preview(meeting?.title, 120),
            actorId: idOf(actor),
            actorName: actor ? displayName(actor) : null,
            company: meeting?.company,
            data: { meetingId: str(meeting?._id) || str(meeting) },
            link: meeting?.roomId ? `/meeting-room?id=${meeting.roomId}` : '/meetings',
            priority: type === 'meeting_started' ? 'high' : 'normal',
        }),
        'notifyMeetingEvent'
    );
}

// ----------------------------------------------------------------- deployments

function notifyDeploymentEvent({ type, deployment, userId, detail }) {
    const titles = {
        deployment_started: 'Deployment started',
        deployment_succeeded: 'Deployment succeeded',
        deployment_failed: 'Deployment failed',
    };
    const failed = type === 'deployment_failed';
    fire(
        NotificationService.notifyUser(idOf(userId), {
            type,
            title: titles[type] || 'Deployment update',
            message: detail || preview(detail || deployment?.environment, 120),
            company: deployment?.company,
            data: { deploymentId: str(deployment?._id) || str(deployment) },
            link: '/ci-cd',
            priority: failed ? 'high' : 'normal',
        }),
        'notifyDeploymentEvent'
    );
}

// -------------------------------------------------------------------- billing

function notifyPaymentEvent({ type, userId, detail, data }) {
    const ok = type === 'payment_succeeded';
    fire(
        NotificationService.notifyUser(idOf(userId), {
            type,
            title: ok ? 'Payment successful' : 'Payment failed',
            message: detail,
            data: data || {},
            link: '/settings',
            priority: ok ? 'normal' : 'high',
        }),
        'notifyPaymentEvent'
    );
}

function notifySubscriptionAlert({ type, userId, detail, data }) {
    fire(
        NotificationService.notifyUser(idOf(userId), {
            type,
            title:
                type === 'trial_expiring' ? 'Your trial is ending soon' : 'Subscription expiring',
            message: detail,
            data: data || {},
            link: '/settings',
            priority: 'high',
        }),
        'notifySubscriptionAlert'
    );
}

// ------------------------------------------------------------------ workspace

function notifyMemberEvent({ type, company, userIds, actor, memberName }) {
    const titles = {
        member_joined: 'New team member',
        member_left: 'Team member left',
        member_role_changed: 'Team role updated',
    };
    fire(
        NotificationService.notify({
            userIds: (userIds || []).map(idOf).filter(Boolean),
            type,
            title: titles[type] || 'Team update',
            message: memberName
                ? `${memberName}${type === 'member_joined' ? ' joined' : type === 'member_left' ? ' left' : ' changed role'} ${company?.name || 'your workspace'}`
                : `Update in ${company?.name || 'your workspace'}`,
            actorId: idOf(actor),
            actorName: actor ? displayName(actor) : null,
            company: idOf(company),
            link: '/teams',
            priority: 'normal',
        }),
        'notifyMemberEvent'
    );
}

function notifyProjectCreated({ project, userIds, actor }) {
    fire(
        NotificationService.notify({
            userIds: (userIds || []).map(idOf).filter(Boolean),
            type: 'project_created',
            title: 'Project created',
            message: `${displayName(actor)} created "${preview(project?.name, 80)}"`,
            actorId: idOf(actor),
            actorName: displayName(actor),
            actorAvatar: actor?.profilePicture || null,
            company: project?.company,
            project: idOf(project),
            link: '/dashboard',
            priority: 'low',
        }),
        'notifyProjectCreated'
    );
}

function notifyChannelCreated({ channel, userIds, actor }) {
    fire(
        NotificationService.notify({
            userIds: (userIds || []).map(idOf).filter(Boolean),
            type: 'channel_created',
            title: 'New channel',
            message: `${displayName(actor)} created #${channel?.name || 'channel'}`,
            actorId: idOf(actor),
            actorName: displayName(actor),
            company: channel?.company,
            channel: idOf(channel),
            link: '/messaging',
            priority: 'low',
        }),
        'notifyChannelCreated'
    );
}

module.exports = {
    notifyNewMessage,
    notifyStandupPosted,
    notifyTaskAssigned,
    notifyTaskStatusChanged,
    notifySpecEvent,
    notifyAgentEvent,
    notifyMeetingEvent,
    notifyDeploymentEvent,
    notifyPaymentEvent,
    notifySubscriptionAlert,
    notifyMemberEvent,
    notifyProjectCreated,
    notifyChannelCreated,
};
