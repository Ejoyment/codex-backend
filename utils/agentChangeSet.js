/**
 * Agent Change Set
 *
 * Turns an AI agent's textual proposal into a real, reviewable change set and
 * applies it — either to the isolated git working tree (pre-approval) or to the
 * VFS CodeFiles (on approval). Keeping both paths in one module stops the HTTP
 * worker (`agentWorker.js`) and the socket execution loop (`agentSocket.js`)
 * from drifting apart.
 *
 * Change format the model is asked to emit:
 *
 *   ### file: src/foo.js
 *   ```js
 *   ...file contents...
 *   ```
 *
 * A marker may also be embedded in the fence info string, e.g.
 * ```js file=src/foo.js. `### delete: src/foo.js` removes a file.
 */

const diff = require('diff');
const CodeFile = require('../models/CodeFile');
const gitService = require('./gitService');
const codeSearchService = require('./codeSearchService');

const MARKER_RE = /^\s*(?:#{1,6}\s*)?(?:file|path|filename)\s*[:=]\s*(.+?)\s*$/i;
const DELETE_RE = /^\s*(?:#{1,6}\s*)?(?:delete|remove)\s*[:=]\s*(.+?)\s*$/i;
const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

const LANGUAGE_BY_EXT = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  sql: 'sql',
  toml: 'toml',
  xml: 'xml',
};

function languageFor(filePath) {
  const ext = String(filePath || '').split('.').pop().toLowerCase();
  return LANGUAGE_BY_EXT[ext] || ext || 'text';
}

function cleanPath(p) {
  return String(p || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function isSafeRelativePath(p) {
  const v = cleanPath(p);
  if (!v || v.startsWith('/') || v.startsWith('-')) return false;
  if (v.includes('..') || v.includes('\0')) return false;
  if (/^[a-zA-Z]:/.test(v)) return false;
  return true;
}

function splitPath(full) {
  const norm = cleanPath(full).replace(/^\/+/, '');
  const idx = norm.lastIndexOf('/');
  if (idx === -1) return { name: norm, dir: '/' };
  return { name: norm.slice(idx + 1), dir: `/${norm.slice(0, idx)}` };
}

function normalizeFullPath(file) {
  if (!file) return null;
  if (file.fullPath) return cleanPath(file.fullPath).replace(/^\/+/, '');
  const name = String(file.name || '').trim();
  const base = String(file.path || '/').replace(/\/+$/, '');
  if (!name) return base.replace(/^\/+/, '') || null;
  if (!base || base === '/') return name;
  if (base === name || base.endsWith(`/${name}`)) return base.replace(/^\/+/, '');
  return `${base.replace(/^\/+/, '')}/${name}`;
}

function lastMarkerLine(before) {
  const lines = before.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) return lines[i];
  }
  return '';
}

/**
 * Parse fenced code blocks out of model output, pairing each with the nearest
 * preceding `### file:` / `### delete:` marker (or an inline `file=` hint).
 */
function parseChangeSet(modelText) {
  if (!modelText || typeof modelText !== 'string') return [];
  const changes = [];
  const seen = new Set();
  let match;

  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(modelText)) !== null) {
    const info = (match[1] || '').trim();
    const body = match[2].replace(/\n$/, '');

    let rawPath = null;
    let action = 'update';

    const infoMatch = info.match(/(?:file|path|filename)\s*[:=]\s*(\S+)/i);
    if (infoMatch) rawPath = infoMatch[1];

    if (!rawPath) {
      const line = lastMarkerLine(modelText.slice(0, match.index));
      const fileMatch = line.match(MARKER_RE);
      const deleteMatch = line.match(DELETE_RE);
      if (fileMatch) {
        rawPath = fileMatch[1];
      } else if (deleteMatch) {
        rawPath = deleteMatch[1];
        action = 'delete';
      }
    }

    if (!rawPath || !isSafeRelativePath(rawPath)) continue;

    const filePath = cleanPath(rawPath).replace(/^\/+/, '');
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    changes.push({
      path: filePath,
      language: languageFor(filePath),
      action,
      content: action === 'delete' ? '' : body,
    });
  }

  return changes;
}

function indexOriginals(originalFiles = []) {
  const map = new Map();
  for (const file of originalFiles) {
    const full = normalizeFullPath(file);
    if (full) map.set(full, file);
  }
  return map;
}

/**
 * Resolve create/update/delete by comparing parsed changes against the files
 * the model was shown.
 */
function buildChangeset(modelText, originalFiles = []) {
  const originals = indexOriginals(originalFiles);
  return parseChangeSet(modelText).map((change) => {
    const action =
      change.action === 'delete'
        ? 'delete'
        : originals.has(change.path)
          ? 'update'
          : 'create';
    return { ...change, action };
  });
}

function countLines(oldContent, newContent) {
  let insertions = 0;
  let deletions = 0;
  const parts = diff.diffLines(oldContent || '', newContent || '');
  for (const part of parts) {
    const count =
      typeof part.count === 'number'
        ? part.count
        : String(part.value || '').split('\n').length;
    if (part.added) insertions += count;
    else if (part.removed) deletions += count;
  }
  return { insertions, deletions };
}

/**
 * Produce `filesChanged` (with per-file patches) and a `diffSummary` suitable
 * for the AgentExecution document and the review UI.
 */
