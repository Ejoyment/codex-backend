const LocalProject = require('../models/LocalProject');
const CodeFile = require('../models/CodeFile');
const vfs = require('./virtualFileSystem');
const { ensurePersonalWorkspace } = require('./personalWorkspace');
const { getGitHubIntegration, githubAPI } = require('./githubApiClient');
const { listRepoTree } = require('./githubTree');

// There is deliberately no file-count or total-size limit here. Large
// repositories are imported in batches and large individual files are listed
// with `contentOmitted` so deployment can stream their bytes from GitHub
// instead of storing them in a single MongoDB document (16MB hard limit).
const PROVISIONING_LIMITS = {
    concurrency: 8,
    batchSize: 200,
    maxStoredContentBytes: 8 * 1024 * 1024
};

// Only directories that are never useful in a deployed build are skipped.
// Build output (dist/build/.next), vendored dependencies and generated assets
// are intentionally imported: a prebuilt static site or a committed vendor
// tree must deploy exactly as it exists in the repository.
const SKIPPED_DIRECTORIES = new Set([
    '.git',
    '.hg',
    '.svn',
    '.turbo',
    '.venv',
    'venv',
    'node_modules',
    'bower_components',
    '__pycache__',
    'Pods',
    'DerivedData'
]);

const SECRET_FILE_NAMES = new Set([
    '.env',
    '.netrc',
    'id_dsa',
    'id_ed25519',
    'id_rsa'
]);

const LANGUAGE_BY_EXTENSION = {
    '.bash': 'shell',
    '.c': 'c',
    '.cjs': 'javascript',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.css': 'css',
    '.go': 'go',
    '.h': 'c',
    '.hpp': 'cpp',
    '.html': 'html',
    '.java': 'java',
    '.js': 'javascript',
    '.json': 'json',
    '.jsx': 'javascript',
    '.kt': 'kotlin',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.mjs': 'javascript',
    '.php': 'php',
    '.py': 'python',
    '.rb': 'ruby',
    '.rs': 'rust',
    '.scss': 'scss',
    '.sh': 'shell',
    '.sql': 'sql',
    '.swift': 'swift',
    '.toml': 'toml',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.txt': 'text',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml'
};

