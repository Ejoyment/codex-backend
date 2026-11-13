/**
 * Bound the context snapshot stored on an AgentExecution.
 *
 * `contextSnapshot` is an inline Mixed subdocument, and MongoDB rejects a
 * document larger than 16 MB. Delegation used to mirror every project file's
 * full contents into the snapshot, so a large imported repository (hundreds of
 * files, tens of MB) made `AgentExecution.create` fail with "Document too
 * large" — surfaced to the user as a generic 500.
 *
 * The agent worker reads live CodeFiles for the project, so the snapshot only
 * has to be a useful *fallback*: a manifest of every file plus the content of
 * as many small files as fit a fixed budget. A final shrink pass drops optional
 * heavy sections if a project is still unusually large.
 */

// Leave headroom below Mongo's 16 MB document limit: the execution also stores
// logs, terminal output and (later) proposed changes.
const MAX_SNAPSHOT_BYTES = 6 * 1024 * 1024;
const MAX_SNAPSHOT_CONTENT_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_FILE_BYTES = 256 * 1024;
const MAX_SNAPSHOT_CONTENT_FILES = 500;

function byteSize(value) {
    try {
        return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
    } catch {
        return Infinity;
    }
}

/**
 * Build a size-bounded codebase snapshot.
 *
 * Every file is listed in the manifest so the agent can still see the shape of
 * the project. `content` is attached only while it fits the per-file and total
 * budgets; oversized and metadata-only (content-omitted) files keep just their
 * size.
 */
function buildCodebaseSnapshot(files = [], options = {}) {
    const {
        branch = null,
        maxFileBytes = MAX_SNAPSHOT_FILE_BYTES,
        maxContentBytes = MAX_SNAPSHOT_CONTENT_BYTES,
    } = options;

    const list = Array.isArray(files) ? files : [];
    let contentBytes = 0;
    let contentFiles = 0;

    const entries = list.map((file) => {
        const content = typeof file?.content === 'string' ? file.content : '';
        const bytes = Buffer.byteLength(content, 'utf8');
        const entry = {
            path: file?.path || file?.name || '',
            name: file?.name || '',
            language: file?.language || null,
            bytes,
        };
        if (bytes > 0 && bytes <= maxFileBytes && contentBytes + bytes <= maxContentBytes) {
            entry.content = content;
            contentBytes += bytes;
            contentFiles += 1;
        }
        return entry;
    });

    return {
        branch,
        fileCount: entries.length,
        contentFiles,
        contentBytes,
        files: entries,
    };
}

/**
 * Choose which files' bodies are worth fetching for the snapshot.
 *
 * Delegation runs against projects of any size, so it must not load every
 * file's content into memory just to keep a 2 MB fallback. Given a metadata
 * manifest (with `size`), return the smallest text files whose declared sizes
 * fit the content budget. Binary (`encoding: 'base64'`) and content-omitted
 * files are skipped: their bodies are not useful prompt context.
 *
 * Returns manifest entries (not paths): imported projects store `path` as the
 * containing directory, so only `_id` identifies a file uniquely.
 */
function selectSnapshotContentFiles(manifest, options = {}) {
    const {
        maxFileBytes = MAX_SNAPSHOT_FILE_BYTES,
        maxContentBytes = MAX_SNAPSHOT_CONTENT_BYTES,
        maxFiles = MAX_SNAPSHOT_CONTENT_FILES,
    } = options;

    let remaining = maxContentBytes;
    const candidates = (Array.isArray(manifest) ? manifest : [])
        .filter((file) => file
            && file._id
            && file.contentOmitted !== true
            && file.encoding !== 'base64')
        .map((file) => ({ file, size: Number(file.size) || 0 }))
        .filter(({ size }) => size > 0 && size <= maxFileBytes)
        .sort((a, b) => a.size - b.size);

    const selected = [];
    for (const { file, size } of candidates) {
        if (selected.length >= maxFiles) break;
        if (size > remaining) continue;
        remaining -= size;
        selected.push(file);
    }
    return selected;
}

function stripFileContent(snapshot) {
    const files = snapshot?.codebaseSnapshot?.files;
    if (!Array.isArray(files)) return false;
    let changed = false;
    for (const file of files) {
        if (file && Object.prototype.hasOwnProperty.call(file, 'content')) {
            delete file.content;
            changed = true;
        }
    }
    return changed;
}

function stripSpecContent(snapshot) {
    if (!Array.isArray(snapshot?.specs)) return false;
    let changed = false;
    snapshot.specs = snapshot.specs.map((spec) => {
        if (spec && Object.prototype.hasOwnProperty.call(spec, 'content')) {
            changed = true;
            const { content, ...rest } = spec;
            return rest;
        }
        return spec;
    });
    return changed;
}

/**
 * Drop optional sections until the snapshot fits `maxBytes`.
 *
 * Order matters: file contents are the largest and least essential (the worker
 * loads live files), then the derived context bundle and Figma tree, then spec
 * bodies. The file manifest, ids and task text go last because they are cheap
 * and keep the run debuggable.
 */
function shrinkContextSnapshot(snapshot, maxBytes = MAX_SNAPSHOT_BYTES) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    if (byteSize(snapshot) <= maxBytes) return snapshot;

    const steps = [
        () => stripFileContent(snapshot),
        () => {
            if (snapshot.contextBundle === undefined) return false;
            delete snapshot.contextBundle;
            return true;
        },
        () => {
            if (snapshot.figmaContext === undefined) return false;
            delete snapshot.figmaContext;
            return true;
        },
        () => stripSpecContent(snapshot),
        () => {
            if (!snapshot.codebaseSnapshot || !snapshot.codebaseSnapshot.files?.length) return false;
            snapshot.codebaseSnapshot.files = [];
            return true;
        },
    ];

    for (const step of steps) {
        if (byteSize(snapshot) <= maxBytes) break;
        step();
    }

    snapshot.truncated = true;
    snapshot.maxBytes = maxBytes;
    return snapshot;
}

module.exports = {
    MAX_SNAPSHOT_BYTES,
    MAX_SNAPSHOT_CONTENT_BYTES,
    MAX_SNAPSHOT_FILE_BYTES,
    MAX_SNAPSHOT_CONTENT_FILES,
    byteSize,
    buildCodebaseSnapshot,
    selectSnapshotContentFiles,
    shrinkContextSnapshot,
};
