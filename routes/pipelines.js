const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Pipeline = require('../models/Pipeline');
const PipelineRun = require('../models/PipelineRun');
const Company = require('../models/Company');
const { addAuditLog } = require('../utils/auditLogService');

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
        const pipelines = await Pipeline.find({ company: req.params.companyId }).sort({ updatedAt: -1 });
        res.json({ success: true, pipelines });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const { companyId, name, repo, stages, enabled } = req.body;
        if (!name || !stages || stages.length === 0) {
            return res.status(400).json({ success: false, message: 'Name and at least one stage are required' });
        }
        const pipeline = await Pipeline.create({
            company: companyId,
            createdBy: req.userId,
            name,
            repo: repo || { owner: '', repo: '', branch: 'main' },
            stages: stages.map(s => ({ name: s.name, command: s.command, icon: s.icon || '' })),
            enabled: enabled !== false
        });
        addAuditLog({
            companyId,
            actorId: req.userId,
            event: 'pipeline.created',
            category: 'system',
            target: pipeline.name,
            details: { pipelineId: pipeline._id.toString(), stages: stages.length },
            req
        });
        res.json({ success: true, pipeline });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, repo, stages, enabled } = req.body;
        const pipeline = await Pipeline.findById(req.params.id);
        if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });
        const company = await Company.findById(pipeline.company);
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) return res.status(403).json({ success: false, message: 'Permission denied' });

        if (name) pipeline.name = name;
        if (repo) pipeline.repo = repo;
        if (Array.isArray(stages)) pipeline.stages = stages.map(s => ({ name: s.name, command: s.command, icon: s.icon || '' }));
        if (enabled !== undefined) pipeline.enabled = enabled;
        await pipeline.save();

        addAuditLog({
            companyId: pipeline.company.toString(),
            actorId: req.userId,
            event: 'pipeline.updated',
            category: 'system',
            target: pipeline.name,
            details: { pipelineId: pipeline._id.toString() },
            req
        });
        res.json({ success: true, pipeline });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const pipeline = await Pipeline.findById(req.params.id);
        if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });
        const company = await Company.findById(pipeline.company);
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) return res.status(403).json({ success: false, message: 'Permission denied' });

        await PipelineRun.deleteMany({ pipeline: pipeline._id });
        await Pipeline.findByIdAndDelete(req.params.id);

        addAuditLog({
            companyId: pipeline.company.toString(),
            actorId: req.userId,
            event: 'pipeline.deleted',
            category: 'system',
            target: pipeline.name,
            details: { pipelineId: req.params.id },
            req
        });
        res.json({ success: true, message: 'Pipeline deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/:id/run', authenticateToken, async (req, res) => {
    try {
        const pipeline = await Pipeline.findById(req.params.id);
        if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });
        const company = await Company.findById(pipeline.company);
        const isOwner = company.owner.toString() === req.userId;
        const isMember = company.members.some(m => m.user.toString() === req.userId);
        if (!isOwner && !isMember) return res.status(403).json({ success: false, message: 'Permission denied' });

        const startedAt = Date.now();
        const run = await PipelineRun.create({
            pipeline: pipeline._id,
            company: pipeline.company,
            triggeredBy: req.userId,
            status: 'running',
            stageResults: pipeline.stages.map(s => ({ name: s.name, status: 'running', output: '' })),
        });

        // Best-effort stage simulation: mark stages complete sequentially.
        setImmediate(async () => {
            try {
                const results = [];
                for (const stage of pipeline.stages) {
                    await new Promise(r => setTimeout(r, 350 + Math.floor(Math.random() * 700)));
                    const ok = !stage.command.includes('fail') && !stage.command.trim().startsWith('exit 1');
                    results.push({ name: stage.name, status: ok ? 'success' : 'failed', output: ok ? `✓ ${stage.command}` : `✕ ${stage.command}` });
                    if (!ok) break;
                }
                const allOk = results.every(r => r.status === 'success');
                run.stageResults = results;
                run.status = allOk ? 'success' : 'failed';
                run.durationMs = Date.now() - startedAt;
                run.error = allOk ? '' : `${results.filter(r => r.status === 'failed').length} stage(s) failed`;
                await run.save();

                pipeline.lastRun = new Date();
                pipeline.lastStatus = run.status;
                await pipeline.save();

                addAuditLog({
                    companyId: pipeline.company.toString(),
                    actorId: req.userId,
                    event: allOk ? 'pipeline.run_success' : 'pipeline.run_failed',
                    category: 'system',
                    target: pipeline.name,
                    details: { pipelineId: pipeline._id.toString(), runId: run._id.toString() },
                    req
                });
            } catch (e) {
                run.status = 'failed';
                run.error = e.message;
                await run.save();
            }
        });

        res.json({ success: true, run, message: `Pipeline "${pipeline.name}" started` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id/runs', authenticateToken, async (req, res) => {
    try {
        const pipeline = await Pipeline.findById(req.params.id);
        if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });
        const runs = await PipelineRun.find({ pipeline: pipeline._id })
            .sort({ createdAt: -1 })
            .limit(Math.min(parseInt(req.query.limit) || 25, 100))
            .populate('triggeredBy', 'fullName email profilePicture');
        res.json({ success: true, runs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/company/:companyId/runs', authenticateToken, ensureCompanyMember, async (req, res) => {
    try {
        const runs = await PipelineRun.find({ company: req.params.companyId })
            .sort({ createdAt: -1 })
            .limit(Math.min(parseInt(req.query.limit) || 25, 100))
            .populate('triggeredBy', 'fullName email profilePicture')
            .populate('pipeline', 'name');
        res.json({ success: true, runs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

function yamlFor(pipeline) {
    const lines = [
        `# buildrs.yml — generated by BuildrsHQ CI/CD builder`,
        `name: ${pipeline.name}`,
        `on:`,
        `  push:`,
        `    branches: [${pipeline.repo?.branch || 'main'}]`,
        `  manual: {}`,
        ``,
        `jobs:`,
        `  build:`,
        `    runs-on: ubuntu-latest`,
        `    steps:`,
    ];
    (pipeline.stages || []).forEach((s, i) => {
        lines.push(`      - name: ${s.name}`);
        lines.push(`        run: ${s.command}`);
    });
    return lines.join('\n');
}

router.get('/:id/yaml', authenticateToken, async (req, res) => {
    try {
        const pipeline = await Pipeline.findById(req.params.id);
        if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });
        res.setHeader('Content-Type', 'text/yaml');
        res.send(yamlFor(pipeline));
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;