const TEMPLATE_FILES = {
    'Full-stack web application': () => [
        {
            path: '/',
            name: 'package.json',
            language: 'json',
            content: `${JSON.stringify({
                name: 'full-stack-app',
                version: '0.1.0',
                private: true,
                scripts: {
                    dev: 'next dev',
                    build: 'next build',
                    start: 'next start'
                },
                dependencies: {
                    next: '^15.4.7',
                    react: '18.2.0',
                    'react-dom': '18.2.0'
                },
                devDependencies: {
                    '@types/node': '^22.10.0',
                    '@types/react': '^18.3.0',
                    '@types/react-dom': '^18.3.0',
                    typescript: '^5.9.3'
                }
            }, null, 2)}\n`
        },
        {
            path: '/',
            name: 'tsconfig.json',
            language: 'json',
            content: `${JSON.stringify({
                compilerOptions: {
                    target: 'ES2017',
                    lib: ['dom', 'dom.iterable', 'esnext'],
                    allowJs: true,
                    skipLibCheck: true,
                    strict: true,
                    noEmit: true,
                    esModuleInterop: true,
                    module: 'esnext',
                    moduleResolution: 'bundler',
                    resolveJsonModule: true,
                    isolatedModules: true,
                    jsx: 'preserve',
                    incremental: true,
                    plugins: [{ name: 'next' }],
                    paths: { '@/*': ['./*'] }
                },
                include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
                exclude: ['node_modules']
            }, null, 2)}\n`
        },
        {
            path: '/',
            name: 'next.config.js',
            language: 'javascript',
            content: "/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = nextConfig;\n"
        },
        {
            path: '/app',
            name: 'layout.tsx',
            language: 'typescript',
            content: "import type { Metadata } from 'next';\nimport './globals.css';\n\nexport const metadata: Metadata = {\n  title: 'New application',\n  description: 'Built with BuildrsHQ',\n};\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang=\"en\">\n      <body>{children}</body>\n    </html>\n  );\n}\n"
        },
        {
            path: '/app',
            name: 'page.tsx',
            language: 'typescript',
            content: "export default function Home() {\n  return (\n    <main>\n      <h1>Your application is ready</h1>\n      <p>Start building in the editor.</p>\n    </main>\n  );\n}\n"
        },
        {
            path: '/app',
            name: 'globals.css',
            language: 'css',
            content: ":root {\n  color-scheme: light dark;\n  font-family: system-ui, sans-serif;\n}\n\nbody {\n  margin: 0;\n  padding: 2rem;\n}\n"
        }
    ],
    'TypeScript API Service': () => [
        {
            path: '/',
            name: 'package.json',
            language: 'json',
            content: `${JSON.stringify({
                name: 'typescript-api-service',
                version: '0.1.0',
                private: true,
                scripts: {
                    dev: 'tsx watch src/index.ts',
                    build: 'tsc',
                    start: 'node dist/index.js'
                },
                dependencies: {
                    express: '^4.18.2'
                },
                devDependencies: {
                    '@types/express': '^5.0.0',
                    '@types/node': '^22.10.0',
                    tsx: '^4.19.0',
                    typescript: '^5.9.3'
                }
            }, null, 2)}\n`
        },
        {
            path: '/',
            name: 'tsconfig.json',
            language: 'json',
            content: `${JSON.stringify({
                compilerOptions: {
                    target: 'ES2022',
                    module: 'NodeNext',
                    moduleResolution: 'NodeNext',
                    outDir: 'dist',
                    rootDir: 'src',
                    strict: true,
                    esModuleInterop: true,
                    skipLibCheck: true
                },
                include: ['src/**/*.ts']
            }, null, 2)}\n`
        },
        {
            path: '/src',
            name: 'index.ts',
            language: 'typescript',
            content: "import express from 'express';\n\nconst app = express();\nconst port = Number(process.env.PORT || 3000);\n\napp.get('/health', (_req, res) => {\n  res.json({ ok: true });\n});\n\napp.listen(port, () => {\n  console.log(`API listening on port ${port}`);\n});\n"
        }
    ],
    'React Native application': () => [
        {
            path: '/',
            name: 'package.json',
            language: 'json',
            content: `${JSON.stringify({
                name: 'react-native-application',
                version: '0.1.0',
                private: true,
                main: 'expo/AppEntry.js',
                scripts: {
                    start: 'expo start',
                    android: 'expo start --android',
                    ios: 'expo start --ios'
                },
                dependencies: {
                    expo: '~52.0.0',
                    react: '18.3.1',
                    'react-native': '0.76.5'
                },
                devDependencies: {
                    '@types/react': '~18.3.12',
                    typescript: '^5.9.3'
                }
            }, null, 2)}\n`
        },
        {
            path: '/',
            name: 'app.json',
            language: 'json',
            content: `${JSON.stringify({
                expo: {
                    name: 'New application',
                    slug: 'new-application',
                    version: '1.0.0',
                    orientation: 'portrait',
                    userInterfaceStyle: 'automatic'
                }
            }, null, 2)}\n`
        },
        {
            path: '/',
            name: 'App.tsx',
            language: 'typescript',
            content: "import { StatusBar } from 'expo-status-bar';\nimport { StyleSheet, Text, View } from 'react-native';\n\nexport default function App() {\n  return (\n    <View style={styles.container}>\n      <Text>Your application is ready</Text>\n      <StatusBar style=\"auto\" />\n    </View>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: {\n    flex: 1,\n    alignItems: 'center',\n    justifyContent: 'center',\n  },\n});\n"
        }
    ]
};

const GITIGNORE_CONTENT = [
    'node_modules/',
    '.next/',
    'dist/',
    'build/',
    'coverage/',
    '.env',
    '.env.*',
    '!.env.example',
    '.DS_Store',
    '*.log',
    ''
].join('\n');

function provisioningError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function normalizeRepoName(value) {
    let raw = String(value || '').trim();
    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password) {
                throw new Error('Invalid repository URL');
            }
            raw = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
        } catch {
            throw provisioningError('INVALID_REPOSITORY', 'A valid GitHub repository is required.');
        }
    }

    const parts = raw.split('/');
    if (parts.length !== 2) {
        throw provisioningError('INVALID_REPOSITORY', 'A valid GitHub repository is required.');
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (
        !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) ||
        !/^[A-Za-z0-9._-]{1,100}$/.test(repo) ||
        repo === '.' ||
        repo === '..'
    ) {
        throw provisioningError('INVALID_REPOSITORY', 'A valid GitHub repository is required.');
    }

    return {
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        url: `https://github.com/${owner}/${repo}`
    };
}

