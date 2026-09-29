const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const SpecModel = require('../models/SpecModel');
const LocalProject = require('../models/LocalProject');
const LocalTask = require('../models/LocalTask');
const sddVerificationService = require('../utils/sddVerificationService');
const { userCanAccessProject, userCanAccessSpec, userCanAccessWorkspace, getWorkspaceProjectIds } = require('../utils/specAccess');

/**
 * Specs are project-level. Creating one records the project's workspace (when
 * it has one) purely as collaboration context — never as an access requirement.
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      projectId, title, description, content, targetFiles, targetModules, assertions, specId,
      architecturalRules, requirements, forbiddenImports, constraints, verificationCommand, coverageThreshold,
    } = req.body;

    if (!projectId || !title) {
      return res.status(400).json({ success: false, message: 'projectId and title are required' });
    }
    if (!await userCanAccessProject(projectId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Project access denied' });
    }

    const project = await LocalProject.findById(projectId).select('workspaceId').lean();
    // Trust the project's own workspace over anything passed in by the client.
    const effectiveWorkspaceId = project?.workspaceId || null;

    const existingSpec = specId ? await SpecModel.findOne({
      projectId,
      $or: [
        { specId },
        ...(mongoose.Types.ObjectId.isValid(specId) ? [{ _id: specId }] : []),
      ],
    }) : null;

    const spec = await SpecModel.findOneAndUpdate(
      existingSpec ? { _id: existingSpec._id, projectId } : { projectId, title },
      {
        projectId,
        workspaceId: effectiveWorkspaceId,
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

/**
 * Primary listing: every spec belonging to one project.
 */
router.get('/project/:projectId', authenticateToken, async (req, res) => {
  try {
    if (!await userCanAccessProject(req.params.projectId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Project access denied' });
    }
    const specs = await SpecModel.find({ projectId: req.params.projectId }).sort({ updatedAt: -1 });
    res.json({ success: true, specs });
  } catch (error) {
    console.error('Get project specs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Workspace view: the specs of every project inside a workspace, so a
 * workspace can show cross-project spec health. This is additive — specs
 * remain project-scoped.
 */
router.get('/workspace/:workspaceId', authenticateToken, async (req, res) => {
  try {
    if (!await userCanAccessWorkspace(req.params.workspaceId, req.userId)) {
      return res.status(403).json({ success: false, message: 'Workspace access denied' });
    }
    const projectIds = await getWorkspaceProjectIds(req.params.workspaceId);
    const specs = await SpecModel.find({
      $or: [
        ...(projectIds.length ? [{ projectId: { $in: projectIds } }] : []),
        { workspaceId: req.params.workspaceId }
      ]
    }).sort({ updatedAt: -1 });
    res.json({ success: true, specs });
  } catch (error) {
    console.error('Get workspace specs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:specId', authenticateToken, async (req, res) => {
  try {
    const existing = await SpecModel.findById(req.params.specId);
    if (existing && !await userCanAccessSpec(existing, req.userId)) {
      return res.status(403).json({ success: false, message: 'Project access denied' });
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

router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { specId, projectId, taskId } = req.body;
    const spec = specId
      ? await SpecModel.findById(specId)
      : await SpecModel.findOne({ projectId, title: req.body.title });

    if (!spec) {
      return res.status(404).json({ success: false, message: 'Spec not found' });
    }
    if (!await userCanAccessSpec(spec, req.userId)) {
      return res.status(403).json({ success: false, message: 'Project access denied' });
    }

    const result = await sddVerificationService.verifySpec(spec._id, taskId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Verify spec error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Drift reporting is project-scoped; a workspace scope is still accepted and
 * expands to every project in that workspace.
 */
router.post('/drift-report', authenticateToken, async (req, res) => {
  try {
    const { projectId, workspaceId } = req.body;
    const target = projectId || workspaceId;
    if (!target) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }
    if (projectId) {
      if (!await userCanAccessProject(projectId, req.userId)) {
        return res.status(403).json({ success: false, message: 'Project access denied' });
      }
    } else {
      // Workspace scope still requires workspace membership.
      if (!await userCanAccessWorkspace(workspaceId, req.userId)) {
        return res.status(403).json({ success: false, message: 'Workspace access denied' });
      }
    }
    const report = await sddVerificationService.generateDriftReport(target);
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
    if (!await userCanAccessSpec(spec, req.userId)) {
      return res.status(403).json({ success: false, message: 'Project access denied' });
    }
    res.json({ success: true, spec });
  } catch (error) {
    console.error('Get spec error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
