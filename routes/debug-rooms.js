const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { sendInternalError } = require('../utils/httpErrors');
const PersistentDebugRoom = require('../models/PersistentDebugRoom');
const Company = require('../models/Company');
const User = require('../models/User');
const CodeFile = require('../models/CodeFile');

const MAX_CHAT_MESSAGES = 200;
const MAX_ACTIVITY_ENTRIES = 100;
const MAX_INVITES = 100;
const MAX_PARTICIPANTS = 50;
const ROOM_NAME_RE = /^[a-z0-9-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESS_ROLES = new Set(['viewer', 'collaborator']);

function cleanName(value) {
    return String(value || '').trim().replace(/^#+/, '').toLowerCase();
}

function cleanText(value, max) {
    if (value == null) return '';
    return String(value).trim().slice(0, max);
}

function cleanLine(value, fallback = 0) {
    const line = Number(value);
    if (!Number.isFinite(line) || line < 0) return fallback;
    return Math.min(Math.round(line), 1000000);
}

function parseEmails(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/);
    const seen = new Set();
    const emails = [];
    for (const entry of raw) {
        const email = String(entry || '').trim().toLowerCase();
        if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
        seen.add(email);
        emails.push(email);
        if (emails.length >= MAX_INVITES) break;
    }
    return emails;
}

function safeHref(value) {
    const href = cleanText(value, 500);
    if (!href) return '';
    if (href.startsWith('/')) return href;
    if (/^https?:\/\//i.test(href)) return href;
    return '';
}

function linkFrom(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        title: cleanText(source.title || source.label || source.name, 300),
        status: cleanText(source.status, 80),
        href: safeHref(source.href || source.url),
    };
}

async function loadViewer(userId) {
    let user = null;
    try {
        user = await User.findById(userId).select('fullName name email').lean();
    } catch (_) {
        user = null;
    }
    const email = String(user?.email || '').trim().toLowerCase();
    return {
        id: String(userId),
        name: cleanText(user?.fullName || user?.name || email || 'Teammate', 120) || 'Teammate',
        email,
    };
}

async function loadCompanyIds(userId) {
    try {
        const companies = await Company.find({
            $or: [{ owner: userId }, { 'members.user': userId }],
        }).select('_id').lean();
        return companies.map((company) => String(company._id));
    } catch (_) {
        return [];
    }
}

function accessFor(room, viewer, companyIds) {
    if (!room || !viewer) {
        return { role: null, canView: false, canEdit: false, canInvite: false, isHost: false, isCompanyMember: false, invited: false, joined: false };
    }
    const hostId = String(room.host || room.createdBy || '');
    const participant = (room.participants || []).find((entry) => String(entry.userId) === viewer.id);
    const invite = (room.invites || []).find((entry) => (
        String(entry.email || '').toLowerCase() === viewer.email
        && entry.status !== 'revoked'
    ));
    const isHost = hostId === viewer.id;
    const isCompanyMember = Boolean(room.companyId && companyIds.includes(String(room.companyId)));

    let role = null;
    if (isHost) role = 'host';
    else if (participant) role = participant.role === 'host' ? 'host' : participant.role;
    else if (invite) role = invite.role;
    else if (isCompanyMember) role = 'viewer';

    const canEdit = role === 'host' || role === 'collaborator';
    return {
        role,
        canView: Boolean(role),
        canEdit,
        canInvite: canEdit,
        isHost,
        isCompanyMember,
        invited: Boolean(invite),
        joined: Boolean(participant),
    };
}

function serializeParticipant(participant) {
    return {
        id: String(participant.userId || ''),
        name: participant.name || 'Teammate',
        role: participant.role || 'viewer',
        activeLine: participant.activeLine || 0,
        joinedAt: participant.joinedAt,
        lastSeenAt: participant.lastSeenAt,
        isHost: participant.role === 'host',
    };
}

function serializeRoom(room, viewer, companyIds) {
    const access = accessFor(room, viewer, companyIds);
    const updatedAt = new Date(room.lastActiveAt || room.updatedAt || room.createdAt || Date.now()).getTime();
    const activeMinutes = Math.max(1, Math.floor((Date.now() - updatedAt) / 60000));
    const investigation = room.investigation || {};
    const context = room.context || {};

    return {
        id: String(room._id),
        roomId: room.roomId,
        name: room.name,
        displayName: `#${room.roomId}`,
        description: room.description || '',
        repository: room.repository || '',
        branch: room.branch || '',
        openFile: room.openFile || '',
        activeLine: room.activeLine || 0,
        status: room.status || 'active',
        activeMinutes,
        participants: (room.participants || []).map(serializeParticipant),
        invites: access.canInvite
            ? (room.invites || []).map((invite) => ({
                id: String(invite._id),
                email: invite.email,
                role: invite.role,
                status: invite.status,
                invitedAt: invite.invitedAt,
            }))
            : [],
        investigation: {
            problem: investigation.problem || '',
            reproduction: investigation.reproduction || '',
            workingTheory: investigation.workingTheory || '',
            nextStep: investigation.nextStep || '',
        },
        context: {
            task: linkFrom(context.task),
            pullRequest: linkFrom(context.pullRequest),
            branch: linkFrom(context.branch),
            specification: linkFrom(context.specification),
        },
        chat: (room.chat || []).map((message) => ({
            id: String(message._id),
            name: message.name || 'Teammate',
            role: message.role || 'viewer',
            message: message.message,
            createdAt: message.createdAt,
            isMine: String(message.userId || '') === viewer.id,
        })),
        activity: [...(room.activity || [])]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, MAX_ACTIVITY_ENTRIES)
            .map((entry) => ({
                id: String(entry._id),
                actorName: entry.actorName || 'Teammate',
                action: entry.action,
                target: entry.target || '',
                createdAt: entry.createdAt,
            })),
        access,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
    };
}

