/**
 * Security regression tests.
 *
 * Each test here corresponds to a vulnerability that was live in this codebase
 * and is now fixed. They exist so the fixes cannot silently regress: if someone
 * reintroduces an unsigned webhook, an unscoped file lookup, or a host-execution
 * fallback, CI goes red.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const ROOT = path.join(__dirname, '..');

function readSource(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('payment webhook signature verification', () => {
    const OLD_ENV = { ...process.env };

    afterEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
    });

    describe('verifyPaystack', () => {
        const {
            verifyPaystack,
        } = require('../utils/webhookSecurity');

        const req = (body, headers = {}) => ({ body, headers, originalUrl: '/x' });

        it('rejects a request with no signature header', () => {
            const res = verifyPaystack(req({ event: 'charge.success' }), {
                secret: 'secret-key',
            });
            expect(res.verified).toBe(false);
            expect(res.reason).toMatch(/x-paystack-signature/);
        });

        it('rejects a forged signature', () => {
            const res = verifyPaystack(
                req({ event: 'charge.success' }, { 'x-paystack-signature': 'deadbeef' }),
                { secret: 'secret-key' }
            );
            expect(res.verified).toBe(false);
        });

        it('accepts a correctly signed raw body', () => {
            const body = { event: 'charge.success', data: { reference: 'x' } };
            const raw = Buffer.from(JSON.stringify(body));
            const sig = crypto
                .createHmac('sha512', 'secret-key')
                .update(raw)
                .digest('hex');
            const res = verifyPaystack(
                { body, headers: { 'x-paystack-signature': sig }, rawBody: raw },
                { secret: 'secret-key' }
            );
            expect(res.verified).toBe(true);
            expect(res.event.event).toBe('charge.success');
        });

        it('fails closed when no secret is configured', () => {
            const res = verifyPaystack(
                req({}, { 'x-paystack-signature': 'anything' }),
                { secret: '' }
            );
            expect(res.verified).toBe(false);
            expect(res.reason).toMatch(/not configured/);
        });

        it('rejects a valid signature computed over different bytes', () => {
            // Guards against re-serializing the parsed body: if the handler
            // hashed JSON.stringify(body) instead of the raw bytes, key order
            // differences would let an attacker smuggle a different payload.
            const raw = Buffer.from('{"event":"charge.success","b":1,"a":2}');
            const sig = crypto
                .createHmac('sha512', 'secret-key')
                .update(raw)
                .digest('hex');
            const res = verifyPaystack(
                {
                    body: { a: 2, b: 1, event: 'charge.success' },
                    headers: { 'x-paystack-signature': sig },
                    rawBody: raw,
                },
                { secret: 'secret-key' }
            );
            expect(res.verified).toBe(true);
        });
    });

    describe('verifyFlutterwave', () => {
        const { verifyFlutterwave } = require('../utils/webhookSecurity');

        it('rejects a wrong signature', () => {
            const res = verifyFlutterwave(
                { body: {}, headers: { 'flw-signature': 'nope' } },
                { secret: 'correct-hash' }
            );
            expect(res.verified).toBe(false);
        });

        it('accepts the configured hash', () => {
            const res = verifyFlutterwave(
                { body: {}, headers: { 'flw-signature': 'correct-hash' } },
                { secret: 'correct-hash' }
            );
            expect(res.verified).toBe(true);
        });

        it('fails closed when the hash is not configured', () => {
            const res = verifyFlutterwave(
                { body: {}, headers: { 'flw-signature': 'x' } },
                { secret: '' }
            );
            expect(res.verified).toBe(false);
        });
    });

    describe('legacy subscription webhook routes', () => {
        it('routes the Stripe webhook through signature verification', () => {
            const src = readSource('routes/subscription.js');
            expect(src).toMatch(/requireVerifiedWebhook\('stripe'/);
            // The previous code carried a comment admitting verification was
            // skipped; it must not come back.
            expect(src).not.toMatch(/In production, verify Stripe signature/);
        });

        it('routes the Paystack webhook through signature verification', () => {
            const src = readSource('routes/subscription.js');
            expect(src).toMatch(/requireVerifiedWebhook\('paystack'/);
        });

        it('does not fall back to trusting req.body on the Paystack webhook', () => {
            const src = readSource('routes/subscription.js');
            const handler = src.slice(src.indexOf("requireVerifiedWebhook('paystack'"));
            // The handler must read the verified event, not the raw body.
            expect(handler.slice(0, 600)).toMatch(/verifiedWebhookEvent/);
        });

        it('routes the paystack-billing webhook through verification', () => {
            const src = readSource('routes/paystack-billing.js');
            expect(src).toMatch(/requireVerifiedWebhook\('paystack'/);
        });
    });

    describe('requireVerifiedWebhook wrapper', () => {
        it('returns 400 and never invokes the handler on bad signature', async () => {
            jest.resetModules();
            const { requireVerifiedWebhook } = require('../utils/webhookSecurity');
            const handler = jest.fn();
            const app = express();
            app.use(express.json());
            app.post('/api/subscription/payment/paystack', requireVerifiedWebhook('paystack', handler));

            const res = await request(app)
                .post('/api/subscription/payment/paystack')
                .send({ event: 'charge.success', data: { customer: { customer_code: 'CUS_victim' } } });

            expect(res.status).toBe(400);
            // The critical assertion: a forged activation event must not reach
            // the business logic at all.
            expect(handler).not.toHaveBeenCalled();
        });

        it('throws for an unknown provider', () => {
            const { requireVerifiedWebhook } = require('../utils/webhookSecurity');
            expect(() => requireVerifiedWebhook('bogus', () => {})).toThrow(/unknown provider/);
        });
    });

    describe('raw body capture', () => {
        it('matches every webhook path, including the legacy subscription routes', () => {
            const { isWebhookPath } = require('../utils/webhookSecurity');
            expect(isWebhookPath('/api/v1/billing/webhook/stripe')).toBe(true);
            expect(isWebhookPath('/api/subscription/payment/stripe')).toBe(true);
            expect(isWebhookPath('/api/subscription/payment/paystack')).toBe(true);
            expect(isWebhookPath('/api/paystack-billing/webhook')).toBe(true);
            expect(isWebhookPath('/api/projects')).toBe(false);
        });
    });
});

describe('security header ordering', () => {
    it('registers enforceSecurityHeaders BEFORE the /api route mounts', () => {
        const src = readSource('server.js');
        const headersAt = src.indexOf('app.use(enforceSecurityHeaders())');
        const routesAt = src.indexOf("app.use('/api/auth'");
        expect(headersAt).toBeGreaterThan(-1);
        expect(routesAt).toBeGreaterThan(-1);
        // Express runs middleware in registration order, so headers registered
        // after the routes never apply to API responses.
        expect(headersAt).toBeLessThan(routesAt);
    });

    it('has exactly one enforceSecurityHeaders registration', () => {
        const src = readSource('server.js');
        expect(src.split('app.use(enforceSecurityHeaders())').length - 1).toBe(1);
    });

    it('sets a CSP, nosniff and X-Frame-Options on API responses', () => {
        const { enforceSecurityHeaders } = require('../utils/securityHeaders');
        const app = express();
        app.use(enforceSecurityHeaders());
        app.get('/api/thing', (req, res) => res.json({ ok: true }));

        return request(app)
            .get('/api/thing')
            .then((res) => {
                expect(res.headers['content-security-policy']).toBeDefined();
                expect(res.headers['content-security-policy']).toContain("default-src 'none'");
                expect(res.headers['x-content-type-options']).toBe('nosniff');
                expect(res.headers['x-frame-options']).toBe('DENY');
                expect(res.headers['strict-transport-security']).toBeDefined();
                expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
            });
    });

    it('allows camera and microphone only on meetings routes', () => {
        const { enforceSecurityHeaders } = require('../utils/securityHeaders');
        const app = express();
        app.use(enforceSecurityHeaders());
        app.get('/api/meetings/room', (req, res) => res.json({}));
        app.get('/api/profile', (req, res) => res.json({}));

        const meeting = request(app).get('/api/meetings/room');
        const profile = request(app).get('/api/profile');

        return Promise.all([meeting, profile]).then(([m, p]) => {
            expect(m.headers['permissions-policy']).toContain('microphone=(self)');
            expect(p.headers['permissions-policy']).toContain('microphone=()');
        });
    });
});

describe('terminal authorization', () => {
    it('checks workspace membership inside createTerminal itself', () => {
        const src = readSource('utils/terminalService.js');
        // Enforced at the service layer so every caller (REST, socket, agent)
        // is covered, not just the route handler.
        expect(src).toMatch(/assertWorkspaceAccess/);
    });

    it('checks permission before creating a terminal on the socket', () => {
        const src = readSource('server.js');
        const idx = src.indexOf("socket.on('terminal:create'");
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 900);
        expect(block).toMatch(/permissionMatrix\.checkPermission/);
        // The permission gate must appear before the terminal is spawned.
        expect(block.indexOf('checkPermission')).toBeLessThan(block.indexOf('createTerminal('));
    });
});

describe('workspace authorization', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    function mockCompany(doc) {
        jest.doMock('../models/Company', () => ({
            findById: jest.fn().mockReturnValue({
                select: () => ({ lean: async () => doc }),
            }),
        }));
    }

    const OWNER_ID = 'user-1';
    const OUTSIDER_ID = 'user-2';
    const WS_ID = '507f1f77bcf86cd799439011';

    it('allows a company member', async () => {
        mockCompany({ _id: WS_ID, owner: OWNER_ID, members: [{ user: OWNER_ID }] });
        const { assertWorkspaceAccess } = require('../utils/workspaceAuth');
        const res = await assertWorkspaceAccess(WS_ID, OWNER_ID);
        expect(res.ok).toBe(true);
    });

    it('denies a non-member', async () => {
        mockCompany({ _id: WS_ID, owner: OWNER_ID, members: [{ user: OWNER_ID }] });
        const { assertWorkspaceAccess } = require('../utils/workspaceAuth');
        const res = await assertWorkspaceAccess(WS_ID, OUTSIDER_ID);
        expect(res.ok).toBe(false);
    });

    it('denies an unknown workspace without revealing that it does not exist', async () => {
        mockCompany(null);
        const { assertWorkspaceAccess } = require('../utils/workspaceAuth');
        const res = await assertWorkspaceAccess(WS_ID, OUTSIDER_ID);
        expect(res.ok).toBe(false);
        // Same message as "not a member" so this is not a tenant enumeration oracle.
        expect(res.reason).toMatch(/not found or access denied/);
    });

    it('allows a personal workspace (the caller\'s own id)', async () => {
        const { assertWorkspaceAccess } = require('../utils/workspaceAuth');
        const res = await assertWorkspaceAccess(OWNER_ID, OWNER_ID);
        expect(res.ok).toBe(true);
        expect(res.personal).toBe(true);
    });

    it('rejects the legacy shared "default" workspace id', async () => {
        mockCompany(null);
        const { assertWorkspaceAccess } = require('../utils/workspaceAuth');
        // 'default' would map many unrelated users onto the same CodeFile.company.
        const res = await assertWorkspaceAccess('default', OWNER_ID);
        expect(res.ok).toBe(false);
    });

    it('requires authentication', async () => {
        const { assertWorkspaceAccess } = require('../utils/workspaceAuth');
        const res = await assertWorkspaceAccess(WS_ID, null);
        expect(res.ok).toBe(false);
    });
});

describe('agent orchestrator tenant isolation', () => {
    const CONTEXT = { userId: 'user-1', workspaceId: 'workspace-a' };

    const STORE = {
        abc123: {
            _id: 'abc123',
            name: 'secret.js',
            content: 'const token = "x"',
            company: 'workspace-b',
            language: 'javascript',
            versions: [],
        },
    };

    /**
     * Load the orchestrator with CodeFile replaced by a fake that honours
     * BOTH the _id and company filters, the way Mongo does. If the production
     * code drops the company filter, the fake returns the foreign row and the
     * test fails.
     */
    async function loadOrchestrator() {
        jest.resetModules();
        jest.doMock('../models/CodeFile', () => ({
            findOne: jest.fn(async (query) => {
                const row = query._id ? STORE[query._id] : null;
                if (!row) return null;
                if (query.company !== undefined && row.company !== query.company) return null;
                return row;
            }),
            findById: jest.fn(async (id) => STORE[id] || null),
            find: jest.fn(async () => []),
            create: jest.fn(async () => ({ _id: 'new' })),
            findByIdAndDelete: jest.fn(async (id) => STORE[id] || null),
        }));
        // A permissive mongoose stub: isValidObjectId drives the guard, and
        // Schema.Types keeps the model modules loadable.
        jest.doMock('mongoose', () => {
            const passthrough = () => ({});
            const schema = function () { return { index: passthrough, pre: passthrough, post: passthrough }; };
            schema.Types = { ObjectId: String, Mixed: String };
            return {
                isValidObjectId: (v) => /^[a-f0-9]{6,}$/i.test(String(v)),
                Schema: schema,
                model: () => ({ schema: () => ({ index: passthrough }) }),
                Types: { ObjectId: String },
            };
        });

        const instance = require('../utils/agentOrchestrator');
        // utils/agentOrchestrator.js exports a singleton instance already.
        expect(typeof instance.initializeTools).toBe('function');
        return instance;
    }

    it('refuses to read a file belonging to another workspace', async () => {
        const orchestrator = await loadOrchestrator();
        const res = await orchestrator.initializeTools().read_file.execute(
            { fileId: 'abc123' },
            CONTEXT
        );
        expect(res.success).toBe(false);
        expect(res.content).toBeUndefined();
        expect(res.error).toMatch(/not found in this workspace/);
    });

    it('refuses to update a file belonging to another workspace', async () => {
        const orchestrator = await loadOrchestrator();
        const res = await orchestrator.initializeTools().update_file.execute(
            { fileId: 'abc123', content: 'overwritten' },
            CONTEXT
        );
        expect(res.success).toBe(false);
    });

    it('refuses to delete a file belonging to another workspace', async () => {
        const orchestrator = await loadOrchestrator();
        const res = await orchestrator.initializeTools().delete_file.execute(
            { fileId: 'abc123' },
            CONTEXT
        );
        expect(res.success).toBe(false);
    });

    it('refuses to analyze a file belonging to another workspace', async () => {
        const orchestrator = await loadOrchestrator();
        const res = await orchestrator.initializeTools().analyze_code.execute(
            { fileId: 'abc123' },
            CONTEXT
        );
        expect(res.success).toBe(false);
        expect(res.analysis).toBeUndefined();
    });

    it('still reads a file inside the caller\'s own workspace', async () => {
        STORE.def456 = {
            _id: 'def456',
            name: 'mine.js',
            content: 'const a = 1',
            company: CONTEXT.workspaceId,
            language: 'javascript',
            versions: [],
        };
        try {
            const orchestrator = await loadOrchestrator();
            const res = await orchestrator.initializeTools().read_file.execute(
                { fileId: 'def456' },
                CONTEXT
            );
            expect(res.success).toBe(true);
            expect(res.content).toBe('const a = 1');
        } finally {
            delete STORE.def456;
        }
    });

    it('rejects a non-ObjectId fileId outright', async () => {
        const orchestrator = await loadOrchestrator();
        const res = await orchestrator.initializeTools().read_file.execute(
            { fileId: '../../etc/passwd' },
            CONTEXT
        );
        expect(res.success).toBe(false);
    });

    it('escapes regex metacharacters in search_code (ReDoS)', () => {
        const src = readSource('utils/agentOrchestrator.js');
        expect(src).toMatch(/replace\(\/\[\.\*\+\?\^/);
        // And the result is length-capped so the pattern cannot be enormous.
        expect(src).toMatch(/slice\(0, 200\)/);
    });

    it('contains no unscoped CodeFile lookups by id', () => {
        const src = readSource('utils/agentOrchestrator.js');
        expect(src).not.toMatch(/CodeFile\.findById\(/);
        expect(src).not.toMatch(/CodeFile\.findByIdAndDelete\(/);
    });
});

describe('SSRF protection for user-supplied URLs', () => {
    const { validateOutboundUrl, isPrivateAddress } = require('../utils/urlSafety');

    it('rejects the cloud metadata endpoint', async () => {
        const res = await validateOutboundUrl('http://169.254.169.254/latest/meta-data/');
        expect(res.ok).toBe(false);
    });

    it('rejects localhost and loopback literals', async () => {
        await expect(validateOutboundUrl('http://127.0.0.1:27017')).resolves.toMatchObject({ ok: false });
        await expect(validateOutboundUrl('http://localhost:27017')).resolves.toMatchObject({ ok: false });
        await expect(validateOutboundUrl('http://[::1]:8080/')).resolves.toMatchObject({ ok: false });
    });

    it('rejects non-HTTP schemes', async () => {
        await expect(validateOutboundUrl('file:///etc/passwd')).resolves.toMatchObject({ ok: false });
        await expect(validateOutboundUrl('gopher://example.com')).resolves.toMatchObject({ ok: false });
    });

    it('rejects internal hostnames', async () => {
        await expect(validateOutboundUrl('http://mongo.internal/')).resolves.toMatchObject({ ok: false });
        await expect(validateOutboundUrl('http://foo.local/')).resolves.toMatchObject({ ok: false });
    });

    it('rejects RFC1918 ranges and CGNAT', () => {
        expect(isPrivateAddress('10.0.0.5')).toBe(true);
        expect(isPrivateAddress('172.16.0.1')).toBe(true);
        expect(isPrivateAddress('192.168.1.1')).toBe(true);
        expect(isPrivateAddress('100.64.0.1')).toBe(true);
        expect(isPrivateAddress('8.8.8.8')).toBe(false);
    });

    it('rejects URLs with embedded credentials', async () => {
        await expect(validateOutboundUrl('http://user:pass@example.com/')).resolves.toMatchObject({ ok: false });
    });

    it('accepts an ordinary public URL', async () => {
        // A public IP literal avoids depending on DNS, which is unavailable in
        // the sandboxed test environment.
        const res = await validateOutboundUrl('https://93.184.216.34/sse');
        expect(res.ok).toBe(true);
    });

    it('rejects a public hostname that resolves to a private address (DNS rebinding)', async () => {
        const dns = require('dns').promises;
        const spy = jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
        try {
            const res = await validateOutboundUrl('http://sneaky.example.com/');
            expect(res.ok).toBe(false);
            expect(res.reason).toMatch(/private or loopback/);
        } finally {
            spy.mockRestore();
        }
    });

    it('rejects a hostname that does not resolve', async () => {
        const dns = require('dns').promises;
        const spy = jest.spyOn(dns, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));
        try {
            const res = await validateOutboundUrl('https://nonexistent.example/');
            expect(res.ok).toBe(false);
        } finally {
            spy.mockRestore();
        }
    });

    it('validates on probe as well as on create', () => {
        const src = readSource('routes/mcp.js');
        const probeIdx = src.indexOf('await fetch(server.serverUrl');
        const before = src.slice(Math.max(0, probeIdx - 1200), probeIdx);
        expect(before).toMatch(/validateOutboundUrl\(server\.serverUrl\)/);
    });
});

describe('upload handling', () => {
    it('company logo upload rejects SVG', () => {
        const src = readSource('routes/company.js');
        const logoBlock = src.slice(src.indexOf("/:companyId/logo"), src.indexOf("/:companyId/logo") + 3000);
        expect(logoBlock).not.toMatch(/svg/);
        expect(logoBlock).toMatch(/ALLOWED_LOGO_EXT/);
    });

    it('uploads are served with nosniff and a CSP that neutralizes active content', () => {
        const src = readSource('server.js');
        const uploads = src.slice(src.indexOf("app.use('/uploads'"), src.indexOf("app.use('/uploads'") + 1200);
        expect(uploads).toMatch(/ACTIVE_CONTENT_EXT/);
        expect(uploads).toMatch(/nosniff/);
    });

    it('serves uploads with dotfiles denied', () => {
        const src = readSource('server.js');
        const uploads = src.slice(src.indexOf("app.use('/uploads'"), src.indexOf("app.use('/uploads'") + 1200);
        expect(uploads).toMatch(/dotfiles: 'deny'/);
    });
});

describe('code execution isolation', () => {
    const OLD_ENV = { ...process.env };
    afterEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
    });

    it('ideRunner does not fall back to host execution in production', () => {
        jest.resetModules();
        process.env.NODE_ENV = 'production';
        process.env.IDE_EXEC_STRATEGY = '';
        process.env.IDE_ALLOW_HOST_EXEC = '';
        delete process.env.DEPLOY_SSH_HOST;
        const runner = require('../utils/ideRunner');
        // Either an isolated backend is configured, or execution is refused.
        expect(['vps', 'docker', 'none']).toContain(runner.pickStrategy());
    });

    it('ideRunner refuses an explicit host override in production', () => {
        jest.resetModules();
        process.env.NODE_ENV = 'production';
        process.env.IDE_EXEC_STRATEGY = 'host';
        const runner = require('../utils/ideRunner');
        expect(runner.pickStrategy()).toBe('none');
    });

    it('sandboxExecutor does not run code on the host in production', async () => {
        jest.resetModules();
        process.env.NODE_ENV = 'production';
        delete process.env.SANDBOX_ALLOW_HOST_EXEC;
        const executor = require('../utils/sandboxExecutor');
        const res = await executor.childProcessExecute('require("fs").writeFileSync("/tmp/pwned","1")', 'javascript');
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/not running|unavailable|host/i);
    });

    it('agent containers do not use host networking', () => {
        const src = readSource('utils/containerWorker.js');
        // Strip comments so the historical explanation does not trip the check.
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|\s)\/\/.*$/gm, '');
        expect(code).not.toMatch(/NetworkMode:\s*'host'/);
        expect(code).toMatch(/NetworkMode:\s*'bridge'/);
        expect(code).toMatch(/CapDrop/);
    });
});

