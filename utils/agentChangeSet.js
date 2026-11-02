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
const { resolveProjectId } = require('./fileScope');

const MARKER_RE = /^\s*(?:#{1,6}\s*)?(?:file|path|filename|filepath|target)\s*[:=]\s*(.+?)\s*$/i;
const DELETE_RE = /^\s*(?:#{1,6}\s*)?(?:delete|remove)\s*[:=]\s*(.+?)\s*$/i;
const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;
const UNCLOSED_FENCE_RE = /```([^\n`]*)\n([\s\S]*)$/;
const PATH_TOKEN_RE = /(?:^|[\s("'`])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]{1,12})(?=$|[\s)"'`,;:])/g;

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

const DOC_EXTENSIONS = new Set([...Object.keys(LANGUAGE_BY_EXT), 'txt', 'csv', 'env', 'lock']);

function lastMarkerLine(before) {
  const lines = before.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) return lines[i];
  }
  return '';
}

function firstMarkerLine(after) {
  const lines = String(after || '').split('\n');
  for (const line of lines) {
    if (line.trim()) return line;
  }
  return '';
}

function stripPathDecorations(value) {
  return String(value || '')
    .trim()
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^[\s>#*+\-[\]]+/, '')
    .replace(/^\(|\)$/g, '')
    .replace(/[).,;:]+$/g, '')
    .trim();
}

function normalizePathCandidate(raw) {
  let value = stripPathDecorations(raw)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(?:file|path|filename|filepath|target)\s*[:=]\s*/i, '')
    .replace(/^(?:update|modify|create|add|edit|change|replace|write|delete|remove)\s+/i, '')
    .trim();
  if (!value) return null;
  if (value.includes('://')) return null;
  if (/\s/.test(value)) return null;
  if (!isSafeRelativePath(value)) return null;
  const extension = value.split('.').pop().toLowerCase();
  // A bare token like "v1.2" should not be treated as a file. Require either
  // a directory segment or an extension we recognise.
  if (!value.includes('/') && !DOC_EXTENSIONS.has(extension)) return null;
  return cleanPath(value).replace(/^\/+/, '');
}

/**
 * Pull a path out of a heading, bullet, `**File:**` line, or a prose sentence
 * such as "Here is the updated `src/foo.js`:".
 */
function pathFromLine(line) {
  const text = String(line || '');
  if (!text.trim()) return null;

  const keyed = text.match(/(?:file|path|filename|filepath|target)\s*[:=]\s*(.+)$/i);
  if (keyed) {
    const candidate = normalizePathCandidate(keyed[1].trim().split(/\s+/)[0]);
    if (candidate) return candidate;
  }

  PATH_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = PATH_TOKEN_RE.exec(text)) !== null) {
    const candidate = normalizePathCandidate(match[1]);
    if (candidate) return candidate;
  }
  return null;
}

function knownPathIndex(originalFiles = []) {
  const map = new Map();
  for (const file of originalFiles || []) {
    const full = normalizeFullPath(file);
    if (full) map.set(full.toLowerCase(), full);
  }
  return map;
}

function resolveKnownPath(candidate, knownPaths) {
  if (!candidate || !knownPaths?.size) return candidate;
  const lower = candidate.toLowerCase();
  if (knownPaths.has(lower)) return knownPaths.get(lower);
  const suffixed = [...knownPaths.entries()].filter(([path]) => path.endsWith(`/${lower}`));
  return suffixed.length === 1 ? suffixed[0][1] : candidate;
}

/**
 * Parse fenced code blocks out of model output, pairing each with the nearest
 * preceding marker, an inline `file=` hint, or a path mentioned in prose.
 * This is deliberately forgiving: real models say "### src/foo.js",
 * "**File:** src/foo.js", or "Here is the updated `src/foo.js`:" far more
 * often than they use one exact marker style.
 */
