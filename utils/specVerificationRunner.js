/**
 * Isolated verification runner.
 *
 * A spec's `verificationCommand` is only meaningful if it is actually executed.
 * This module materialises the project's files into a throwaway directory, then
 * runs the command in the sandbox (Docker by default) and reports one of the
 * three trust states:
 *
 *   pass           the command exited 0
 *   fail           the command exited non-zero
 *   not_evaluated  the command could not be run (no runner, timeout, install
 *                  failure). This is deliberately NOT a failure: an unavailable
 *                  runner says nothing about the code.
 *
 * Isolation rules:
 *   - dependency install gets network, the verification command does not
 *   - the container is always removed
 *   - host execution is only a development fallback (`NODE_ENV !== production`)
 */

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const sandboxSecurity = require('./sandboxSecurity');

const DEFAULT_COMMAND_TIMEOUT_MS = Number(process.env.SPEC_VERIFICATION_TIMEOUT_MS) || 180000;
const DEFAULT_INSTALL_TIMEOUT_MS = Number(process.env.SPEC_VERIFICATION_INSTALL_TIMEOUT_MS) || 300000;
const MAX_OUTPUT = 12000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

function normalizePath(value) {
  let normalized = String(value || '/').replace(/\\/g, '/').trim();
  if (!normalized) return '/';
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/+/g, '/');
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
  return normalized || '/';
}

/** Full project-relative path for a CodeFile-shaped object. */
function fullPathFor(file) {
  if (!file) return null;
  if (file.fullPath) return String(file.fullPath).replace(/^\/+/, '');
  const base = normalizePath(file.path);
  const name = String(file.name || '').trim();
  if (!name) return base.replace(/^\/+/, '') || null;
  if (base === '/') return name;
  if (base === name || base.endsWith(`/${name}`)) return base.replace(/^\/+/, '');
  return `${base.replace(/^\/+/, '')}/${name}`;
}

function safeRelativePath(value) {
  const full = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!full || full.includes('\0') || full.includes('..')) return null;
  if (/^[a-zA-Z]:/.test(full)) return null;
  const segments = full.split('/').filter(Boolean);
  if (!segments.length) return null;
  if (segments.some((segment) => segment === 'node_modules' || segment === '.git')) return null;
  return segments.join('/');
}

function capOutput(value) {
  const text = String(value || '');
  if (text.length <= MAX_OUTPUT) return text;
  return `${text.slice(0, MAX_OUTPUT)}\n… output truncated (${text.length - MAX_OUTPUT} more characters)`;
}

function tailOutput(value, size = 4000) {
  const text = String(value || '');
  return text.length <= size ? text : `…\n${text.slice(-size)}`;
}

function hasFile(files, name) {
  return files.some((file) => {
    const full = fullPathFor(file);
    return full && (full === name || full.endsWith(`/${name}`));
  });
}

async function materializeFiles(files, rootDir) {
  let total = 0;
  let written = 0;
  for (const file of files || []) {
    if (file?.contentOmitted) continue;
    const relative = safeRelativePath(fullPathFor(file));
    if (!relative) continue;
    let content = file.content;
    if (content == null) content = '';
    if (file.encoding === 'base64') {
      content = Buffer.from(String(content), 'base64');
    } else {
      content = String(content);
    }
    const bytes = Buffer.byteLength(content);
    if (bytes > MAX_FILE_BYTES) continue;
    total += bytes;
    if (total > MAX_TOTAL_BYTES) break;
    const destination = path.join(rootDir, relative);
    if (!destination.startsWith(rootDir + path.sep)) continue;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
    written += 1;
  }
  return written;
}

function dependencyInstallCommand(files) {
  if (!hasFile(files, 'package.json')) return null;
  if (hasFile(files, 'package-lock.json') || hasFile(files, 'npm-shrinkwrap.json')) {
    return ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'];
  }
  return ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund'];
}