function summarize(changes = [], originalFiles = []) {
  const originals = indexOriginals(originalFiles);
  const filesChanged = [];
  let insertions = 0;
  let deletions = 0;

  for (const change of changes) {
    const oldContent = originals.get(change.path)?.content || '';
    const newContent = change.action === 'delete' ? '' : change.content || '';
    const patch = diff.createPatch(change.path, oldContent, newContent);
    filesChanged.push({ path: change.path, action: change.action, diff: patch });
    const stats = countLines(oldContent, newContent);
    insertions += stats.insertions;
    deletions += stats.deletions;
  }

  return {
    filesChanged,
    diffSummary: {
      filesChanged: changes.length,
      insertions,
      deletions,
    },
  };
}

/**
 * Merge a change set into a list of `{ path, name, language, content }` files,
 * preserving the original shape so downstream consumers (SDD verification,
 * snapshot comparison) behave identically to pre-agent snapshots.
 */
function applyChangesToFileList(changes = [], originalFiles = []) {
  const byPath = new Map();
  for (const file of originalFiles) {
    const full = normalizeFullPath(file);
    if (full) byPath.set(full, { ...file });
  }

  for (const change of changes) {
    if (change.action === 'delete') {
      byPath.delete(change.path);
      continue;
    }
    const existing = byPath.get(change.path);
    if (existing) {
      byPath.set(change.path, {
        ...existing,
        language: change.language || existing.language,
        content: change.content || '',
      });
    } else {
      const { name, dir } = splitPath(change.path);
      byPath.set(change.path, {
        path: dir,
        name,
        language: change.language || languageFor(change.path),
        content: change.content || '',
      });
    }
  }

  return Array.from(byPath.values());
}

/**
 * Write staged changes into the isolated agent working tree and commit them on
 * the current (agent) branch. Never touches the VFS.
 */
async function stageChanges(workspaceId, changes, { message = 'Agent changes', branch = null } = {}) {
  const write = await gitService.writeWorkingTree(workspaceId, changes);
  if (!write.success) return { success: false, error: write.error };
  const commit = await gitService.commitWorkingTree(workspaceId, message, branch);
  return {
    success: true,
    committed: commit.success,
    commit: commit.commit || null,
    reason: commit.reason || null,
  };
}

/**
 * Apply a change set to the VFS (CodeFile collection + search index). Called
 * only on approval, so agent work stays invisible until a human merges it.
 */
async function applyToVFS(workspaceId, changes, { userId = null } = {}) {
  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const change of changes || []) {
    if (!isSafeRelativePath(change.path)) continue;
    const { name, dir } = splitPath(change.path);

    if (change.action === 'delete') {
      const existing = await CodeFile.findOne({ company: workspaceId, name, path: dir });
      if (existing) {
        await existing.deleteOne();
        try {
          await codeSearchService.deleteFile(existing._id);
        } catch (error) {
          // search index is best-effort
        }
        deleted += 1;
      }
      continue;
    }

    const content = change.content || '';
    const size = Buffer.byteLength(content, 'utf8');
    const language = change.language || languageFor(change.path);
    const existing = await CodeFile.findOne({ company: workspaceId, name, path: dir });

    if (existing) {
      existing.content = content;
      existing.size = size;
      if (change.language) existing.language = language;
      if (userId) existing.lastModifiedBy = userId;
      await existing.save();
      try {
        await codeSearchService.updateFile(existing);
      } catch (error) {
        // search index is best-effort
      }
      updated += 1;
    } else {
      const doc = await CodeFile.create({
        name,
        path: dir,
        language,
        content,
        company: workspaceId,
        createdBy: userId,
      });
      try {
        await codeSearchService.updateFile(doc);
      } catch (error) {
        // search index is best-effort
      }
      created += 1;
    }
  }

  return { success: true, created, updated, deleted, applied: created + updated + deleted };
}

/**
 * Approve an AgentExecution: copy its proposed changes into the VFS. The git
 * branch merge is left to the caller (HTTP route / socket) so both entry points
 * keep their existing SDD + ownership checks.
 */
async function applyExecutionChanges(execution) {
  const meta = execution?.metadata;
  const workspaceId = meta?.get ? meta.get('workspaceId') : meta?.workspaceId;
  const changes = (execution?.proposedChanges || []).map((change) => ({
    path: change.path,
    action: change.action,
    content: change.content,
    language: change.language,
  }));

  if (!workspaceId) {
    return { applied: false, reason: 'missing workspace', changes: 0 };
  }
  if (!changes.length) {
    return { applied: false, reason: 'no proposed changes', changes: 0 };
  }

  const result = await applyToVFS(workspaceId, changes, { userId: execution.userId });
  return { applied: true, ...result, changes: changes.length };
}

const CHANGE_FORMAT_INSTRUCTIONS = [
  'When you produce file changes, output each file as a fenced code block',
  'immediately preceded by a marker line in the form:',
  '### file: <relative/path/to/file>',
  'Use exactly one marker per file, and use the project-relative path.',
  'To delete a file, emit `### delete: <relative/path>` instead.',
  'Do not describe the changes in prose in place of the code blocks.',
].join('\n');

module.exports = {
  CHANGE_FORMAT_INSTRUCTIONS,
  parseChangeSet,
  buildChangeset,
  summarize,
  applyChangesToFileList,
  stageChanges,
  applyToVFS,
  applyExecutionChanges,
  languageFor,
  normalizeFullPath,
  isSafeRelativePath,
};
