/**
 * Large / robust project deployment validation:
 * - path safety that accepts real-world names (spaces, unicode, nesting)
 * - no file-count, per-file or total-size ceiling (any repository deploys)
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
    DeployError,
    capLogTail,
} = require('../utils/deploymentService');
const { validateDeployFiles, fileKey, fileBytes, looksBinary } = require('../utils/deployContent');

const ENV_KEYS = ['DEPLOY_BACKFILL_TIMEOUT_MS'];
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

    test('has no file-count ceiling', () => {
        expect(() => validateDeployFiles(makeFiles(250))).not.toThrow();
        expect(() => validateDeployFiles(makeFiles(1000))).not.toThrow();
        expect(() => validateDeployFiles(makeFiles(5000))).not.toThrow();
    });

    test('has no per-file size ceiling', () => {
        const files = [{ name: 'big.txt', path: '/', content: 'x'.repeat(20 * 1024 * 1024) }];
        expect(() => validateDeployFiles(files)).not.toThrow();
    });

    test('has no total-size ceiling', () => {
        const files = Array.from({ length: 20 }, (_, i) => ({
            name: `f${i}.txt`,
            path: '/',
            content: 'x'.repeat(5 * 1024 * 1024),
        }));
        expect(() => validateDeployFiles(files)).not.toThrow();
    });

    test('counts base64 content by decoded bytes', () => {
        const raw = Buffer.alloc(100, 7);
        const files = [{
            name: 'img.png',
            path: '/',
            content: raw.toString('base64'),
            encoding: 'base64',
        }];
        expect(fileBytes(files[0])).toBe(100);
    });

    test('rejects unsafe paths but accepts spaces and unicode', () => {
        expect(() => validateDeployFiles([{ name: 'x', path: '..', content: '' }]))
            .toThrow(/Invalid file path/);
        expect(() => validateDeployFiles([{ name: 'My Notes (v2).md', path: '/docs', content: 'hi' }]))
            .not.toThrow();
        expect(() => validateDeployFiles([{ name: 'файл.html', path: '/папка', content: '<h1>x</h1>' }]))
            .not.toThrow();
    });

    test('rejects secret files but allows checked-in examples', () => {
        expect(() => validateDeployFiles([{ name: '.env', path: '/', content: 'SECRET=1' }]))
            .toThrow(/Refusing to deploy secret file/);
        expect(() => validateDeployFiles([{ name: '.env.production', path: '/', content: 'SECRET=1' }]))
            .toThrow(/Refusing to deploy secret file/);
        expect(() => validateDeployFiles([{ name: '.npmrc', path: '/', content: 'token=1' }]))
            .toThrow(/Refusing to deploy secret file/);
        expect(() => validateDeployFiles([{ name: '.env.example', path: '/', content: 'SECRET=' }]))
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

    test('user Dockerfile golang pin is bumped when go.mod requires a newer toolchain', () => {
        const { dockerfile } = detectRuntime([
            { name: 'Dockerfile', path: '/gateway', content: 'FROM golang:1.22-alpine AS builder\nRUN go mod download\n' },
            { name: 'go.mod', path: '/gateway', content: 'module x\n\ngo 1.26.3\n' },
        ]);
        expect(dockerfile).toContain('FROM golang:1.26.3-alpine AS builder');
        expect(dockerfile).toContain('buildrs: bumped golang:1.22-alpine');
    });

    test('satisfying or newer golang pins are left untouched (no buildrs comment)', () => {
        const { dockerfile } = detectRuntime([
            { name: 'Dockerfile', path: '/gateway', content: 'FROM golang:1.26.3-alpine AS builder\nRUN go mod download\n' },
            { name: 'go.mod', path: '/gateway', content: 'module x\n\ngo 1.26.3\n' },
        ]);
        expect(dockerfile).not.toContain('buildrs:');
        expect(dockerfile).toContain('FROM golang:1.26.3-alpine AS builder');
        const newer = detectRuntime([
            { name: 'Dockerfile', path: '/gateway', content: 'FROM golang:1.27-alpine AS builder\n' },
            { name: 'go.mod', path: '/gateway', content: 'module x\n\ngo 1.26.3\n' },
        ]);
        expect(newer.dockerfile).not.toContain('buildrs:');
        expect(newer.dockerfile).toContain('FROM golang:1.27-alpine AS builder');
    });

    test('generated go template uses the full go.mod version including patch', () => {
        const { dockerfile } = detectRuntime([
            { name: 'go.mod', path: '/', content: 'module x\n\ngo 1.26.3\n' },
            { name: 'main.go', path: '/', content: 'package main\nfunc main() {}' },
        ]);
        expect(dockerfile).toContain('FROM golang:1.26.3-alpine');
        const minorOnly = detectRuntime([
            { name: 'go.mod', path: '/', content: 'module x\n\ngo 1.21\n' },
            { name: 'main.go', path: '/', content: 'package main\nfunc main() {}' },
        ]);
        expect(minorOnly.dockerfile).toContain('FROM golang:1.21-alpine');
    });

    test('rust: cargo manifest selects the binary and detects the port', () => {
        const { runtime, dockerfile, exposePort } = detectRuntime([
            { name: 'Cargo.toml', path: '/', content: '[package]\nname = "my-api"\n\n[dependencies]\nserde = "1"\n' },
            { name: 'src/main.rs', path: '/', content: 'bind("0.0.0.0:9090")' },
        ]);
        expect(runtime).toBe('rust');
        expect(exposePort).toBe(9090);
        expect(dockerfile).toContain('cargo build --release');
        expect(dockerfile).toContain('/src/target/release/my-api');
    });

    test('java: maven projects build a jar and honour server.port', () => {
        const { runtime, dockerfile, exposePort } = detectRuntime([
            { name: 'pom.xml', path: '/', content: '<project><java.version>17</java.version></project>' },
            { name: 'src/main/java/App.java', path: '/', content: 'class App {}' },
            { name: 'src/main/resources/application.properties', path: '/', content: 'server.port=8088\n' },
        ]);
        expect(runtime).toBe('java');
        expect(exposePort).toBe(8088);
        expect(dockerfile).toContain('FROM maven:3.9-eclipse-temurin-17 AS build');
        expect(dockerfile).toContain('FROM eclipse-temurin:17-jre');
        expect(dockerfile).toContain('ENV SERVER_PORT=8088');
    });

    test('dotnet: csproj selects the SDK and runs the published assembly', () => {
        const { runtime, dockerfile } = detectRuntime([
            { name: 'MyApp.csproj', path: '/', content: '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>' },
        ]);
        expect(runtime).toBe('dotnet');
        expect(dockerfile).toContain('mcr.microsoft.com/dotnet/sdk:8.0');
        expect(dockerfile).toContain('ENTRYPOINT ["dotnet", "MyApp.dll"]');
    });

    test('elixir: mix project runs phoenix when the dependency is present', () => {
        const { runtime, dockerfile } = detectRuntime([
            { name: 'mix.exs', path: '/', content: 'defp deps do [{:phoenix, "~> 1.7"}] end' },
            { name: 'config/runtime.exs', path: '/', content: 'config :app, port: 4321' },
        ]);
        expect(runtime).toBe('elixir');
        expect(dockerfile).toContain('CMD ["mix", "phx.server"]');
        expect(dockerfile).toContain('ENV PORT=4321');
    });

    test('swift: Package.swift builds the named executable', () => {
        const { runtime, dockerfile } = detectRuntime([
            { name: 'Package.swift', path: '/', content: 'let package = Package(name: "SwiftAPI")' },
        ]);
        expect(runtime).toBe('swift');
        expect(dockerfile).toContain('swift build -c release');
        expect(dockerfile).toContain('.build/release/SwiftAPI');
    });

    test('dart: pubspec selects the bin entrypoint', () => {
        const { runtime, dockerfile } = detectRuntime([
            { name: 'pubspec.yaml', path: '/', content: 'name: dart_api\n' },
            { name: 'bin/server.dart', path: '/', content: 'void main() {}' },
        ]);
        expect(runtime).toBe('dart');
        expect(dockerfile).toContain('dart compile exe bin/server.dart -o /out/app');
    });

    test('docker compose with a build service fails clearly instead of deploying statically', () => {
        const detected = detectRuntime([
            { name: 'docker-compose.yml', path: '/', content: 'services:\n  web:\n    build: .\n    ports:\n      - "3000:3000"\n' },
        ]);
        expect(detected.runtime).toBe('compose');
        expect(detected.unsupported).toBe(true);
        expect(detected.reason).toMatch(/Docker Compose/i);
    });

    test('image-only compose files fall through to the normal static deploy', () => {
        const detected = detectRuntime([
            { name: 'docker-compose.yml', path: '/', content: 'services:\n  redis:\n    image: redis:7\n' },
            { name: 'index.html', path: '/', content: '<h1>docs</h1>' },
        ]);
        expect(detected.runtime).toBe('static');
        expect(detected.unsupported).toBeUndefined();
    });

    test('nested rust/java/.NET markers are detected in their own context', () => {
        const rust = detectRuntime([
            { name: 'Cargo.toml', path: '/services/api', content: '[package]\nname = "api"\n' },
        ]);
        expect(rust.runtime).toBe('rust');
        expect(rust.contextDir).toBe('services/api');
        const java = detectRuntime([
            { name: 'pom.xml', path: '/services/web', content: '<project/>' },
        ]);
        expect(java.runtime).toBe('java');
        expect(java.contextDir).toBe('services/web');
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

describe('DeployError', () => {
    test('carries stage, fault and optional runtime logs for attribution', () => {
        const err = new DeployError('your build failed', { stage: 'build', fault: 'user', runtimeLogs: 'TypeError: x' });
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('DeployError');
        expect(err.message).toBe('your build failed');
        expect(err.stage).toBe('build');
        expect(err.fault).toBe('user');
        expect(err.runtimeLogs).toBe('TypeError: x');
        expect(err.stack).toMatch(/DeployError/);
    });

    test('defaults to platform attribution when not specified', () => {
        const err = new DeployError('ssh connection refused');
        expect(err.stage).toBe('platform');
        expect(err.fault).toBe('platform');
        expect(err.runtimeLogs).toBeUndefined();
    });

    test('user-attributed errors without runtime logs omit the field', () => {
        const err = new DeployError('build exceeded limit', { stage: 'build', fault: 'user' });
        expect(err.fault).toBe('user');
        expect(err.runtimeLogs).toBeUndefined();
    });
});

describe('capLogTail', () => {
    test('returns short logs untouched', () => {
        expect(capLogTail('')).toBe('');
        expect(capLogTail('npm warn whatever\nbuild ok')).toBe('npm warn whatever\nbuild ok');
    });

    test('keeps the head and tail with an omission marker for huge logs', () => {
        const text = `HEAD_MARK${'x'.repeat(600 * 1024)}TAIL_MARK`;
        const out = capLogTail(text, 1000);
        expect(out.length).toBeLessThan(text.length);
        expect(out).toContain('HEAD_MARK');
        expect(out).toContain('TAIL_MARK');
        expect(out).toMatch(/\[\d+ chars of build output omitted\]/);
        // head (10%) + marker + tail (85%) ≈ the cap, never the full log
        expect(out.length).toBeLessThan(1000 + 120);
    });

    test('always preserves the failure tail — the last lines of output survive', () => {
        const failLine = 'ERROR: failed to solve: process did not complete successfully';
        const text = 'a'.repeat(200 * 1024) + failLine;
        const out = capLogTail(text, 4096);
        expect(out.endsWith(failLine)).toBe(true);
    });

    test('logs exactly at the cap are not modified', () => {
        const text = 'y'.repeat(512 * 1024);
        expect(capLogTail(text)).toBe(text);
    });
});