function normalizeBranch(value) {
    const branch = String(value || '').trim();
    if (
        !branch ||
        branch.length > 128 ||
        branch.startsWith('-') ||
        branch.startsWith('/') ||
        branch.endsWith('/') ||
        branch.includes('..') ||
        branch.includes('@{') ||
        branch.includes(':') ||
        branch.includes('\\') ||
        !/^[A-Za-z0-9._/-]+$/.test(branch)
    ) {
        throw provisioningError('INVALID_BRANCH', 'A valid branch name is required.');
    }
    return branch;
}

function languageForPath(filePath) {
    const lower = String(filePath || '').toLowerCase();
    const base = lower.split('/').pop();
    if (base === 'dockerfile') return 'dockerfile';
    if (base === 'makefile') return 'makefile';
    const extension = lower.includes('.') ? `.${lower.split('.').pop()}` : '';
    return LANGUAGE_BY_EXTENSION[extension] || 'text';
}

function splitRepoPath(repoPath) {
    const clean = String(repoPath || '').replace(/^\/+/, '');
    const parts = clean.split('/').filter(Boolean);
    if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null;

    const name = parts.pop();
    const path = parts.length ? `/${parts.join('/')}` : '/';
    return { path, name, fullPath: `/${clean}` };
}

function shouldSkipPath(repoPath) {
    const clean = String(repoPath || '').replace(/^\/+/, '');
    const parts = clean.split('/').filter(Boolean);
    if (!parts.length) return true;
    if (parts.some((part) => SKIPPED_DIRECTORIES.has(part))) return true;

    const base = parts[parts.length - 1].toLowerCase();
    if (SECRET_FILE_NAMES.has(base)) return true;
    if (base.startsWith('.env.') && base !== '.env.example') return true;
    if (base.endsWith('.pem') || base.endsWith('.key') || base.endsWith('.p12') || base.endsWith('.jks')) return true;

    // Binary assets (images, fonts, archives, ...) are imported too: they are
    // part of the deployable project and are stored base64-encoded.
    return false;
}

function isBinaryBuffer(buffer) {
    if (!buffer || buffer.length === 0) return false;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    if (sample.includes(0)) return true;

    let controlBytes = 0;
    for (const byte of sample) {
        if (byte < 7 || (byte > 13 && byte < 32)) controlBytes += 1;
    }
    return controlBytes / sample.length > 0.1;
}

function safeProvisioningMessage(error) {
    if (error?.code === 'GITHUB_NOT_CONNECTED') {
        return 'Connect GitHub before importing a repository.';
    }
    if (error?.code === 'INVALID_REPOSITORY') {
        return 'A valid GitHub repository is required.';
    }
    if (error?.code === 'INVALID_BRANCH') {
        return 'A valid branch name is required.';
    }
    if (error?.code === 'INVALID_TEMPLATE') {
        return 'Choose a supported project template.';
    }
    if (error?.code === 'REPOSITORY_TOO_LARGE') {
        return 'This repository is too large to import. Try a smaller repository or branch.';
    }
    if (error?.code === 'NO_IMPORTABLE_FILES') {
        return 'This repository has no importable text files.';
    }
    if (error?.response?.status === 401) {
        return 'GitHub authorization expired. Reconnect GitHub and try again.';
    }
    if (error?.response?.status === 403) {
        return 'GitHub denied access to this repository or the rate limit was reached.';
    }
    if (error?.response?.status === 404) {
        return 'Repository or branch not found, or your GitHub account cannot access it.';
    }
    return 'Project setup failed. Retry setup or contact support.';
}

async function ensureProjectWorkspace(project) {
    if (project.workspaceId) return project.workspaceId;
    const workspace = await ensurePersonalWorkspace(project.userId);
    project.workspaceId = String(workspace._id);
    await project.save();
    return project.workspaceId;
}

function storedSize(file) {
    if (Number.isFinite(file.size)) return file.size;
    if (file.encoding === 'base64') {
        return Buffer.byteLength(String(file.content || ''), 'base64');
    }
    return Buffer.byteLength(String(file.content || ''), 'utf8');
}

