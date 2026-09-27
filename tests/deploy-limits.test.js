/**
 * Large / robust project deployment validation:
 * - path safety that accepts real-world names (spaces, unicode, nesting)
 * - env-configurable file count/size caps (replaces the hard 200-file cap)
 * - binary-safe tarball round-trips
 * - static entry generation with proper URL/HTML escaping
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
    assertSafeRelPath,
    createTarballSync,
    detectRuntime,
    ensureStaticEntry,
    buildFileRelPath,
} = require('../utils/deploymentService');
const { validateDeployFiles, fileKey, fileBytes, looksBinary } = require('../utils/deployContent');

const ENV_KEYS = ['DEPLOY_MAX_FILES', 'DEPLOY_MAX_FILE_BYTES', 'DEPLOY_MAX_TOTAL_BYTES'];
const savedEnv = {};

beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
});
afterEach(() => {
    for (const k of ENV_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
    }
});

describe('assertSafeRelPath', () => {
    test('accepts real-world names: spaces, unicode, punctuation, deep nesting', () => {
        expect(() => assertSafeRelPath('README.md')).not.toThrow();
        expect(() => assertSafeRelPath('src/nested dir/file (1).png')).not.toThrow();
        expect(() => assertSafeRelPath('фото/图片/index.html')).not.toThrow();
        expect(() => assertSafeRelPath("it's/a file.txt")).not.toThrow();
        expect(() => assertSafeRelPath('assets/css/vendor.min.css')).not.toThrow();
        expect(() => assertSafeRelPath('a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t')).not.toThrow();
        expect(() => assertSafeRelPath('@scope/package/dist/bundle.js')).not.toThrow();
    });

    test('rejects traversal, empty and control-character segments', () => {
        const bad = ['..', '../x', 'a/../b', '.', 'a//b', '/a/b', '', 'a\nb', 'a\u0000b'];
        for (const p of bad) {
            expect(() => assertSafeRelPath(p)).toThrow(/Invalid file path/);
        }
    });

    test('rejects shell-unsafe characters expanded by the local ssh wrapper', () => {
        for (const p of ['a$b', 'a`b', 'a\\b']) {
            expect(() => assertSafeRelPath(p)).toThrow(/Invalid file path/);
        }
    });

    test('rejects segments over the 255-byte filesystem limit', () => {
        expect(() => assertSafeRelPath('a'.repeat(256))).toThrow(/too long/);
        // 100 multi-byte chars = 300 bytes
        expect(() => assertSafeRelPath('界'.repeat(100))).toThrow(/too long/);
        expect(() => assertSafeRelPath('界'.repeat(80))).not.toThrow();
    });
});

describe('fileKey', () => {
    test('normalizes every path shape to the same key', () => {
        expect(fileKey({ path: '/', name: 'a.js' })).toBe('a.js');
        expect(fileKey({ path: '/a.js', name: 'a.js' })).toBe('a.js');
        expect(fileKey({ path: '/src', name: 'a.js' })).toBe('src/a.js');
        expect(fileKey({ path: '/src/a.js', name: 'a.js' })).toBe('src/a.js');
        expect(fileKey({ path: 'src/deep dir', name: 'my file.js' })).toBe('src/deep dir/my file.js');
    });
});

describe('validateDeployFiles', () => {
    const makeFiles = (n, content = 'x') =>
        Array.from({ length: n }, (_, i) => ({
            name: `f${i}.txt`,
            path: '/',
            content,
        }));

    test('allows 250 files by default (old cap was a hard 200)', () => {
        expect(() => validateDeployFiles(makeFiles(250))).not.toThrow();
    });

    test('allows 1000 files by default', () => {
        expect(() => validateDeployFiles(makeFiles(1000))).not.toThrow();
    });

    test('rejects over DEPLOY_MAX_FILES with a clear message', () => {
        process.env.DEPLOY_MAX_FILES = '200';
        expect(() => validateDeployFiles(makeFiles(201))).toThrow(/200-file deployment limit/);
        expect(() => validateDeployFiles(makeFiles(200))).not.toThrow();
    });

    test('rejects a file over DEPLOY_MAX_FILE_BYTES', () => {
        process.env.DEPLOY_MAX_FILE_BYTES = '1024';
        const files = [{ name: 'big.txt', path: '/', content: 'x'.repeat(2048) }];
        expect(() => validateDeployFiles(files)).toThrow(/File too large: big\.txt/);
    });

    test('rejects a deployment over DEPLOY_MAX_TOTAL_BYTES', () => {
        process.env.DEPLOY_MAX_TOTAL_BYTES = '3000';
        const files = Array.from({ length: 5 }, (_, i) => ({
            name: `f${i}.txt`,
            path: '/',
            content: 'x'.repeat(1024),
        }));
        expect(() => validateDeployFiles(files)).toThrow(/total limit/);
    });

    test('counts base64 content by decoded bytes', () => {
        process.env.DEPLOY_MAX_FILE_BYTES = '50';
        const raw = Buffer.alloc(100, 7);
        const files = [{
            name: 'img.png',
            path: '/',
            content: raw.toString('base64'),
            encoding: 'base64',
        }];
        expect(fileBytes(files[0])).toBe(100);
        expect(() => validateDeployFiles(files)).toThrow(/File too large/);
    });

    test('rejects unsafe paths but accepts spaces and unicode', () => {
        expect(() => validateDeployFiles([{ name: 'x', path: '..', content: '' }]))
            .toThrow(/Invalid file path/);
        expect(() => validateDeployFiles([{ name: 'My Notes (v2).md', path: '/docs', content: 'hi' }]))
            .not.toThrow();
        expect(() => validateDeployFiles([{ name: 'файл.html', path: '/папка', content: '<h1>x</h1>' }]))
            .not.toThrow();
    });

    test('rejects empty payloads', () => {
        expect(() => validateDeployFiles([])).toThrow(/no deployable files/);
    });
});

describe('createTarballSync', () => {
    test('round-trips binary content and spaced/unicode paths byte-for-byte', () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x01]);
        const files = [
            { name: '图片 (1).png', path: '图片 (1).png', content: png.toString('base64'), encoding: 'base64' },
            { name: 'my file.txt', path: 'deep/nested dir/my file.txt', content: 'héllo wörld' },
        ];
        const tarPath = createTarballSync(files);
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-out-'));
        try {
            execFileSync('tar', ['-xzf', tarPath, '-C', outDir]);
            expect(fs.readFileSync(path.join(outDir, '图片 (1).png'))).toEqual(png);
            expect(fs.readFileSync(path.join(outDir, 'deep/nested dir/my file.txt'), 'utf8')).toBe('héllo wörld');
        } finally {
            fs.rmSync(outDir, { recursive: true, force: true });
            try { fs.unlinkSync(tarPath); } catch (_) {}
        }
    });

    test('throws on traversal paths (Tar Slip)', () => {
        expect(() => createTarballSync([{ name: 'x', path: '../evil.sh', content: 'x' }]))
            .toThrow(/Invalid file path/);
    });
});

describe('detectRuntime', () => {
    test('generates a static nginx Dockerfile without fragile shell listing code', () => {
        const { runtime, dockerfile } = detectRuntime([
            { name: 'index.html', path: '/', content: '<h1>hi</h1>' },
        ]);
        expect(runtime).toBe('static');
        expect(dockerfile).toContain('COPY . /usr/share/nginx/html');
        expect(dockerfile).not.toContain('for f in *');
    });

    test('still detects node runtime from package.json', () => {
        const { runtime, exposePort } = detectRuntime([
            { name: 'package.json', path: '/', content: '{"scripts":{"build":"x"}}' },
            { name: 'server.js', path: '/', content: 'x' },
        ]);
        expect(runtime).toBe('node');
        expect(exposePort).toBe(3000);
    });

    test('base64-encoded package.json is decoded before content sniffing', () => {
        const pkg = '{"scripts":{"build":"next build"}}';
        const { runtime, dockerfile } = detectRuntime([
            { name: 'package.json', path: '/', content: Buffer.from(pkg).toString('base64'), encoding: 'base64' },
            { name: 'index.js', path: '/', content: 'x' },
        ]);
        expect(runtime).toBe('node');
        expect(dockerfile).toContain('RUN npm run build');
    });

    test('nested Dockerfile builds from its own directory with its EXPOSE port', () => {
        const { runtime, contextDir, exposePort, dockerfile } = detectRuntime([
            { name: 'README.md', path: '/', content: '# aegis' },
            { name: 'Dockerfile', path: '/gateway', content: 'FROM golang:1.22-alpine\nCOPY go.mod go.sum ./\nEXPOSE 8443\n' },
            { name: 'go.mod', path: '/gateway', content: 'module x' },
            { name: 'go.sum', path: '/gateway', content: '' },
            { name: 'Dockerfile', path: '/slm-redactor', content: 'FROM python:3.11-slim\nEXPOSE 8000\n' },
        ]);
        expect(runtime).toBe('docker');
        expect(contextDir).toBe('gateway');
        expect(exposePort).toBe(8443);
        expect(dockerfile).toContain('COPY go.mod go.sum ./');
    });

    test('root package.json beats a nested Dockerfile (monorepo subdir cannot hijack)', () => {
        const { runtime, contextDir } = detectRuntime([
            { name: 'package.json', path: '/', content: '{"scripts":{"start":"node server.js"}}' },
            { name: 'server.js', path: '/', content: 'x' },
            { name: 'Dockerfile', path: '/gateway', content: 'FROM golang:1.22-alpine' },
        ]);
        expect(runtime).toBe('node');
        expect(contextDir).toBe('.');
    });

    test('root index.html wins over a nested package.json', () => {
        const { runtime } = detectRuntime([
            { name: 'index.html', path: '/', content: '<h1>docs</h1>' },
            { name: 'package.json', path: '/web', content: '{"scripts":{"start":"node x.js"}}' },
        ]);
        expect(runtime).toBe('static');
    });

    test('only the context package.json scripts.build emits npm run build', () => {
        const { runtime, dockerfile } = detectRuntime([
            { name: 'package.json', path: '/', content: '{"scripts":{"start":"node server.js"}}' },
            { name: 'server.js', path: '/', content: 'x' },
            { name: 'package.json', path: '/buildrs-frontend', content: '{"scripts":{"build":"next build","start":"next start -p 3001"}}' },
        ]);
        expect(runtime).toBe('node');
        expect(dockerfile).not.toContain('RUN npm run build');
        expect(dockerfile).toContain('CMD ["node", "server.js"]');
        expect(dockerfile).not.toContain('apk add');
    });

    test('native deps (node-pty) add the alpine build toolchain', () => {
        const { dockerfile } = detectRuntime([
            { name: 'package.json', path: '/', content: JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { 'node-pty': '^1.1.0' } }) },
            { name: 'server.js', path: '/', content: 'x' },
        ]);
        expect(dockerfile).toContain('apk add --no-cache python3 make g++');
    });

    test('engines.node selects an even LTS major between 20 and 24', () => {
        const imageFor = engines => detectRuntime([
            { name: 'package.json', path: '/', content: JSON.stringify({ engines: { node: engines }, scripts: { start: 'node server.js' } }) },
            { name: 'server.js', path: '/', content: 'x' },
        ]).dockerfile.split('\n')[0];
        expect(imageFor('>=18')).toBe('FROM node:20-alpine');
        expect(imageFor('21')).toBe('FROM node:22-alpine');
        expect(imageFor('25')).toBe('FROM node:24-alpine');
        expect(imageFor('22.1.0')).toBe('FROM node:22-alpine');
    });

    test('lockfile uses npm ci and dev deps are dropped without a build script', () => {
        const { dockerfile } = detectRuntime([
            { name: 'package.json', path: '/', content: '{"scripts":{"start":"node s.js"}}' },
            { name: 'package-lock.json', path: '/', content: '{}' },
            { name: 's.js', path: '/', content: 'x' },
        ]);
        expect(dockerfile).toContain('RUN npm ci --no-audit --no-fund --omit=dev || npm install --no-audit --no-fund --omit=dev');
    });

    test('exposes the port from the start script or listen call', () => {
        const portOf = (start, serverSrc) => detectRuntime([
            { name: 'package.json', path: '/', content: JSON.stringify({ scripts: { start } }) },
            { name: 'server.js', path: '/', content: serverSrc },
        ]).exposePort;
        expect(portOf('next start -p 3001', 'x')).toBe(3001);
        expect(portOf('node server.js', 'app.listen(process.env.PORT || 8082)')).toBe(8082);
        expect(portOf('node server.js', 'x')).toBe(3000);
    });

    test('package.json without a runnable entry falls back to static', () => {
        const { runtime } = detectRuntime([
            { name: 'package.json', path: '/', content: '{}' },
            { name: 'index.html', path: '/', content: '<h1>hi</h1>' },
        ]);
        expect(runtime).toBe('static');
    });

    test('go: cmd package selected, go.sum copied only when present', () => {
        const files = [
            { name: 'go.mod', path: '/', content: 'module example.com/x\n\ngo 1.21\n' },
            { name: 'main.go', path: '/cmd/server', content: 'package main\nfunc main() {}' },
            { name: 'util.go', path: '/internal', content: 'package pkg' },
        ];
        const { runtime, dockerfile, contextDir } = detectRuntime(files);
        expect(runtime).toBe('go');
        expect(contextDir).toBe('.');
        expect(dockerfile).toContain('FROM golang:1.21-alpine');
        expect(dockerfile).toContain('go build -o /out/app ./cmd/server');
        expect(dockerfile).not.toContain('go.sum');
        const withSum = detectRuntime([...files, { name: 'go.sum', path: '/', content: '' }]);
        expect(withSum.dockerfile).toContain('COPY go.mod go.sum ./');
    });

    test('go module without a main package falls back to static', () => {
        const { runtime } = detectRuntime([
            { name: 'go.mod', path: '/', content: 'module x' },
            { name: 'util.go', path: '/', content: 'package pkg' },
        ]);
        expect(runtime).toBe('static');
    });

    test('python: manage.py runs Django; nested requirements.txt scopes the context', () => {
        const django = detectRuntime([
            { name: 'requirements.txt', path: '/', content: 'django' },
            { name: 'manage.py', path: '/', content: 'x' },
        ]);
        expect(django.runtime).toBe('python');
        expect(django.exposePort).toBe(8000);
        expect(django.dockerfile).toContain('"runserver", "0.0.0.0:8000"');
        const nested = detectRuntime([
            { name: 'requirements.txt', path: '/slm-redactor', content: 'fastapi' },
            { name: 'main.py', path: '/slm-redactor', content: 'x' },
        ]);
        expect(nested.runtime).toBe('python');
        expect(nested.contextDir).toBe('slm-redactor');
    });

    test('contextDir preserves directory case', () => {
        const { contextDir, runtime } = detectRuntime([
            { name: 'Dockerfile', path: '/Gateway', content: 'FROM alpine\nEXPOSE 9000\n' },
            { name: 'go.mod', path: '/Gateway', content: 'module x' },
        ]);
        expect(runtime).toBe('docker');
        expect(contextDir).toBe('Gateway');
        expect(detectRuntime([
            { name: 'Dockerfile', path: '/Gateway', content: 'FROM alpine\nEXPOSE 9000\n' },
        ]).exposePort).toBe(9000);
    });
});

describe('ensureStaticEntry', () => {
    test('keeps an existing index.html untouched', () => {
        const entries = [
            { name: 'index.html', path: 'index.html', content: '<h1>mine</h1>' },
            { name: 'app.js', path: 'app.js', content: 'x' },
        ];
        expect(ensureStaticEntry(entries)).toBe(entries);
    });

    test('single root .html file becomes index.html with identical content', () => {
        const entries = [{ name: 'game.html', path: 'game.html', content: '<h1>game</h1>' }];
        const out = ensureStaticEntry(entries);
        const index = out.find(e => e.path === 'index.html');
        expect(index.content).toBe('<h1>game</h1>');
    });

    test('no html → generated listing with URL-encoded hrefs and escaped labels', () => {
        const entries = [
            { name: 'my file.txt', path: 'my file.txt', content: 'a' },
            { name: "it's.md", path: "it's.md", content: 'b' },
            { name: 'x.html', path: 'sub/x.html', content: 'c' },
        ];
        const out = ensureStaticEntry(entries);
        const index = out.find(e => e.path === 'index.html');
        expect(index).toBeTruthy();
        expect(index.content).toContain('href="/my%20file.txt"');
        expect(index.content).toContain('href="/sub/x.html"');
        expect(index.content).toContain('my file.txt');
        expect(index.content).not.toContain('href="/my file.txt"');
    });
});

describe('looksBinary', () => {
    test('classifies text as text and image/NUL bytes as binary', () => {
        expect(looksBinary(Buffer.from('plain text ✓', 'utf8'))).toBe(false);
        expect(looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))).toBe(true);
        expect(looksBinary(Buffer.from([0x00, 0x01, 0x02]))).toBe(true);
        // invalid utf8 continuation bytes
        expect(looksBinary(Buffer.from([0xe2, 0x28, 0xa1]))).toBe(true);
    });
});

describe('buildFileRelPath', () => {
    test('never double-nests the filename', () => {
        expect(buildFileRelPath({ path: '/', name: 'a.js' })).toBe('a.js');
        expect(buildFileRelPath({ path: '/src', name: 'a.js' })).toBe(path.join('src', 'a.js'));
        expect(buildFileRelPath({ path: '/game.html', name: 'game.html' })).toBe('game.html');
        expect(buildFileRelPath({ path: '/src/deep', name: 'b.css' })).toBe(path.join('src/deep', 'b.css'));
    });
});