describe('JWT secret requirements', () => {
    it('refuses to listen without a strong secret', () => {
        const src = readSource('server.js');
        expect(src).toMatch(/JWT_SECRET must be set to at least 32 characters/);
        expect(src).not.toMatch(/WARNING: JWT_SECRET must be set/);
    });

    it('does not exit the process when merely imported', () => {
        const src = readSource('server.js');
        // Guarded so test suites can import the app without being killed.
        expect(src).toMatch(/require\.main === module && \(!process\.env\.JWT_SECRET/);
    });
});

describe('AI provider routing', () => {
    const OLD_ENV = { ...process.env };
    afterEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
    });

    // utils/aiService.js exports a singleton instance, so exercise it directly
    // rather than constructing a class.
    async function freshService() {
        process.env.GEMINI_API_KEY = 'g-key';
        process.env.MISTRAL_API_KEY = 'm-key';
        process.env.AI_PROVIDER = 'gemini';
        jest.resetModules();
        return require('../utils/aiService');
    }

    it('honours a per-request provider instead of the process default', async () => {
        const service = await freshService();
        service.chatGemini = async () => ({ picked: 'gemini' });
        service.chatMistral = async () => ({ picked: 'mistral' });

        // Default is gemini, but the caller explicitly asked for mistral.
        const res = await service.chat([], { provider: 'mistral' });
        expect(res.picked).toBe('mistral');
    });

    it('does not mutate the module singleton provider on fallback', async () => {
        const service = await freshService();
        const before = service.provider;

        service.chatGemini = async () => { throw new Error('boom'); };
        service.chatMistral = async () => ({ picked: 'mistral' });

        await service.chat([], { provider: 'gemini' });
        // A transient failure must not re-point every later request.
        expect(service.provider).toBe(before);
    });

    it('terminates instead of cycling when every provider fails', async () => {
        const service = await freshService();
        service.chatGemini = async () => { throw new Error('g'); };
        service.chatMistral = async () => { throw new Error('m'); };

        await expect(service.chat([], { provider: 'gemini' })).rejects.toThrow();
    });
});

