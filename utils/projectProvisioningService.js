const LocalProject = require('../models/LocalProject');
const CodeFile = require('../models/CodeFile');
const vfs = require('./virtualFileSystem');
const { ensurePersonalWorkspace } = require('./personalWorkspace');
const { getGitHubIntegration, githubAPI } = require('./githubApiClient');

const PROVISIONING_LIMITS = {
    maxFiles: 500,
    maxFileBytes: 1024 * 1024,
    maxTotalBytes: 10 * 1024 * 1024,
    concurrency: 5
};

const SKIPPED_DIRECTORIES = new Set([
    '.git',
    '.next',
    '.nuxt',
    '.svelte-kit',
    '.turbo',
    '.venv',
    'venv',
    'node_modules',
    'vendor',
    'dist',
    'build',
    'coverage',
    '__pycache__',
    'Pods',
    'DerivedData'
]);

const BINARY_EXTENSIONS = new Set([
    '.7z', '.a', '.avi', '.bmp', '.class', '.dll', '.dmg', '.doc', '.docx',
    '.eot', '.exe', '.flac', '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg',
    '.m4a', '.mkv', '.mov', '.mp3', '.mp4', '.o', '.otf', '.pdf', '.png',
    '.psd', '.so', '.tar', '.tiff', '.ttf', '.wav', '.webm', '.webp', '.woff',
    '.woff2', '.xls', '.xlsx', '.zip'
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

    const extension = base.includes('.') ? `.${base.split('.').pop()}` : '';
    return BINARY_EXTENSIONS.has(extension);
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

async function writeProjectFiles(project, userId, files) {
    if (!files.length) return 0;

    const workspaceId = await ensureProjectWorkspace(project);
    const now = new Date();
    const operations = files.map((file) => ({
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
                    lastModifiedBy: userId,
                    updatedAt: now,
                    size: Buffer.byteLength(file.content, 'utf8')
                },
                $setOnInsert: {
                    createdBy: userId,
                    createdAt: now
                }
            },
            upsert: true
        }
    }));

    await CodeFile.bulkWrite(operations, { ordered: false, timestamps: false });
    vfs.invalidateIndex(String(workspaceId));
    return files.length;
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
    const blob = await githubAPI(accessToken, `/repos/${owner}/${repo}/git/blobs/${sha}`);
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
    const treeData = await githubAPI(
        integration.accessToken,
        `/repos/${repoRef.owner}/${repoRef.repo}/git/trees/${commitData.tree.sha}?recursive=1`
    );

    if (treeData.truncated) {
        throw provisioningError('REPOSITORY_TOO_LARGE', 'Repository tree is truncated.');
    }

    const candidates = (treeData.tree || []).filter((item) => (
        item.type === 'blob' &&
        !shouldSkipPath(item.path)
    ));

    if (!candidates.length) {
        throw provisioningError('NO_IMPORTABLE_FILES', 'Repository has no importable files.');
    }

    if (candidates.length > PROVISIONING_LIMITS.maxFiles) {
        throw provisioningError('REPOSITORY_TOO_LARGE', 'Repository has too many files.');
    }

    let totalBytes = 0;
    const selected = [];
    for (const candidate of candidates) {
        if (Number(candidate.size) > PROVISIONING_LIMITS.maxFileBytes) continue;
        totalBytes += Number(candidate.size) || 0;
        if (totalBytes > PROVISIONING_LIMITS.maxTotalBytes) {
            throw provisioningError('REPOSITORY_TOO_LARGE', 'Repository exceeds the import size limit.');
        }
        selected.push(candidate);
    }

    if (!selected.length) {
        throw provisioningError('NO_IMPORTABLE_FILES', 'Repository has no importable text files.');
    }

    const imported = await mapWithConcurrency(
        selected,
        PROVISIONING_LIMITS.concurrency,
        async (item) => {
            const split = splitRepoPath(item.path);
            if (!split) return null;

            const buffer = await fetchBlob(
                integration.accessToken,
                repoRef.owner,
                repoRef.repo,
                item.sha
            );

            if (buffer.length > PROVISIONING_LIMITS.maxFileBytes || isBinaryBuffer(buffer)) {
                return null;
            }

            return {
                path: split.path,
                name: split.name,
                language: languageForPath(split.fullPath),
                content: buffer.toString('utf8')
            };
        }
    );

    const files = imported.filter(Boolean);
    if (!files.length) {
        throw provisioningError('NO_IMPORTABLE_FILES', 'Repository has no importable text files.');
    }

    project.githubRepoName = repoRef.fullName;
    project.githubRepoUrl = repoRef.url;
    project.defaultBranch = branch;
    await project.save();

    await writeProjectFiles(project, userId, files);
    return files.length;
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