function parseChangeSet(modelText, originalFiles = []) {
  if (!modelText || typeof modelText !== 'string') return [];
  const changes = [];
  const seen = new Set();
  const knownPaths = knownPathIndex(originalFiles);
  let match;

  const pushChange = (rawPath, body, action = 'update') => {
    const candidate = normalizePathCandidate(rawPath);
    if (!candidate) return;
    const filePath = resolveKnownPath(candidate, knownPaths);
    if (!isSafeRelativePath(filePath) || seen.has(filePath)) return;
    seen.add(filePath);
    changes.push({
      path: filePath,
      language: languageFor(filePath),
      action,
      content: action === 'delete' ? '' : body,
    });
  };

  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(modelText)) !== null) {
    const info = (match[1] || '').trim();
    const body = match[2].replace(/\n$/, '');

    let rawPath = null;
    let action = 'update';

    const infoMatch = info.match(/(?:file|path|filename|filepath|target)\s*[:=]\s*(\S+)/i);
    if (infoMatch) {
      rawPath = infoMatch[1];
    } else if (info && !info.includes('=') && /[/.]/.test(info) && !/\s/.test(info)) {
      rawPath = info;
    }

    if (!rawPath) {
      const line = lastMarkerLine(modelText.slice(0, match.index));
      const fileMatch = line.match(MARKER_RE);
      const deleteMatch = line.match(DELETE_RE);
      if (fileMatch) {
        rawPath = fileMatch[1];
      } else if (deleteMatch) {
        rawPath = deleteMatch[1];
        action = 'delete';
      } else {
        rawPath = pathFromLine(line);
      }
    }

    // Some models put the filename after the code block instead of before it.
    if (!rawPath) {
      const after = firstMarkerLine(modelText.slice(match.index + match[0].length));
      rawPath = pathFromLine(after);
    }

    if (!rawPath) continue;
    pushChange(rawPath, body, action);
  }

  // A truncated response may never close its last fence. Salvage it when the
  // marker still names a usable path.
  if (!changes.length) {
    const unclosed = modelText.match(UNCLOSED_FENCE_RE);
    if (unclosed) {
      const info = (unclosed[1] || '').trim();
      const body = unclosed[2].replace(/\n$/, '');
      let rawPath = null;
      const infoMatch = info.match(/(?:file|path|filename|filepath|target)\s*[:=]\s*(\S+)/i);
      if (infoMatch) rawPath = infoMatch[1];
      else if (info && !info.includes('=') && /[/.]/.test(info) && !/\s/.test(info)) rawPath = info;
      if (!rawPath) rawPath = pathFromLine(lastMarkerLine(modelText.slice(0, unclosed.index)));
      if (rawPath) pushChange(rawPath, body);
    }
  }

  return changes;
}

