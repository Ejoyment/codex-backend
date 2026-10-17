/**
 * Unit tests for utils/agentChangeSet.js — the bridge between an agent's
 * textual proposal and the VFS/git apply paths.
 *
 * Models and services are mocked so nothing touches git or MongoDB.
 */
jest.mock('../models/CodeFile', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../utils/codeSearchService', () => ({ updateFile: jest.fn(), deleteFile: jest.fn() }));
jest.mock('../utils/gitService', () => ({ writeWorkingTree: jest.fn(), commitWorkingTree: jest.fn() }));

const CodeFile = require('../models/CodeFile');
const codeSearchService = require('../utils/codeSearchService');
const gitService = require('../utils/gitService');
const agentChangeSet = require('../utils/agentChangeSet');

describe('parseChangeSet', () => {
  test('pairs fenced blocks with the nearest preceding ### file: marker', () => {
    const text = [
      'Here is the plan.',
      '',
      '### file: src/foo.js',
      '```js',
      'const a = 1;',
      '```',
      '',
      '### file: src/bar.ts',
      '```ts',
      'export const b = 2;',
      '```',
    ].join('\n');

    const changes = agentChangeSet.parseChangeSet(text);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ path: 'src/foo.js', language: 'javascript', content: 'const a = 1;' });
    expect(changes[1]).toMatchObject({ path: 'src/bar.ts', language: 'typescript', content: 'export const b = 2;' });
  });

  test('supports an inline file= hint in the fence info string', () => {
    const changes = agentChangeSet.parseChangeSet('```py file=app/main.py\nprint(1)\n```');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: 'app/main.py', language: 'python', content: 'print(1)' });
  });

  test('parses ### delete: markers', () => {
    const changes = agentChangeSet.parseChangeSet('### delete: src/dead.js\n```\n\n```');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: 'src/dead.js', action: 'delete', content: '' });
  });

  test('drops unsafe paths and dedupes', () => {
    const text = [
      '### file: ../etc/passwd',
      '```',
      'x',
      '```',
      '### file: /abs/path.js',
      '```',
      'x',
      '```',
      '### file: src/ok.js',
      '```',
      'let x = 1;',
      '```',
      '### file: src/ok.js',
      '```',
      'let x = 2;',
      '```',
    ].join('\n');
    const changes = agentChangeSet.parseChangeSet(text);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('src/ok.js');
    expect(changes[0].content).toBe('let x = 1;');
  });
});

describe('buildChangeset / summarize', () => {
  const originals = [
    { path: '/src', name: 'a.js', language: 'javascript', content: 'const a = 1;\n' },
  ];

  test('resolves create/update/delete against the shown files', () => {
    const text = [
      '### file: src/a.js',
      '```js',
      'const a = 2;',
      '```',
      '### file: src/b.js',
      '```js',
      'const b = 3;',
      '```',
      '### delete: src/legacy.js',
      '```',
      '',
      '```',
    ].join('\n');

    const changes = agentChangeSet.buildChangeset(text, originals);
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c.action]));
    expect(byPath).toEqual({ 'src/a.js': 'update', 'src/b.js': 'create', 'src/legacy.js': 'delete' });
  });

  test('summarize produces per-file patches and line counts', () => {
    const changes = [
      { path: 'src/a.js', action: 'update', language: 'javascript', content: 'const a = 1;\nconst b = 2;\n' },
    ];
    const { filesChanged, diffSummary } = agentChangeSet.summarize(changes, originals);

    expect(filesChanged).toHaveLength(1);
    expect(filesChanged[0].path).toBe('src/a.js');
    expect(filesChanged[0].diff).toContain('@@');
    expect(diffSummary.filesChanged).toBe(1);
    expect(diffSummary.insertions).toBeGreaterThanOrEqual(1);
  });

  test('applyChangesToFileList preserves original shape and merges new files', () => {
    const changes = [
      { path: 'src/a.js', action: 'update', language: 'javascript', content: 'updated' },
      { path: 'lib/util.js', action: 'create', language: 'javascript', content: 'new' },
    ];
    const files = agentChangeSet.applyChangesToFileList(changes, originals);
    const a = files.find((f) => f.path === '/src' && f.name === 'a.js');
    const util = files.find((f) => f.name === 'util.js');
    expect(a.content).toBe('updated');
    expect(util).toMatchObject({ path: '/lib', name: 'util.js', content: 'new' });
  });
});

