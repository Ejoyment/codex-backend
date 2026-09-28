const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { enforceSpecEngineLevel } = require('../middleware/tierEnforcement');
const mongoose = require('mongoose');
const SpecModel = require('../models/SpecModel');
const Company = require('../models/Company');
const LocalTask = require('../models/LocalTask');
const sddVerificationService = require('../utils/sddVerificationService');

async function userCanAccessWorkspace(workspaceId, userId) {
  const workspace = await Company.findById(workspaceId).select('owner members');
  return Boolean(workspace && (workspace.owner?.toString() === userId || workspace.members.some((member) => member.user?.toString() === userId)));
}

router.post('/', authenticateToken, enforceSpecEngineLevel('full_sdd'), async (req, res) => {
  try {
    const {
      workspaceId, title, description, content, targetFiles, targetModules, assertions, specId,
      architecturalRules, requirements, forbiddenImports, constraints, verificationCommand, coverageThreshold,
    } = req.body;

    if (!workspaceId || !title) {
      return res.status(400).json({ success: false, message: 'workspaceId and title are required' });
    }
    if (!await userCanAccessWorkspace(workspaceId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Workspace access denied' });
    }

    const existingSpec = specId ? await SpecModel.findOne({
      workspaceId,
      $or: [
        { specId },
        ...(mongoose.Types.ObjectId.isValid(specId) ? [{ _id: specId }] : []),
      ],
    }) : null;

    const { tier } = req.subscription;
    if (tier === 'developer') {
      return res.status(403).json({
        success: false,
        message: 'Full spec editing requires Pro tier or higher. Developer tier: read-only.',
        requiresUpgrade: true,
        currentTier: 'developer',
        currentLevel: 'read_only'
      });
    }

    const spec = await SpecModel.findOneAndUpdate(
      existingSpec ? { _id: existingSpec._id, workspaceId } : { workspaceId, title },
      {
        workspaceId,
        title,
        specId: existingSpec?.specId || `SPEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: description || '',
        content: content || description || title,
        targetFiles: targetFiles || [],
        targetModules: targetModules || [],
        assertions: assertions || [],
        architecturalRules: architecturalRules || [],
        requirements: requirements || [],
        forbiddenImports: forbiddenImports || [],
        constraints: constraints || [],
        verificationCommand: verificationCommand || '',
        coverageThreshold: coverageThreshold ?? null,
        status: 'unvalidated',
        lastValidatedAt: null,
        lastValidationResult: null,
        createdBy: req.userId,
        updatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, spec });
  } catch (error) {
    console.error('Create/update spec error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/workspace/:workspaceId', authenticateToken, async (req, res) => {
  try {
    if (!await userCanAccessWorkspace(req.params.workspaceId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Workspace access denied' });
    }
    const specs = await SpecModel.find({ workspaceId: req.params.workspaceId }).sort({ updatedAt: -1 });
    res.json({ success: true, specs });
  } catch (error) {
    console.error('Get specs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:specId', authenticateToken, async (req, res) => {
  try {
    const existing = await SpecModel.findById(req.params.specId);
    if (existing && !await userCanAccessWorkspace(existing.workspaceId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Workspace access denied' });
    }
    const spec = existing ? await SpecModel.findByIdAndDelete(req.params.specId) : null;
    if (!spec) return res.status(404).json({ success: false, message: 'Spec not found' });
    await LocalTask.updateMany({ specIds: spec._id }, { $pull: { specIds: spec._id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete spec error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/verify', authenticateToken, enforceSpecEngineLevel('full_sdd'), async (req, res) => {
  try {
    const { specId, workspaceId, taskId } = req.body;
    const spec = specId ? await SpecModel.findById(specId) : await SpecModel.findOne({ workspaceId, title: req.body.title });

    if (!spec) {
      return res.status(404).json({ success: false, message: 'Spec not found' });
    }
    if (!await userCanAccessWorkspace(spec.workspaceId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Workspace access denied' });
    }

    const result = await sddVerificationService.verifySpec(spec._id, taskId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Verify spec error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/drift-report', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.body;
    if (!await userCanAccessWorkspace(workspaceId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Workspace access denied' });
    }
    const report = await sddVerificationService.generateDriftReport(workspaceId);
    res.json({ success: true, report });
  } catch (error) {
    console.error('Drift report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:specId', authenticateToken, async (req, res) => {
  try {
    const spec = await SpecModel.findById(req.params.specId);
    if (!spec) {
      return res.status(404).json({ success: false, message: 'Spec not found' });
    }
    if (!await userCanAccessWorkspace(spec.workspaceId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Workspace access denied' });
    }
    res.json({ success: true, spec });
  } catch (error) {
    console.error('Get spec error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
