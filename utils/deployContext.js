/**
 * Deployment display/build context (branch / environment / commit / build
 * settings) asked for by the Deployment page (Figma 718:67538) and stored on
 * the Deployment document so the list + details screens show the branch and
 * build context the deploy was launched with, instead of deriving it from
 * the subdomain.
 *
 * These fields are metadata about the requested deployment — the Docker
 * build itself is still driven by utils/deploymentService (runtime is
 * auto-detected from the files). They are validated here so the API never
 * stores unbounded or malformed values.
 */

const MAX_BRANCH = 100;
const MAX_COMMIT = 64;
const MAX_TEXT = 200;
const MAX_FRAMEWORK = 40;
const MAX_REGION = 20;

const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;
const COMMIT_RE = /^[a-f0-9]{7,40}$/i;
const REGION_RE = /^[a-z0-9][a-z0-9-]*$/i;

function clean(value) {
    return typeof value === 'string' ? value.trim() : value;
}

function existingValue(existing, key) {
    if (!existing) return undefined;
    if (existing[key] !== undefined && existing[key] !== null) return existing[key];
    // Back-compat: values written into the free-form metadata map.
    const metadata = existing.metadata;
    if (!metadata) return undefined;
    if (typeof metadata.get === 'function') {
        const v = metadata.get(key);
        return v !== undefined && v !== null ? v : undefined;
    }
    const v = metadata[key];
    return v !== undefined && v !== null ? v : undefined;
}

function normalizeBranch(input, { existing, repo, project }) {
    const raw = clean(
        input.branch
        ?? input.defaultBranch
        ?? repo?.defaultBranch
        ?? repo?.default_branch
        ?? project?.defaultBranch
        ?? existingValue(existing, 'branch')
        ?? 'main'
    );
    if (typeof raw !== 'string' || !raw || raw.length > MAX_BRANCH
        || !BRANCH_RE.test(raw) || raw.includes('..') || raw.includes('//')
        || raw.endsWith('/') || raw.endsWith('.') || raw.includes('@{')) {
        throw new Error(`Invalid branch: ${String(raw || '')}`.slice(0, MAX_BRANCH + 20));
    }
    return raw;
}

function normalizeEnvironment(input, { existing, subdomain }) {
    const raw = clean(input.environment ?? existingValue(existing, 'environment'));
    if (raw === undefined || raw === null || raw === '') {
        return /preview|staging|stage|dev/.test(String(subdomain || '').toLowerCase()) ? 'Preview' : 'Production';
    }
    const value = String(raw).toLowerCase();
    if (['production', 'prod'].includes(value)) return 'Production';
    if (['preview', 'staging', 'stage', 'dev', 'development'].includes(value)) return 'Preview';
    throw new Error(`Invalid environment: ${raw}`);
}

function normalizeCommit(input, { existing, repo }) {
    const raw = clean(input.commit ?? input.commitSha ?? input.sha ?? repo?.commit ?? repo?.sha ?? existingValue(existing, 'commit'));
    if (raw === undefined || raw === null || raw === '') return null;
    const value = String(raw);
    if (value === 'latest') return 'latest';
    if (value.length > MAX_COMMIT || !COMMIT_RE.test(value)) {
        throw new Error(`Invalid commit: ${value}`.slice(0, MAX_COMMIT + 20));
    }
    return value;
}

function normalizeShortText(value, label, { max = MAX_TEXT, fallback = null } = {}) {
    const raw = clean(value);
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (typeof raw !== 'string' || raw.length > max || /[\u0000-\u001f\u007f]/.test(raw)) {
        throw new Error(`Invalid ${label}: ${String(raw || '')}`.slice(0, max + label.length + 4));
    }
    return raw;
}

function normalizeRegion(input, { existing }) {
    const raw = clean(input.region ?? existingValue(existing, 'region'));
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw !== 'string' || raw.length > MAX_REGION || !REGION_RE.test(raw)) {
        throw new Error(`Invalid region: ${raw}`);
    }
    return raw;
}

/**
 * Normalise the deployment context from a POST /api/deployments body.
 * Undefined fields preserve the existing deployment's values (redeploy
 * semantics); new deployments fall back to the repo/project defaults.
 * Throws an Error with a client-facing message on invalid values — the
 * route turns that into a 400.
 */
function normalizeDeployContext(input = {}, options = {}) {
    const body = input && typeof input === 'object' ? input : {};
    const existing = options.existing || null;

    const branch = normalizeBranch(body, { existing, repo: body.repo, project: options.project });
    const environment = normalizeEnvironment(body, { existing, subdomain: options.subdomain });
    const commit = normalizeCommit(body, { existing, repo: body.repo });
    const framework = normalizeShortText(
        body.framework ?? body.frameworkPreset ?? existingValue(existing, 'framework'),
        'framework',
        { max: MAX_FRAMEWORK }
    );
    const buildCommand = normalizeShortText(
        body.buildCommand ?? existingValue(existing, 'buildCommand'),
        'build command'
    );
    const rootDirectory = normalizeShortText(
        body.rootDirectory ?? body.rootDir ?? existingValue(existing, 'rootDirectory'),
        'root directory'
    );
    const outputDirectory = normalizeShortText(
        body.outputDirectory ?? body.outputDir ?? existingValue(existing, 'outputDirectory'),
        'output directory'
    );
    const region = normalizeRegion(body, { existing });

    return { branch, environment, commit, framework, buildCommand, rootDirectory, outputDirectory, region };
}

module.exports = {
    normalizeDeployContext,
    normalizeBranch,
    normalizeEnvironment,
    normalizeCommit,
};