describe('stageChanges', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes then commits on the agent branch', async () => {
    gitService.writeWorkingTree.mockResolvedValue({ success: true, written: 1 });
    gitService.commitWorkingTree.mockResolvedValue({ success: true, commit: 'abc123' });

    const result = await agentChangeSet.stageChanges('ws', [{ path: 'src/a.js', action: 'update', content: 'x' }], { message: 'msg', branch: 'feature/x' });

    expect(gitService.writeWorkingTree).toHaveBeenCalledWith('ws', expect.any(Array));
    expect(gitService.commitWorkingTree).toHaveBeenCalledWith('ws', 'msg', 'feature/x');
    expect(result).toMatchObject({ success: true, committed: true, commit: 'abc123' });
  });

  test('reports write failures without committing', async () => {
    gitService.writeWorkingTree.mockResolvedValue({ success: false, error: 'boom' });
    const result = await agentChangeSet.stageChanges('ws', [{ path: 'x', action: 'update', content: 'y' }]);
    expect(result).toMatchObject({ success: false, error: 'boom' });
    expect(gitService.commitWorkingTree).not.toHaveBeenCalled();
  });
});

describe('applyToVFS', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates, updates and deletes files then syncs the search index', async () => {
    const created = { _id: 'c1', name: 'new.js', path: '/src', language: 'javascript', content: 'n' };
    CodeFile.create.mockResolvedValue(created);

    const updatable = { _id: 'u1', name: 'a.js', path: '/src', content: 'old', save: jest.fn(async function () { return this; }) };
    const deletable = { _id: 'd1', name: 'dead.js', path: '/src', deleteOne: jest.fn(async () => {}) };

    CodeFile.findOne.mockImplementation(({ name }) => {
      if (name === 'new.js') return Promise.resolve(null);
      if (name === 'a.js') return Promise.resolve(updatable);
      if (name === 'dead.js') return Promise.resolve(deletable);
      return Promise.resolve(null);
    });

    const result = await agentChangeSet.applyToVFS('ws', [
      { path: 'src/new.js', action: 'create', language: 'javascript', content: 'n' },
      { path: 'src/a.js', action: 'update', language: 'javascript', content: 'new body' },
      { path: 'src/dead.js', action: 'delete' },
    ], { userId: 'user1' });

    expect(CodeFile.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'new.js', path: '/src', company: 'ws', createdBy: 'user1' }));
    expect(updatable.save).toHaveBeenCalled();
    expect(updatable.content).toBe('new body');
    expect(deletable.deleteOne).toHaveBeenCalled();
    expect(codeSearchService.updateFile).toHaveBeenCalledTimes(2);
    expect(codeSearchService.deleteFile).toHaveBeenCalledWith('d1');
    expect(result).toMatchObject({ success: true, created: 1, updated: 1, deleted: 1, applied: 3 });
  });

  test('ignores unsafe paths', async () => {
    const result = await agentChangeSet.applyToVFS('ws', [{ path: '../evil', action: 'create', content: 'x' }], { userId: 'u' });
    expect(CodeFile.create).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
  });
});

describe('applyExecutionChanges', () => {
  test('no-ops when the execution has no workspace or no changes', async () => {
    const noMeta = await agentChangeSet.applyExecutionChanges({ proposedChanges: [{ path: 'x', action: 'update', content: 'y' }] });
    expect(noMeta.applied).toBe(false);
    expect(noMeta.reason).toMatch(/workspace/);

    const noChanges = await agentChangeSet.applyExecutionChanges({ metadata: { get: () => 'ws' }, proposedChanges: [] });
    expect(noChanges.applied).toBe(false);
    expect(noChanges.reason).toMatch(/no proposed changes/);
  });
});

describe('helpers', () => {
  test('CHANGE_FORMAT_INSTRUCTIONS tells the model the marker format', () => {
    expect(agentChangeSet.CHANGE_FORMAT_INSTRUCTIONS).toMatch(/### file:/);
  });

  test('isSafeRelativePath rejects traversal and absolute paths', () => {
    expect(agentChangeSet.isSafeRelativePath('src/a.js')).toBe(true);
    expect(agentChangeSet.isSafeRelativePath('../a.js')).toBe(false);
    expect(agentChangeSet.isSafeRelativePath('/a.js')).toBe(false);
    expect(agentChangeSet.isSafeRelativePath('-flag')).toBe(false);
  });
});