async function findRoom(idOrSlug) {
    const raw = String(idOrSlug || '').trim();
    if (!raw) return null;
    if (mongoose.isValidObjectId(raw)) {
        const byId = await PersistentDebugRoom.findById(raw);
        if (byId) return byId;
    }
    return PersistentDebugRoom.findOne({ roomId: cleanName(raw) });
}

function appendActivity(room, viewer, action, target = '') {
    room.activity.push({
        actorId: viewer.id,
        actorName: viewer.name,
        action,
        target: cleanText(target, 300),
        createdAt: new Date(),
    });
    if (room.activity.length > MAX_ACTIVITY_ENTRIES) {
        room.activity = room.activity.slice(-MAX_ACTIVITY_ENTRIES);
    }
    room.lastActiveAt = new Date();
}

async function generateRoomId(name) {
    const base = cleanName(name);
    for (let suffix = 1; suffix <= 50; suffix += 1) {
        const candidate = suffix === 1 ? base : `${base}-${suffix}`;
        // eslint-disable-next-line no-await-in-loop
        const exists = await PersistentDebugRoom.exists({ roomId: candidate });
        if (!exists) return candidate;
    }
    return `${base}-${Date.now().toString(36).slice(-4)}`;
}

async function loadRoomContext(req) {
    const viewer = await loadViewer(req.userId);
    const companyIds = await loadCompanyIds(req.userId);
    return { viewer, companyIds };
}

