const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const SpecModel = require('../models/SpecModel');
const sddVerificationService = require('../utils/sddVerificationService');
const { execSync } = require('child_process');

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { workspaceId, title, content, targetFiles, targetModules, assertions, specId } = req.body;

    if (!workspaceId || !title || !content) {
      return res.status(400).json({ success: false, message: 'workspaceId, title, and content are required' });
    }

    const spec = await SpecModel.findOneAndUpdate(
      { workspaceId, title },
      {
        workspaceId,
        title,
        specId: specId || `SPEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content,
        targetFiles: targetFiles || [],
        targetModules: targetModules || [],
        assertions: assertions || [],
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
    const specs = await SpecModel.find({ workspaceId: req.params.workspaceId }).sort({ updatedAt: -1 });
    res.json({ success: true, specs });
  } catch (error) {
    console.error('Get specs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { specId, workspaceId, taskId } = req.body;
    const spec = specId ? await SpecModel.findById(specId) : await SpecModel.findOne({ workspaceId, title: req.body.title });

    if (!spec) {
      return res.status(404).json({ success: false, message: 'Spec not found' });
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
    res.json({ success: true, spec });
  } catch (error) {
    console.error('Get spec error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