function execOnHost(cmd, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    execFile('/bin/sh', ['-c', cmd], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        CI: '1',
        NODE_ENV: 'test',
        npm_config_cache: path.join(cwd, '.npm-cache'),
      },
    }, (error, stdout, stderr) => {
      const timedOut = Boolean(error?.killed || error?.signal === 'SIGTERM');
      resolve({
        exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
        output: `${stdout || ''}${stderr || ''}`,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function runInSandbox({ hostDir, cmd, timeoutMs, network, allowFailure }) {
  const startedAt = Date.now();
  try {
    const result = await sandboxSecurity.runEphemeral({
      hostDir,
      cmd: ['/bin/sh', '-c', cmd],
      network,
      timeoutMs,
      allowFailure,
    });
    return {
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 0,
      output: result.output || '',
      timedOut: false,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error.code === 'SANDBOX_TIMEOUT') {
      return { exitCode: null, output: error.message, timedOut: true, durationMs: Date.now() - startedAt };
    }
    throw error;
  }
}

async function runCommand({ command, hostDir, files, cwd, timeoutMs, network, allowFailure = true }) {
  const dockerAvailable = await sandboxSecurity.isDockerAvailable().catch(() => false);
  if (dockerAvailable) {
    return { ...(await runInSandbox({ hostDir, cmd: command, timeoutMs, network, allowFailure })), runner: 'docker' };
  }
  if (process.env.NODE_ENV === 'production') {
    return {
      exitCode: null,
      output: '',
      timedOut: false,
      durationMs: 0,
      runner: null,
      unavailable: 'The isolated runner is unavailable.',
    };
  }
  // Development fallback. Same tradeoff the existing sandbox executor makes:
  // host execution is never allowed in production.
  const result = await execOnHost(command, { cwd: cwd || hostDir, timeoutMs });
  return { ...result, runner: 'host' };
}

function notEvaluated(command, reason, extra = {}) {
  return {
    command: command || null,
    status: 'not_evaluated',
    exitCode: null,
    output: '',
    reason,
    durationMs: 0,
    runner: null,
    ...extra,
  };
}

/**
 * Run a spec's verification command against a set of files.
 *
 * @param {object} options
 * @param {string} options.command        shell command from the spec
 * @param {Array}  [options.files]        files to materialise (CodeFile shape)
 * @param {string} [options.hostDir]      an existing checkout/worktree to run in
 * @param {number} [options.timeoutMs]
 * @param {boolean}[options.installDependencies]
 * @returns {Promise<object>} three-state command result
 */
async function runVerificationCommand({
  command,
  files = [],
  hostDir = null,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  installDependencies = true,
} = {}) {
  const cmd = String(command || '').trim();
  if (!cmd) return notEvaluated(null, 'No verification command is configured.');

  let workDir = hostDir && path.isAbsolute(String(hostDir)) ? String(hostDir) : null;
  let tempDir = null;
  let installResult = null;

  try {
    if (!workDir) {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-verify-'));
      workDir = tempDir;
      const written = await materializeFiles(files, workDir);
      if (!written) {
        return notEvaluated(cmd, 'The project has no stored files to verify.');
      }
    }

    const installCmd = installDependencies ? dependencyInstallCommand(files) : null;
    if (installCmd) {
      installResult = await runCommand({
        command: installCmd.join(' '),
        hostDir: workDir,
        cwd: workDir,
        files,
        timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
        network: 'bridge',
      });
      if (installResult.unavailable) {
        return notEvaluated(cmd, installResult.unavailable);
      }
      if (installResult.timedOut) {
        return notEvaluated(cmd, `Dependency install timed out after ${DEFAULT_INSTALL_TIMEOUT_MS}ms.`, {
          runner: installResult.runner,
          install: { status: 'not_evaluated', output: tailOutput(installResult.output) },
        });
      }
      if (installResult.exitCode !== 0) {
        return notEvaluated(cmd, 'Dependencies could not be installed, so the verification command did not run.', {
          runner: installResult.runner,
          install: { status: 'fail', exitCode: installResult.exitCode, output: tailOutput(installResult.output) },
        });
      }
    }

    const result = await runCommand({
      command: cmd,
      hostDir: workDir,
      cwd: workDir,
      files,
      timeoutMs,
      network: 'none',
    });

    if (result.unavailable) return notEvaluated(cmd, result.unavailable);
    if (result.timedOut) {
      return notEvaluated(cmd, `Verification command timed out after ${timeoutMs}ms.`, {
        runner: result.runner,
        output: capOutput(result.output),
        durationMs: result.durationMs,
        install: installResult ? { status: 'pass', runner: installResult.runner } : undefined,
      });
    }

    const status = result.exitCode === 0 ? 'pass' : 'fail';
    return {
      command: cmd,
      status,
      exitCode: result.exitCode,
      output: capOutput(result.output),
      reason: status === 'pass' ? null : `Verification command exited ${result.exitCode}.`,
      durationMs: result.durationMs,
      runner: result.runner,
      install: installResult ? { status: 'pass', runner: installResult.runner } : undefined,
    };
  } catch (error) {
    return notEvaluated(cmd, `Verification runner error: ${error.message}`);
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Merge several command results into the single command row shown in the UI.
 * A real failure wins; otherwise any successful run is a pass; otherwise the
 * result is not evaluated.
 */
function summarizeCommandResults(results = []) {
  const commands = results.filter(Boolean);
  if (!commands.length) return null;
  const failed = commands.find((result) => result.status === 'fail');
  if (failed) return failed;
  const passed = commands.find((result) => result.status === 'pass');
  if (passed) return passed;
  return commands[0];
}

module.exports = {
  fullPathFor,
  safeRelativePath,
  materializeFiles,
  dependencyInstallCommand,
  runVerificationCommand,
  summarizeCommandResults,
  capOutput,
  tailOutput,
};
