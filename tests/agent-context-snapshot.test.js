/**
 * Regression coverage for the delegated-agent context snapshot.
 *
 * A large imported repository used to be mirrored into
 * `AgentExecution.contextSnapshot.codebaseSnapshot.files` in full, which blew
 * past MongoDB's 16 MB document limit and turned "Delegate to AI" into a
 * generic 500. The snapshot must stay bounded no matter how big the project is.
 */
const {
  MAX_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_CONTENT_BYTES,
  MAX_SNAPSHOT_FILE_BYTES,
  byteSize,
  buildCodebaseSnapshot,
  selectSnapshotContentFiles,
  shrinkContextSnapshot,
} = require('../utils/agentContextSnapshot');

const file = (path, content) => ({
  path,
  name: path.split('/').pop(),
  language: 'javascript',
  content,
});

describe('buildCodebaseSnapshot', () => {
  test('lists every file even when contents are dropped', () => {
    const files = [
      file('src/a.js', 'a'.repeat(100)),
      file('src/huge.js', 'h'.repeat(MAX_SNAPSHOT_FILE_BYTES + 1)),
      { path: 'assets/logo.png', name: 'logo.png', language: null, contentOmitted: true },
    ];

    const snapshot = buildCodebaseSnapshot(files, { branch: 'main' });

    expect(snapshot.branch).toBe('main');
    expect(snapshot.fileCount).toBe(3);
    expect(snapshot.files.map((entry) => entry.path)).toEqual([
      'src/a.js',
      'src/huge.js',
      'assets/logo.png',
    ]);
    expect(snapshot.files[0].content).toBe('a'.repeat(100));
    // Oversized files keep their size but not their body.
    expect(snapshot.files[1].content).toBeUndefined();
    expect(snapshot.files[1].bytes).toBe(MAX_SNAPSHOT_FILE_BYTES + 1);
    // Metadata-only imports have no body at all.
    expect(snapshot.files[2].content).toBeUndefined();
    expect(snapshot.files[2].bytes).toBe(0);
  });

  test('caps total embedded content at the budget', () => {
    const files = Array.from({ length: 40 }, (_, index) =>
      file(`src/file-${index}.js`, 'x'.repeat(200 * 1024))
    );

    const snapshot = buildCodebaseSnapshot(files);

    expect(snapshot.fileCount).toBe(40);
    expect(snapshot.contentBytes).toBeLessThanOrEqual(MAX_SNAPSHOT_CONTENT_BYTES);
    expect(snapshot.contentFiles).toBeLessThan(files.length);
    const embedded = snapshot.files.reduce(
      (total, entry) => total + Buffer.byteLength(entry.content || '', 'utf8'),
      0
    );
    expect(embedded).toBe(snapshot.contentBytes);
  });

  test('a repository far larger than the document limit still fits the budget', () => {
    // 641 files x ~36 KB ≈ 23 MB, the shape of the imported project that
    // triggered the failure.
    const files = Array.from({ length: 641 }, (_, index) =>
      file(`src/generated/file-${index}.js`, 'y'.repeat(36 * 1024))
    );

    const snapshot = buildCodebaseSnapshot(files);

    expect(byteSize(snapshot)).toBeLessThan(16 * 1024 * 1024);
    expect(byteSize(snapshot)).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
  });
});

describe('selectSnapshotContentFiles', () => {
  let nextId = 0;
  const entry = (path, size, over = {}) => ({ _id: `id-${nextId += 1}`, path, size, ...over });
  const names = (files) => files.map((file) => file.path);

  test('picks the smallest files that fit the content budget', () => {
    const manifest = [
      entry('src/big.js', 200 * 1024),
      entry('src/small.js', 1 * 1024),
      entry('src/medium.js', 100 * 1024),
    ];

    expect(names(selectSnapshotContentFiles(manifest, { maxContentBytes: 101 * 1024 })))
      .toEqual(['src/small.js', 'src/medium.js']);
  });

  test('skips binary, omitted and oversized files', () => {
    const manifest = [
      entry('src/a.js', 10),
      entry('assets/logo.png', 10, { encoding: 'base64' }),
      entry('assets/video.mp4', 10, { contentOmitted: true }),
      entry('src/huge.js', MAX_SNAPSHOT_FILE_BYTES + 1),
      entry('src/no-size.js', 0),
      { path: 'src/no-id.js', size: 10 },
    ];

    expect(names(selectSnapshotContentFiles(manifest))).toEqual(['src/a.js']);
  });

  test('caps how many files are fetched', () => {
    const manifest = Array.from({ length: 20 }, (_, index) => entry(`src/${index}.js`, 1));
    expect(selectSnapshotContentFiles(manifest, { maxFiles: 5 })).toHaveLength(5);
  });

  test('returns nothing for an empty manifest', () => {
    expect(selectSnapshotContentFiles([])).toEqual([]);
    expect(selectSnapshotContentFiles(null)).toEqual([]);
  });
});

describe('shrinkContextSnapshot', () => {
  test('leaves a small snapshot untouched', () => {
    const snapshot = {
      task: { title: 'small' },
      specs: [{ _id: 'a'.repeat(24), content: 'spec body' }],
      codebaseSnapshot: buildCodebaseSnapshot([file('src/a.js', 'hello')]),
    };

    expect(shrinkContextSnapshot(snapshot)).toBe(snapshot);
    expect(snapshot.truncated).toBeUndefined();
    expect(snapshot.codebaseSnapshot.files[0].content).toBe('hello');
  });

  test('drops heavy sections until the snapshot fits and records the truncation', () => {
    const snapshot = {
      task: { title: 'huge' },
      specs: [{ _id: 'a'.repeat(24), content: 's'.repeat(512 * 1024) }],
      codebaseSnapshot: {
        branch: 'main',
        files: [file('src/a.js', 'c'.repeat(512 * 1024))],
      },
      contextBundle: { blob: 'b'.repeat(512 * 1024) },
      figmaContext: { blob: 'f'.repeat(512 * 1024) },
    };
    expect(byteSize(snapshot)).toBeGreaterThan(1024 * 1024);

    const shrunk = shrinkContextSnapshot(snapshot, 1024 * 1024);

    expect(byteSize(shrunk)).toBeLessThanOrEqual(1024 * 1024);
    expect(shrunk.truncated).toBe(true);
    expect(shrunk.maxBytes).toBe(1024 * 1024);
    // Identity and manifest survive so the run stays debuggable.
    expect(shrunk.task.title).toBe('huge');
    expect(shrunk.codebaseSnapshot.files.map((entry) => entry.path)).toContain('src/a.js');
  });

  test('never throws on an empty or malformed snapshot', () => {
    expect(shrinkContextSnapshot(null)).toBeNull();
    expect(shrinkContextSnapshot(undefined)).toBeUndefined();
    expect(shrinkContextSnapshot({}, 0)).toEqual({ truncated: true, maxBytes: 0 });
  });
});