function jsonPayloads(modelText) {
  const payloads = [];
  const trimmed = String(modelText || '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) payloads.push(trimmed);
  const fenceRe = /```(?:json|JSON)?\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = fenceRe.exec(String(modelText || ''))) !== null) {
    const body = match[1].trim();
    if (body.startsWith('{') || body.startsWith('[')) payloads.push(body);
  }
  return payloads;
}

function changesFromJsonValue(value) {
  const changes = [];
  if (!value) return changes;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const path = item.path || item.file || item.filename || item.filePath || item.name;
      const content = item.content ?? item.code ?? item.newContent ?? item.new_content ?? item.contents;
      if (!path || typeof content !== 'string') continue;
      changes.push({
        path,
        action: String(item.action || item.type || 'update').toLowerCase(),
        content,
        language: item.language || languageFor(path),
      });
    }
    return changes;
  }

  if (typeof value !== 'object') return changes;
  const nested = value.files || value.changes || value.edits || value.operations;
  if (nested) return changesFromJsonValue(nested);

  for (const [path, content] of Object.entries(value)) {
    if (typeof content === 'string') {
      changes.push({ path, action: 'update', content, language: languageFor(path) });
    } else if (content && typeof content === 'object') {
      const body = content.content ?? content.code ?? content.newContent;
      if (typeof body === 'string') {
        changes.push({
          path: content.path || path,
          action: String(content.action || content.type || 'update').toLowerCase(),
          content: body,
          language: content.language || languageFor(content.path || path),
        });
      }
    }
  }
  return changes;
}

/**
 * Accept JSON-shaped change sets (`{"files":[{"path":...,"content":...}]}`)
 * because several providers drift into JSON when asked for structured output.
 */
function parseJsonChangeSet(modelText) {
  for (const payload of jsonPayloads(modelText)) {
    try {
      const parsed = JSON.parse(payload);
      const changes = changesFromJsonValue(parsed);
      if (changes.length) {
        const seen = new Set();
        return changes.filter((change) => {
          if (!isSafeRelativePath(change.path) || seen.has(change.path)) return false;
          seen.add(change.path);
          return true;
        }).map((change) => ({
          ...change,
          path: cleanPath(change.path).replace(/^\/+/, ''),
          action: ['delete', 'remove'].includes(change.action) ? 'delete' : 'update',
        }));
      }
    } catch (error) {
      // Not JSON; try the next candidate.
    }
  }
  return [];
}

function stripDiffPrefix(value) {
  const cleaned = stripPathDecorations(String(value || '').split('\t')[0]);
  if (!cleaned || cleaned === '/dev/null') return cleaned;
  return cleaned.replace(/^[ab]\//, '').replace(/^\/+/, '');
}

/**
 * Apply unified diffs emitted directly by a model. Requires the original file
 * content so a bad or partial diff is skipped rather than guessed at.
 */
function parseDiffChangeSet(modelText, originalFiles = []) {
  const text = String(modelText || '');
  const start = text.search(/^(?:diff --git |--- )/m);
  if (start === -1) return [];

  let patches;
  try {
    patches = diff.parsePatch(text.slice(start));
  } catch (error) {
    return [];
  }

  const originals = indexOriginals(originalFiles);
  const changes = [];
  const seen = new Set();

  for (const patch of patches) {
    const oldPath = stripDiffPrefix(patch.oldFileName);
    const newPath = stripDiffPrefix(patch.newFileName);
    if (!oldPath && !newPath) continue;

    const isDelete = newPath === '/dev/null' || patch.newFileName === '/dev/null';
    const isCreate = oldPath === '/dev/null' || patch.oldFileName === '/dev/null';
    const filePath = isDelete ? oldPath : (newPath || oldPath);
    if (!filePath || filePath === '/dev/null' || !isSafeRelativePath(filePath) || seen.has(filePath)) continue;

    if (isDelete) {
      seen.add(filePath);
      changes.push({ path: filePath, action: 'delete', language: languageFor(filePath), content: '' });
      continue;
    }

    const oldContent = isCreate ? '' : (originals.get(filePath)?.content || '');
    if (!isCreate && !originals.has(filePath)) continue;
    let content;
    try {
      content = diff.applyPatch(oldContent, patch);
    } catch (error) {
      content = null;
    }
    if (typeof content !== 'string') continue;
    seen.add(filePath);
    changes.push({
      path: filePath,
      action: isCreate ? 'create' : 'update',
      language: languageFor(filePath),
      content: content.replace(/\n$/, ''),
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
  let parsed = parseChangeSet(modelText, originalFiles);
  if (!parsed.length) parsed = parseJsonChangeSet(modelText);
  if (!parsed.length) parsed = parseDiffChangeSet(modelText, originalFiles);
  return parsed.map((change) => {
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
    success: Boolean(commit.success),
    committed: Boolean(commit.success),
    commit: commit.commit || null,
    error: commit.error || null,
    reason: commit.reason || null,
  };
}

/**
 * Apply a change set to the VFS (CodeFile collection + search index). Called
 * only on approval, so agent work stays invisible until a human merges it.
 */
async function applyToVFS(workspaceId, changes, { userId = null, projectId = null } = {}) {
  let created = 0;
  let updated = 0;
  let deleted = 0;

  const safeChanges = (changes || [])
    .filter((change) => isSafeRelativePath(change.path))
    .map((change) => ({ change, ...splitPath(change.path) }));
  const uniquePaths = new Map(
    safeChanges.map(({ name, dir }) => [JSON.stringify([name, dir]), { name, path: dir }])
  );
  const existingFiles = uniquePaths.size
    ? await CodeFile.find({
      company: workspaceId,
      // Only files in the execution's own project (or unassigned files for a
      // task without a project) may be updated or deleted. Never touch another
      // project's source that shares the workspace.
      ...(projectId ? { project: String(projectId) } : { project: null }),
      $or: [...uniquePaths.values()],
    })
    : [];
  const filesByPath = new Map();
  for (const file of existingFiles) {
    const key = JSON.stringify([file.name, file.path]);
    if (!filesByPath.has(key)) filesByPath.set(key, file);
  }

  for (const { change, name, dir } of safeChanges) {
    const key = JSON.stringify([name, dir]);

    if (change.action === 'delete') {
      const existing = filesByPath.get(key);
      if (existing) {
        await existing.deleteOne();
        filesByPath.delete(key);
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
    const existing = filesByPath.get(key);

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
        ...(projectId ? { project: String(projectId) } : {}),
        createdBy: userId,
      });
      filesByPath.set(key, doc);
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

  const projectId = resolveProjectId({ execution });
  const result = await applyToVFS(workspaceId, changes, { userId: execution.userId, projectId });
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
  parseJsonChangeSet,
  parseDiffChangeSet,
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