async function writeProjectFiles(project, userId, files) {
    if (!files.length) return 0;

    const workspaceId = await ensureProjectWorkspace(project);
    const now = new Date();
    const batchSize = 100;
    let written = 0;

    // Chunk the writes: a 10k-file repository produces a bulkWrite payload too
    // large to build (and hold) in one operation.
    for (let offset = 0; offset < files.length; offset += batchSize) {
        const batch = files.slice(offset, offset + batchSize);
        const operations = batch.map((file) => ({
            updateOne: {
                filter: {
                    project: project._id,
                    company: workspaceId,
                    path: file.path,
                    name: file.name
                },
                update: {
                    $set: {
                        language: file.language,
                        content: file.content,
                        encoding: file.encoding === 'base64' ? 'base64' : undefined,
                        contentOmitted: file.contentOmitted === true,
                        lastModifiedBy: userId,
                        updatedAt: now,
                        size: storedSize(file)
                    },
                    $setOnInsert: {
                        createdBy: userId,
                        createdAt: now
                    }
                },
                upsert: true
            }
        }));

        try {
            await CodeFile.bulkWrite(operations, { ordered: false, timestamps: false });
            written += batch.length;
        } catch (error) {
            console.warn(
                `[provisioning] bulk write failed for ${batch.length} file(s): ${error.message}; retrying individually`
            );
            // Isolate a single unwritable document (e.g. an unexpectedly huge
            // file) instead of losing the rest of the batch.
            for (const operation of operations) {
                try {
                    await CodeFile.bulkWrite([operation], { ordered: false, timestamps: false });
                    written += 1;
                } catch (opError) {
                    const path = operation.updateOne.filter.path;
                    const name = operation.updateOne.filter.name;
                    console.warn(`[provisioning] skipped ${path}/${name}: ${opError.message}`);
                }
            }
        }
    }

    vfs.invalidateIndex(String(workspaceId));
    return written;
}

function starterSpec(project) {
    const technologies = Array.isArray(project.technologies) && project.technologies.length
        ? project.technologies.join(', ')
        : 'Not specified';

    return [
        `# ${project.name} specification`,
        '',
        '## Overview',
        project.description || 'Describe the product outcome this project owns.',
        '',
        '## Stack',
        technologies,
        '',
        '## First milestones',
        '- Confirm the primary user journey.',
        '- Define the first shippable slice.',
        '- Break the slice into tasks with acceptance criteria.',
        ''
    ].join('\n');
}

function baseProjectFiles(project) {
    const files = [
        {
            path: '/',
            name: 'README.md',
            language: 'markdown',
            content: `# ${project.name}\n\n${project.description || 'A new BuildrsHQ project.'}\n`
        },
        {
            path: '/',
            name: '.gitignore',
            language: 'text',
            content: GITIGNORE_CONTENT
        }
    ];

    if (project.intelligence?.starterSpec !== false) {
        files.push({
            path: '/',
            name: 'SPEC.md',
            language: 'markdown',
            content: starterSpec(project)
        });
    }

    return files;
}

async function provisionScratch(project) {
    return baseProjectFiles(project);
}

async function provisionTemplate(project) {
    const templateName = String(project.template || '').trim();
    const template = TEMPLATE_FILES[templateName];
    if (!template) {
        throw provisioningError('INVALID_TEMPLATE', 'Unsupported project template.');
    }
    return [...baseProjectFiles(project), ...template()];
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(items[index], index);
        }
    }

    const workers = Array.from(
        { length: Math.min(Math.max(limit, 1), items.length) },
        () => worker()
    );
    await Promise.all(workers);
    return results;
}

async function fetchBlob(accessToken, owner, repo, sha) {
    const blob = await githubAPI(
        accessToken,
        `/repos/${owner}/${repo}/git/blobs/${sha}`,
        'GET',
        null,
        { timeout: 120000 }
    );
    if (blob.encoding === 'base64') {
        return Buffer.from(blob.content || '', 'base64');
    }
    return Buffer.from(blob.content || '', 'utf8');
}

