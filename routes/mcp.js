const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const McpServer = require('../models/McpServer');
const Company = require('../models/Company');
const { addAuditLog } = require('../utils/auditLogService');
const { validateOutboundUrl } = require('../utils/urlSafety');

// Sentinel shown to clients in place of secret values. env/headers carry
// Authorization tokens and API keys, which must never round-trip to the
// browser; the edit form re-submits the sentinel for unchanged keys and the
// PUT handler below keeps the stored value in that case.
const REDACTED = '__REDACTED__';

function redactSecrets(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    for (const key of Object.keys(obj)) out[key] = REDACTED;
    return out;
}

function restoreRedacted(submitted, current) {
    if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return submitted;
    const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    const out = {};
    for (const [key, value] of Object.entries(submitted)) {
        out[key] = value === REDACTED && base[key] !== undefined ? base[key] : value;
    }
    return out;
}

// Public shape: everything the UI needs, with secret VALUES stripped (keys
// preserved so the edit form still lists them).
function publicServer(s) {
    return {
        _id: s._id,
        id: s._id,
        company: s.company,
        createdBy: s.createdBy,
        name: s.name,
        transport: s.transport,
        serverUrl: s.serverUrl,
        command: s.command,
        args: s.args,
        env: redactSecrets(s.env),
        headers: redactSecrets(s.headers),
        enabled: s.enabled,
        tools: s.tools,
        lastStatus: s.lastStatus,
        lastProbedAt: s.lastProbedAt,
        lastError: s.lastError,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
    };
}

const ensureCompanyMember = async (req, res, next) => {
    try {
        const companyId = req.params.companyId || req.query.companyId || req.body.companyId;
        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: 'Company not found' });
        }
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) {
            return res.status(403).json({ success: false, message: 'Not a member of this company' });
        }
        req.company = company;
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

router.get('/company/:companyId', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const servers = await McpServer.find({ company: req.params.companyId }).sort({ updatedAt: -1 });
        res.json({
            success: true,
            servers: servers.map(publicServer),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { companyId, name, transport = 'sse', serverUrl, command, args, env, headers, enabled } = req.body;
        if (!name || (!serverUrl && !command)) {
            return res.status(400).json({ success: false, message: 'Name and either a server URL or command are required' });
        }
        // Reject internal/private destinations up front. Without this, any
        // company member could point an MCP server at 169.254.169.254 or
        // localhost:27017 and read the response back out of the probe route.
        if (serverUrl) {
            const urlCheck = await validateOutboundUrl(serverUrl);
            if (!urlCheck.ok) {
                return res.status(400).json({ success: false, message: `Invalid serverUrl: ${urlCheck.reason}` });
            }
        }
        const server = await McpServer.create({
            company: companyId,
            createdBy: req.userId,
            name,
            transport,
            serverUrl: serverUrl || '',
            command: command || '',
            args: Array.isArray(args) ? args : [],
            env: env || {},
            headers: headers || {},
            enabled: enabled !== false,
            lastStatus: 'never'
        });
        addAuditLog({
            companyId,
            actorId: req.userId,
            event: 'mcp.server_added',
            category: 'integration',
            target: server.name,
            details: { serverId: server._id.toString(), transport: server.transport },
            req
        });
        res.json({ success: true, server: publicServer(server) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const server = await McpServer.findById(req.params.id);
        if (!server) return res.status(404).json({ success: false, message: 'MCP server not found' });
        const company = await Company.findById(server.company);
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) return res.status(403).json({ success: false, message: 'Permission denied' });

        const { name, transport, serverUrl, command, args, env, headers, enabled } = req.body;
        if (name) server.name = name;
        if (transport) server.transport = transport;
        if (serverUrl !== undefined) server.serverUrl = serverUrl;
        if (command !== undefined) server.command = command;
        if (Array.isArray(args)) server.args = args;
        // REDACTED values mean "keep the stored secret for this key".
        if (env) server.env = restoreRedacted(env, server.env);
        if (headers) server.headers = restoreRedacted(headers, server.headers);
        if (enabled !== undefined) server.enabled = enabled;
        await server.save();

        addAuditLog({
            companyId: server.company.toString(),
            actorId: req.userId,
            event: 'mcp.server_updated',
            category: 'integration',
            target: server.name,
            details: { serverId: server._id.toString() },
            req
        });
        res.json({ success: true, server: publicServer(server) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const server = await McpServer.findById(req.params.id);
        if (!server) return res.status(404).json({ success: false, message: 'MCP server not found' });
        const company = await Company.findById(server.company);
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) return res.status(403).json({ success: false, message: 'Permission denied' });

        await McpServer.findByIdAndDelete(req.params.id);
        addAuditLog({
            companyId: server.company.toString(),
            actorId: req.userId,
            event: 'mcp.server_removed',
            category: 'integration',
            target: server.name,
            details: { serverId: req.params.id },
            req
        });
        res.json({ success: true, message: 'MCP server removed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/:id/probe', authenticateToken, async (req, res) => {
    try {
        const server = await McpServer.findById(req.params.id);
        if (!server) return res.status(404).json({ success: false, message: 'MCP server not found' });
        const company = await Company.findById(server.company);
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) return res.status(403).json({ success: false, message: 'Permission denied' });

        let connected = false;
        let tools = [];
        let error = '';

        if (server.transport === 'stdio' && server.command) {
            // Best-effort: stdio servers cannot be probed without subprocess permissions.
            error = 'stdio servers are configured for local runners; connectivity is resolved at run time.';
        } else if (server.serverUrl) {
            try {
                // Re-validate on every probe, not just at creation: the stored
                // URL may predate this check, and a hostname's DNS can change
                // to point at an internal address after registration.
                const urlCheck = await validateOutboundUrl(server.serverUrl);
                if (!urlCheck.ok) {
                    throw new Error(`Blocked: ${urlCheck.reason}`);
                }
                const ctrl = new AbortController();
                const timeout = setTimeout(() => ctrl.abort(), 5000);
                const res = await fetch(server.serverUrl, {
                    method: 'GET',
                    signal: ctrl.signal,
                    headers: { Accept: '*/*', ...(server.headers || {}) },
                });
                clearTimeout(timeout);
                connected = res.ok || res.status < 500;
                try {
                    const json = await res.json();
                    if (Array.isArray(json.tools)) tools = json.tools;
                    else if (Array.isArray(json.result?.tools)) tools = json.result.tools;
                    else if (Array.isArray(json.tools)) tools = json.tools;
                } catch {}
            } catch (e) {
                error = e.message;
            }
        }

        server.tools = tools.slice(0, 100).map(t => ({ name: t.name || t.title || '', description: t.description || '' }));
        server.lastStatus = connected ? 'connected' : 'unreachable';
        server.lastProbedAt = new Date();
        server.lastError = error;
        await server.save();

        addAuditLog({
            companyId: server.company.toString(),
            actorId: req.userId,
            event: connected ? 'mcp.server_connected' : 'mcp.server_unreachable',
            category: 'integration',
            target: server.name,
            details: { serverId: server._id.toString(), tools: server.tools.length },
            req
        });
        res.json({ success: connected, connected, tools: server.tools, message: connected ? `Connected — ${server.tools.length} tool(s) discovered` : error || `Could not reach ${server.serverUrl}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;