/**
 * @swagger
 * /api/debug-rooms:
 *   get:
 *     summary: List debug rooms the signed-in user can access
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { viewer, companyIds } = await loadRoomContext(req);
        const filters = [
            { host: req.userId },
            { createdBy: req.userId },
            { 'participants.userId': req.userId },
        ];
        if (viewer.email) filters.push({ 'invites.email': viewer.email });
        if (companyIds.length > 0) filters.push({ companyId: { $in: companyIds } });

        const rooms = await PersistentDebugRoom.find({ $or: filters })
            .sort({ lastActiveAt: -1 })
            .limit(50);

        res.json({
            success: true,
            rooms: rooms
                .map((room) => serializeRoom(room, viewer, companyIds))
                .filter((room) => room.access.canView),
        });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not load debug rooms.' });
    }
});

/**
 * @swagger
 * /api/debug-rooms:
 *   post:
 *     summary: Create a debug room
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const name = cleanName(req.body?.name);
        const description = cleanText(req.body?.description, 2000);
        const branch = cleanText(req.body?.branch, 200);

        if (!name || !ROOM_NAME_RE.test(name)) {
            return res.status(400).json({
                success: false,
                message: 'Room name must use lowercase letters, numbers, and hyphens only.',
            });
        }
        if (name.length > 60) {
            return res.status(400).json({ success: false, message: 'Room name is too long.' });
        }
        if (!description) {
            return res.status(400).json({ success: false, message: 'Describe what you are debugging.' });
        }
        if (!branch) {
            return res.status(400).json({ success: false, message: 'Branch is required.' });
        }

        const { viewer, companyIds } = await loadRoomContext(req);
        let companyId = null;
        if (req.body?.companyId) {
            const requested = String(req.body.companyId);
            if (!companyIds.includes(requested)) {
                return res.status(403).json({ success: false, message: 'You do not have access to that workspace.' });
            }
            companyId = requested;
        } else if (companyIds.length > 0) {
            companyId = companyIds[0];
        }

        const roomId = await generateRoomId(name);
        const requestedRole = String(req.body?.participantAccess || req.body?.accessRole || req.body?.role || 'viewer').toLowerCase();
        const inviteRole = ACCESS_ROLES.has(requestedRole) ? requestedRole : 'viewer';
        const activeLine = cleanLine(req.body?.activeLine);
        const emails = parseEmails(req.body?.emails || req.body?.inviteEmails);
        const investigationSource = req.body?.investigation && typeof req.body.investigation === 'object'
            ? req.body.investigation
            : {};
        const contextSource = req.body?.context && typeof req.body.context === 'object'
            ? req.body.context
            : {};

        const room = new PersistentDebugRoom({
            roomId,
            name,
            description,
            repository: cleanText(req.body?.repository, 200),
            branch,
            openFile: cleanText(req.body?.openFile || req.body?.file, 500),
            activeLine,
            companyId,
            host: req.userId,
            createdBy: req.userId,
            participants: [{
                userId: req.userId,
                name: viewer.name,
                email: viewer.email || null,
                role: 'host',
                activeLine,
                joinedAt: new Date(),
                lastSeenAt: new Date(),
            }],
            invites: emails.map((email) => ({
                email,
                role: inviteRole,
                status: 'pending',
                invitedBy: req.userId,
                invitedAt: new Date(),
            })),
            investigation: {
                problem: cleanText(investigationSource.problem, 4000),
                reproduction: cleanText(investigationSource.reproduction, 4000),
                workingTheory: cleanText(investigationSource.workingTheory, 4000),
                nextStep: cleanText(investigationSource.nextStep, 4000),
            },
            context: {
                task: linkFrom(contextSource.task),
                pullRequest: linkFrom(contextSource.pullRequest),
                branch: linkFrom(contextSource.branch || { title: branch, status: 'Active' }),
                specification: linkFrom(contextSource.specification),
            },
        });

        appendActivity(room, viewer, 'Created debug room', `#${roomId}`);
        await room.save();

        res.status(201).json({
            success: true,
            room: serializeRoom(room, viewer, companyIds),
        });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not create the debug room.' });
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}:
 *   get:
 *     summary: Get one debug room
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const room = await findRoom(req.params.id);
        if (!room) return res.status(404).json({ success: false, message: 'Debug room not found.' });

        const { viewer, companyIds } = await loadRoomContext(req);
        if (!accessFor(room, viewer, companyIds).canView) {
            return res.status(403).json({ success: false, message: 'You do not have access to this debug room.' });
        }

        res.json({ success: true, room: serializeRoom(room, viewer, companyIds) });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not load the debug room.' });
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}:
 *   patch:
 *     summary: Update shared context or the investigation
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const room = await findRoom(req.params.id);
        if (!room) return res.status(404).json({ success: false, message: 'Debug room not found.' });

        const { viewer, companyIds } = await loadRoomContext(req);
        const access = accessFor(room, viewer, companyIds);
        if (!access.canView) {
            return res.status(403).json({ success: false, message: 'You do not have access to this debug room.' });
        }
        if (!access.canEdit) {
            return res.status(403).json({ success: false, message: 'Collaborator access is required to edit this room.' });
        }

        let changed = false;
        const body = req.body || {};

        if (body.description != null) {
            room.description = cleanText(body.description, 2000);
            changed = true;
        }
        if (body.repository != null) {
            room.repository = cleanText(body.repository, 200);
            changed = true;
        }
        if (body.branch != null && cleanText(body.branch, 200)) {
            room.branch = cleanText(body.branch, 200);
            changed = true;
        }
        if (body.openFile != null) {
            room.openFile = cleanText(body.openFile, 500);
            changed = true;
        }
        if (body.activeLine != null) {
            room.activeLine = cleanLine(body.activeLine, room.activeLine);
            const host = room.participants.find((entry) => String(entry.userId) === viewer.id);
            if (host) host.activeLine = room.activeLine;
            changed = true;
        }
        if (body.status === 'ended' || body.status === 'active') {
            room.status = body.status;
            changed = true;
        }

        if (body.investigation && typeof body.investigation === 'object') {
            for (const key of ['problem', 'reproduction', 'workingTheory', 'nextStep']) {
                if (body.investigation[key] != null) {
                    room.investigation[key] = cleanText(body.investigation[key], 4000);
                    changed = true;
                }
            }
        }

        if (body.context && typeof body.context === 'object') {
            for (const key of ['task', 'pullRequest', 'branch', 'specification']) {
                if (body.context[key] != null) {
                    room.context[key] = linkFrom(body.context[key]);
                    changed = true;
                }
            }
        }

        if (!changed) {
            return res.status(400).json({ success: false, message: 'Nothing to update.' });
        }

        const action = body.investigation
            ? 'Updated investigation'
            : body.context
                ? 'Updated linked context'
                : 'Updated shared context';
        appendActivity(room, viewer, action, `#${room.roomId}`);
        await room.save();

        res.json({ success: true, room: serializeRoom(room, viewer, companyIds) });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not update the debug room.' });
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}/join:
 *   post:
 *     summary: Join a debug room as host, collaborator, or viewer
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/join', authenticateToken, async (req, res) => {
    try {
        const room = await findRoom(req.params.id);
        if (!room) return res.status(404).json({ success: false, message: 'Debug room not found.' });

        const { viewer, companyIds } = await loadRoomContext(req);
        const access = accessFor(room, viewer, companyIds);
        if (!access.canView) {
            return res.status(403).json({ success: false, message: 'You do not have access to this debug room.' });
        }

        let role = access.role || 'viewer';
        if (role !== 'host' && !access.canEdit) role = 'viewer';
        if (role === 'viewer' && room.status === 'ended') {
            return res.status(409).json({ success: false, message: 'This debug room has ended.' });
        }

        if (!access.joined && room.participants.length >= MAX_PARTICIPANTS) {
            return res.status(409).json({ success: false, message: 'This debug room is full.' });
        }

        const activeLine = cleanLine(req.body?.activeLine, room.activeLine);
        let participant = room.participants.find((entry) => String(entry.userId) === viewer.id);
        if (!participant) {
            participant = {
                userId: viewer.id,
                name: viewer.name,
                email: viewer.email || null,
                role,
                activeLine,
                joinedAt: new Date(),
                lastSeenAt: new Date(),
            };
            room.participants.push(participant);
            appendActivity(room, viewer, 'Joined debug room', `#${room.roomId}`);
        } else {
            participant.name = viewer.name;
            participant.email = viewer.email || participant.email;
            participant.lastSeenAt = new Date();
            participant.activeLine = activeLine;
            if (role === 'host') participant.role = 'host';
            else if (role === 'collaborator') participant.role = 'collaborator';
            room.lastActiveAt = new Date();
        }

        await room.save();
        res.json({ success: true, room: serializeRoom(room, viewer, companyIds) });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not join the debug room.' });
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}/leave:
 *   post:
 *     summary: Leave a debug room
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/leave', authenticateToken, async (req, res) => {
    try {
        const room = await findRoom(req.params.id);
        if (!room) return res.status(404).json({ success: false, message: 'Debug room not found.' });

        const { viewer, companyIds } = await loadRoomContext(req);
        if (!accessFor(room, viewer, companyIds).canView) {
            return res.status(403).json({ success: false, message: 'You do not have access to this debug room.' });
        }

        const before = room.participants.length;
        room.participants = room.participants.filter((entry) => String(entry.userId) !== viewer.id);
        room.lastActiveAt = new Date();
        if (room.participants.length !== before) {
            appendActivity(room, viewer, 'Left debug room', `#${room.roomId}`);
        }
        await room.save();

        res.json({ success: true, room: serializeRoom(room, viewer, companyIds) });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not leave the debug room.' });
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}/chat:
 *   post:
 *     summary: Post a room chat message
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/chat', authenticateToken, async (req, res) => {
    try {
        const room = await findRoom(req.params.id);
        if (!room) return res.status(404).json({ success: false, message: 'Debug room not found.' });

        const { viewer, companyIds } = await loadRoomContext(req);
        const access = accessFor(room, viewer, companyIds);
        if (!access.canView) {
            return res.status(403).json({ success: false, message: 'You do not have access to this debug room.' });
        }

        const message = cleanText(req.body?.message, 2000);
        if (!message) {
            return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
        }

        room.chat.push({
            userId: viewer.id,
            name: viewer.name,
            role: access.role || 'viewer',
            message,
            createdAt: new Date(),
        });
        if (room.chat.length > MAX_CHAT_MESSAGES) {
            room.chat = room.chat.slice(-MAX_CHAT_MESSAGES);
        }
        room.lastActiveAt = new Date();
        await room.save();

        res.json({ success: true, room: serializeRoom(room, viewer, companyIds) });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not send the message.' });
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}/invite:
 *   post:
 *     summary: Invite teammates to a debug room
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/invite', authenticateToken, async (req, res) => {
    try {
        const room = await findRoom(req.params.id);
        if (!room) return res.status(404).json({ success: false, message: 'Debug room not found.' });

        const { viewer, companyIds } = await loadRoomContext(req);
        const access = accessFor(room, viewer, companyIds);
        if (!access.canView) {
            return res.status(403).json({ success: false, message: 'You do not have access to this debug room.' });
        }
        if (!access.canInvite) {
            return res.status(403).json({ success: false, message: 'Collaborator access is required to invite members.' });
        }

        const emails = parseEmails(req.body?.emails || req.body?.email);
        if (emails.length === 0) {
            return res.status(400).json({ success: false, message: 'Enter at least one valid email address.' });
        }
        const requestedRole = String(req.body?.role || req.body?.participantAccess || 'viewer').toLowerCase();
        const role = ACCESS_ROLES.has(requestedRole) ? requestedRole : 'viewer';

        const added = [];
        for (const email of emails) {
            const existing = room.invites.find((entry) => entry.email === email);
            if (existing) {
                existing.role = role;
                existing.status = 'pending';
                existing.invitedBy = viewer.id;
                existing.invitedAt = new Date();
                added.push(email);
                continue;
            }
            if (room.invites.length >= MAX_INVITES) break;
            room.invites.push({
                email,
                role,
                status: 'pending',
                invitedBy: viewer.id,
                invitedAt: new Date(),
            });
            added.push(email);
        }

        if (added.length === 0) {
            return res.status(409).json({ success: false, message: 'This room already has the maximum number of invites.' });
        }

        appendActivity(room, viewer, `Invited ${added.length === 1 ? added[0] : `${added.length} teammates`}`, `#${room.roomId}`);
        await room.save();

        res.json({
            success: true,
            invited: added,
            room: serializeRoom(room, viewer, companyIds),
        });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not send the invitations.' });
    }
});

/**
 * @swagger
 * /api/debug-rooms/{id}/code:
 *   get:
 *     summary: Load the shared file snapshot for a debug room
 *     tags:
 *       - Debug Rooms
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/code', authenticateToken, async (req, res) => {
    try {
        const room = await findRoom(req.params.id);
        if (!room) return res.status(404).json({ success: false, message: 'Debug room not found.' });

        const { viewer, companyIds } = await loadRoomContext(req);
        if (!accessFor(room, viewer, companyIds).canView) {
            return res.status(403).json({ success: false, message: 'You do not have access to this debug room.' });
        }

        const openFile = String(room.openFile || '').replace(/^\/+/, '');
        let file = null;
        if (openFile) {
            const name = openFile.split('/').pop();
            const dir = openFile.slice(0, Math.max(0, openFile.length - name.length)).replace(/\/+$/, '');
            const query = { name };
            if (room.companyId) query.company = room.companyId;
            else query.createdBy = room.host;

            let candidates = [];
            try {
                candidates = await CodeFile.find(query).select('name path language content').limit(20).lean();
            } catch (_) {
                candidates = [];
            }

            const match = candidates.find((candidate) => {
                const full = CodeFile.fullPathFor(candidate).replace(/^\/+/, '');
                return full === openFile || (dir && full === `${dir}/${name}`);
            }) || candidates[0];

            if (match) {
                const content = String(match.content || '');
                file = {
                    id: String(match._id),
                    name: match.name,
                    path: CodeFile.fullPathFor(match).replace(/^\/+/, ''),
                    language: match.language || '',
                    content,
                    lineCount: content ? content.split('\n').length : 0,
                };
            }
        }

        res.json({
            success: true,
            code: {
                file,
                activeLine: room.activeLine || 0,
                highlights: (room.participants || [])
                    .filter((entry) => entry.activeLine > 0)
                    .map((entry) => ({
                        line: entry.activeLine,
                        name: entry.name || 'Teammate',
                        role: entry.role || 'viewer',
                    })),
            },
        });
    } catch (error) {
        return sendInternalError(req, res, error, { message: 'Could not load the shared file.' });
    }
});

module.exports = router;