describe('stripe adapter', () => {
    it('uses the Stripe client from config, not the module object', () => {
        const src = readSource('utils/stripeAdapter.js');
        // config/stripe.js exports { stripe, ... }; requiring the whole module
        // and calling .checkout on it threw.
        expect(src).toMatch(/const \{ stripe \} = require\('\.\.\/config\/stripe'\)/);
    });

    it('passes customerId, not an undefined `customer` variable', () => {
        const src = readSource('utils/stripeAdapter.js');
        const cancel = src.slice(src.indexOf('async function cancelSubscription'));
        expect(cancel).toMatch(/customer: customerId/);
        expect(cancel).not.toMatch(/\{\s*customer,\s*limit/);
    });
});

describe('deployment quotas', () => {
    it('applies the per-tier deployment limit on create', () => {
        const src = readSource('routes/deployments.js');
        const create = src.slice(src.indexOf("router.post('/'"));
        expect(create.slice(0, 200)).toMatch(/enforceDeploymentLimit\(\)/);
    });
});

describe('identity binding in realtime sessions', () => {
    it('derives the meeting userId from the verified socket, not the client payload', () => {
        const src = readSource('utils/meetingSocket.js');
        const handler = src.slice(src.indexOf("socket.on('join-room'"));
        // The handler must not destructure a client-supplied userId.
        expect(handler.slice(0, 400)).not.toMatch(/\{\s*roomId,\s*userId\s*\}/);
        // It must bind identity from socket.userId (set by the JWT handshake).
        expect(handler).toMatch(/const userId = socket\.userId/);
    });

    it('still verifies the JWT during the meeting socket handshake', () => {
        const src = readSource('utils/meetingSocket.js');
        const handshake = src.slice(src.indexOf('.use((socket, next)'), src.indexOf("'connection'"));
        expect(handshake).toMatch(/jwt\.verify/);
    });
});

describe('token lifetime vs account lifecycle', () => {
    it('rejects a signature-valid token whose account no longer exists', async () => {
        jest.resetModules();
        jest.doMock('jsonwebtoken', () => ({
            verify: jest.fn((t, s, cb) => cb(null, { userId: 'ghost-user' })),
            sign: jest.fn(),
        }));
        jest.doMock('../models/User', () => ({
            exists: jest.fn().mockResolvedValue(null),
        }));

        const { authenticateToken } = require('../middleware/auth');
        const req = { headers: { authorization: 'Bearer token-for-deleted-account' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
        jest.dontMock('../models/User');
        jest.dontMock('jsonwebtoken');
    });

    it('allows a token whose account still exists', async () => {
        jest.resetModules();
        jest.doMock('jsonwebtoken', () => ({
            verify: jest.fn((t, s, cb) => cb(null, { userId: 'live-user' })),
            sign: jest.fn(),
        }));
        jest.doMock('../models/User', () => ({
            exists: jest.fn().mockResolvedValue({ _id: 'live-user' }),
        }));

        const { authenticateToken } = require('../middleware/auth');
        const req = { headers: { authorization: 'Bearer live-token' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await authenticateToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.userId).toBe('live-user');
        jest.dontMock('../models/User');
        jest.dontMock('jsonwebtoken');
    });
});

describe('merge hygiene', () => {
    it('ships no unresolved conflict markers in backend source', () => {
        // Conflict markers were committed into routes/sandbox.js, which broke
        // module loading. Keep the parser check so they cannot land again.
        const roots = ['routes', 'utils', 'models', 'middleware', 'config'];
        const offenders = [];
        for (const root of roots) {
            const dir = path.join(__dirname, '..', root);
            if (!fs.existsSync(dir)) continue;
            for (const entry of fs.readdirSync(dir)) {
                if (!entry.endsWith('.js')) continue;
                const src = fs.readFileSync(path.join(dir, entry), 'utf8');
                // github-advanced.js legitimately embeds a conflict template
                // inside a string literal for its AI merge-resolution prompt.
                if (entry === 'github-advanced.js') continue;
                if (/^<<<<<<< /m.test(src) || /^>>>>>>> /m.test(src)) offenders.push(path.join(root, entry));
            }
        }
        expect(offenders).toEqual([]);
    });
});