async function importGitHub(project, userId) {
    const integration = await getGitHubIntegration(userId);
    const repoRef = normalizeRepoName(project.githubRepoName || project.githubRepoUrl);
    const repoData = await githubAPI(integration.accessToken, `/repos/${repoRef.owner}/${repoRef.repo}`);
    const branch = normalizeBranch(project.defaultBranch || repoData.default_branch || 'main');

    const refData = await githubAPI(
        integration.accessToken,
        `/repos/${repoRef.owner}/${repoRef.repo}/git/ref/heads/${encodeURIComponent(branch)}`
    );
    const commitData = await githubAPI(
        integration.accessToken,
        `/repos/${repoRef.owner}/${repoRef.repo}/git/commits/${refData.object.sha}`
    );
    // Never rejects a repository because GitHub's recursive tree response was
    // truncated; the helper walks directories instead.
    const tree = await listRepoTree(
        integration.accessToken,
        repoRef.owner,
        repoRef.repo,
        commitData.tree.sha,
        { concurrency: PROVISIONING_LIMITS.concurrency }
    );

    const candidates = tree.filter((item) => (
        item.type === 'blob' &&
        !shouldSkipPath(item.path)
    ));

    if (!candidates.length) {
        throw provisioningError('NO_IMPORTABLE_FILES', 'Repository has no importable files.');
    }

    project.githubRepoName = repoRef.fullName;
    project.githubRepoUrl = repoRef.url;
    project.defaultBranch = branch;
    await project.save();

    // Fetch + persist in batches so a huge repository never needs every blob
    // in memory at once.
    let written = 0;
    for (let offset = 0; offset < candidates.length; offset += PROVISIONING_LIMITS.batchSize) {
        const batch = candidates.slice(offset, offset + PROVISIONING_LIMITS.batchSize);
        const imported = await mapWithConcurrency(
            batch,
            PROVISIONING_LIMITS.concurrency,
            async (item) => {
                const split = splitRepoPath(item.path);
                if (!split) return null;

                const declaredSize = Number(item.size) || 0;
                const base = {
                    path: split.path,
                    name: split.name,
                    language: languageForPath(split.fullPath),
                    size: declaredSize
                };

                // Above the MongoDB-safe content size, list the file without
                // fetching it. Deployment streams the bytes from GitHub.
                if (declaredSize > PROVISIONING_LIMITS.maxStoredContentBytes) {
                    return { ...base, content: '', contentOmitted: true };
                }

                let buffer;
                try {
                    buffer = await fetchBlob(
                        integration.accessToken,
                        repoRef.owner,
                        repoRef.repo,
                        item.sha
                    );
                } catch (error) {
                    // A single unreadable blob (API limit, transient 5xx, LFS
                    // pointer) must not fail the whole import.
                    console.warn(`[provisioning] could not fetch ${item.path}: ${error.message}`);
                    return { ...base, content: '', contentOmitted: true };
                }

                if (buffer.length > PROVISIONING_LIMITS.maxStoredContentBytes) {
                    return { ...base, content: '', contentOmitted: true, size: buffer.length };
                }

                if (isBinaryBuffer(buffer)) {
                    return {
                        ...base,
                        content: buffer.toString('base64'),
                        encoding: 'base64',
                        size: buffer.length
                    };
                }

                return {
                    ...base,
                    content: buffer.toString('utf8'),
                    size: buffer.length
                };
            }
        );

        written += await writeProjectFiles(project, userId, imported.filter(Boolean));
    }

    if (!written) {
        throw provisioningError('NO_IMPORTABLE_FILES', 'Repository has no importable files.');
    }

    return written;
}

async function claimProvisioning(projectId) {
    return LocalProject.findOneAndUpdate(
        {
            _id: projectId,
            provisioningStatus: { $in: ['not_started', 'pending', 'failed'] }
        },
        {
            $set: {
                provisioningStatus: 'provisioning',
                provisioningError: ''
            }
        },
        { new: true }
    );
}

async function markFailed(projectId, error) {
    console.error('Project provisioning failed:', projectId, error?.message || error);
    return LocalProject.findByIdAndUpdate(
        projectId,
        {
            $set: {
                provisioningStatus: 'failed',
                provisioningError: safeProvisioningMessage(error)
            }
        },
        { new: true }
    );
}

async function provisionProject(projectId, userId) {
    const project = await claimProvisioning(projectId);
    if (!project) {
        return LocalProject.findById(projectId);
    }

    try {
        let fileCount = 0;
        if (project.sourceType === 'github') {
            fileCount = await importGitHub(project, userId);
        } else if (project.sourceType === 'template') {
            fileCount = await writeProjectFiles(project, userId, await provisionTemplate(project));
        } else {
            fileCount = await writeProjectFiles(project, userId, await provisionScratch(project));
        }

        return LocalProject.findByIdAndUpdate(
            projectId,
            {
                $set: {
                    provisioningStatus: 'ready',
                    provisioningError: '',
                    provisionedAt: new Date(),
                    provisionedFileCount: fileCount
                }
            },
            { new: true }
        );
    } catch (error) {
        return markFailed(projectId, error);
    }
}

async function retryProvisioning(projectId, userId) {
    const project = await LocalProject.findById(projectId);
    if (!project) return null;
    if (project.provisioningStatus === 'ready') return project;
    return provisionProject(projectId, userId);
}

module.exports = {
    PROVISIONING_LIMITS,
    TEMPLATE_FILES,
    provisionProject,
    retryProvisioning,
    normalizeRepoName,
    normalizeBranch,
    safeProvisioningMessage,
    languageForPath,
    shouldSkipPath
};
