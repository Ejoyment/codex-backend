const Company = require('../models/Company');
const CodeFile = require('../models/CodeFile');
const Deployment = require('../models/Deployment');
const LocalProject = require('../models/LocalProject');
const TeamProject = require('../models/TeamProject');
const depService = require('./deploymentService');
const { validateDeployFiles, backfillFileContent, limits: deployLimits } = require('./deployContent');
const { notifyDeploymentEvent } = require('./notificationTriggers');

async function redeployApprovedProject({ execution, userId, workspaceId }) {
  const projectId = execution.projectId ? String(execution.projectId) : null;
  if (!projectId) return { skipped: true, reason: 'Execution is not linked to a project.' };

  const project = await LocalProject.findById(projectId).select('workspaceId').lean()
    || await TeamProject.findById(projectId).select('company').lean();
  const resolvedWorkspaceId = workspaceId || project?.workspaceId || project?.company || null;
  if (resolvedWorkspaceId) {
    const company = await Company.findById(resolvedWorkspaceId).select('settings.autoDeploy').lean();
    if (company?.settings?.autoDeploy === false) {
      return { skipped: true, reason: 'Auto-deploy is disabled for this workspace.' };
    }
  }

  const deployment = await Deployment.findOne({
    projectKey: projectId,
    status: 'success',
    containerId: { $ne: null },
  }).sort({ updatedAt: -1 });
  if (!deployment) return { skipped: true, reason: 'No active deployment exists for this project.' };

  const subdomain = deployment.subdomain;
  let buildLogs = '';
  const steps = ['prepare', 'build', 'deploy', 'verify'].map((name) => ({ name, status: 'pending' }));
  const hooks = {
    onLog(chunk) {
      buildLogs += String(chunk || '');
      if (buildLogs.length > 1200000) buildLogs = buildLogs.slice(-900000);
    },
    onStep({ name, status, detail }) {
      let step = steps.find((item) => item.name === name);
      if (!step) {
        step = { name, status: 'pending' };
        steps.push(step);
      }
      step.status = status;
      if (detail) step.detail = detail;
      if (status === 'running') step.startedAt = new Date();
      if (status === 'done' || status === 'failed') step.finishedAt = new Date();
      if (name === 'deploy' && status === 'running') deployment.status = 'deploying';
      deployment.steps = steps;
      deployment.save().catch((error) => {
        console.error('[agent-auto-deploy] could not persist deployment progress:', error.message);
      });
    },
  };

  deployment.status = 'building';
  deployment.errorMessage = null;
  deployment.fault = null;
  deployment.failureStage = null;
  deployment.buildLogs = '';
  deployment.steps = steps;
  deployment.expiresAt = null;
  await deployment.save();
  notifyDeploymentEvent({
    type: 'deployment_started',
    deployment: { _id: deployment._id, environment: subdomain, company: resolvedWorkspaceId },
    userId,
    detail: `Redeploying ${subdomain}.buildrshq.dev after approved changes.`,
  });

  try {
    const files = await CodeFile.find({ project: projectId })
      .select('name path content language')
      .lean();
    if (!files.length) throw new Error('The approved project has no files to deploy.');

    const normalizedFiles = files.map((file) => ({
      name: file.name,
      path: file.path || '/',
      content: typeof file.content === 'string' ? file.content : '',
      language: file.language || 'plaintext',
    }));
    validateDeployFiles(normalizedFiles);
    await backfillFileContent({
      userId,
      projectId,
      workspaceId: resolvedWorkspaceId,
      source: 'project',
      repo: null,
      files: normalizedFiles,
      deadline: Date.now() + deployLimits().backfillTimeoutMs,
    });
    validateDeployFiles(normalizedFiles);
    const detected = depService.detectRuntime(normalizedFiles);
    const result = await depService.deployProject(subdomain, normalizedFiles, hooks);
    deployment.containerId = result.containerId || null;
    deployment.deployedUrl = result.url || `https://${subdomain}.buildrshq.dev`;
    deployment.httpUrl = `http://${subdomain}.buildrshq.dev`;
    deployment.status = 'success';
    deployment.runtime = detected.runtime;
    deployment.errorMessage = null;
    deployment.fault = null;
    deployment.failureStage = null;
    deployment.expiresAt = null;
    deployment.steps = steps;
    deployment.buildLogs = depService.capLogTail(buildLogs);
    deployment.runtimeLogs = String(result.runtimeLogs || '').slice(-200000);
    await deployment.save();
    notifyDeploymentEvent({
      type: 'deployment_succeeded',
      deployment: { _id: deployment._id, environment: subdomain, company: resolvedWorkspaceId },
      userId,
      detail: `${subdomain}.buildrshq.dev is live.`,
    });
    return { success: true, deployment };
  } catch (error) {
    deployment.status = 'failed';
    deployment.errorMessage = String(error.message || 'Redeployment failed').slice(0, 1000);
    deployment.fault = error.fault || 'platform';
    deployment.failureStage = error.stage || 'platform';
    deployment.steps = steps;
    deployment.buildLogs = depService.capLogTail(`${buildLogs}\n--- REDEPLOYMENT FAILED ---\n${deployment.errorMessage}\n`);
    deployment.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await deployment.save();
    notifyDeploymentEvent({
      type: 'deployment_failed',
      deployment: { _id: deployment._id, environment: subdomain, company: resolvedWorkspaceId },
      userId,
      detail: deployment.errorMessage,
    });
    throw error;
  }
}

module.exports = { redeployApprovedProject };
