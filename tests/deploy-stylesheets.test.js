/**
 * Deployment must never publish markup without its stylesheets.
 *
 * Two failure modes are covered:
 *  - the client payload omits a stylesheet the project actually has (the file
 *    was never opened in the editor, or was saved after the explorer loaded)
 *  - whole file lists pass validation/tarballing unchanged, including .css
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
    isStylesheet,
    appendMissingStylesheets,
    mergeProjectFiles,
    validateDeployFiles,
    fileKey,
} = require('../utils/deployContent');
const { buildFileRelPath, createTarballSync } = require('../utils/deploymentService');

describe('isStylesheet', () => {
    test('matches stylesheet extensions on the name', () => {
        for (const name of ['styles.css', 'theme.scss', 'print.sass', 'vars.less', 'app.styl']) {
            expect(isStylesheet({ name })).toBe(true);
        }
    });

    test('matches when only a GitHub-tree full path is present', () => {
        expect(isStylesheet({ path: '/src/styles/main.css' })).toBe(true);
        expect(isStylesheet({ path: 'src/styles/main.css', name: '' })).toBe(true);
    });

    test('ignores non-stylesheet files', () => {
        for (const name of ['index.html', 'app.js', 'styles.css.map', 'css.md']) {
            expect(isStylesheet({ name })).toBe(false);
        }
        expect(isStylesheet({})).toBe(false);
        expect(isStylesheet(null)).toBe(false);
    });
});

describe('appendMissingStylesheets', () => {
    const projectFiles = [
        { path: '/', name: 'index.html', language: 'html', content: '<link rel="stylesheet" href="/styles.css">' },
        { path: '/', name: 'styles.css', language: 'css', content: 'body { color: red; }' },
        { path: '/styles', name: 'dark.scss', language: 'scss', content: '$bg: #000;' },
        { path: '/', name: 'app.js', language: 'javascript', content: 'console.log(1);' },
    ];

    test('appends stylesheets the payload omitted', () => {
        const payload = [{ path: '/', name: 'index.html', content: '<link rel="stylesheet" href="/styles.css">' }];
        const merged = appendMissingStylesheets(payload, projectFiles);

        expect(merged).toHaveLength(3);
        expect(merged[0]).toBe(payload[0]);
        expect(merged.map((f) => f.name)).toEqual(
            expect.arrayContaining(['styles.css', 'dark.scss'])
        );
        expect(merged.find((f) => f.name === 'dark.scss')).toMatchObject({
            path: '/styles',
            language: 'scss',
        });
    });

    test('existing payload content wins over the stored copy', () => {
        const payload = [
            { path: '/', name: 'index.html', content: '<html></html>' },
            { path: '/', name: 'styles.css', content: 'body { color: blue; }' },
        ];
        const merged = appendMissingStylesheets(payload, projectFiles);
        const css = merged.filter((f) => f.name === 'styles.css');

        expect(css).toHaveLength(1);
        expect(css[0].content).toBe('body { color: blue; }');
    });

    test('matches keys across path shapes instead of duplicating', () => {
        // Payload used the editor full-path shape, the DB used directory+name.
        const payload = [
            { path: '/styles/dark.scss', name: 'dark.scss', content: '$bg: #111;' },
        ];
        const merged = appendMissingStylesheets(payload, projectFiles);

        expect(merged.filter((f) => f.name === 'dark.scss')).toHaveLength(1);
        expect(merged.find((f) => f.name === 'dark.scss').content).toBe('$bg: #111;');
    });

    test('is a no-op when there is nothing missing', () => {
        const payload = [
            { path: '/', name: 'styles.css', content: 'a{}' },
            { path: '/styles', name: 'dark.scss', content: 'b{}' },
        ];
        expect(appendMissingStylesheets(payload, projectFiles)).toBe(payload);
    });

    test('handles empty or malformed input', () => {
        const payload = [{ path: '/', name: 'index.html', content: '' }];
        expect(appendMissingStylesheets(payload, [])).toBe(payload);
        expect(appendMissingStylesheets(payload, null)).toBe(payload);
        expect(appendMissingStylesheets([], projectFiles)).toHaveLength(2);
        expect(appendMissingStylesheets(payload, [null, {}, { name: 5 }])).toBe(payload);
    });

    test('keeps base64 encoding for binary stylesheet-ish payloads', () => {
        const merged = appendMissingStylesheets([], [
            { path: '/', name: 'compiled.css', content: 'AAAA', encoding: 'base64' },
        ]);
        expect(merged[0]).toMatchObject({ name: 'compiled.css', encoding: 'base64' });
    });
});

describe('mergeProjectFiles', () => {
    const stored = [
        { path: '/', name: 'index.html', language: 'html', content: '<link rel="stylesheet" href="/styles.css">' },
        { path: '/', name: 'styles.css', language: 'css', content: 'body { background: #111; }' },
        { path: '/styles', name: 'theme.scss', language: 'scss', content: '$accent: #4f9cf9;' },
    ];

    test('fills a metadata-only stylesheet entry with stored content', () => {
        // Exactly what the editor sends for a file it never opened: the path
        // and name are present, content is empty and not resolved.
        const payload = [
            { path: '/', name: 'index.html', content: '<link rel="stylesheet" href="/styles.css">', _resolved: true },
            { path: '/', name: 'styles.css', content: '', _resolved: false },
        ];
        const merged = mergeProjectFiles(payload, stored);
        const css = merged.find((f) => f.name === 'styles.css');

        expect(css.content).toBe('body { background: #111; }');
        expect(css._resolved).toBe(true);
    });

    test('appends every stored file the payload omitted', () => {
        const merged = mergeProjectFiles([{ path: '/', name: 'index.html', content: '<html></html>' }], stored);
        expect(merged.map((f) => f.name)).toEqual(
            expect.arrayContaining(['index.html', 'styles.css', 'theme.scss'])
        );
        expect(merged).toHaveLength(3);
        expect(merged.find((f) => f.name === 'theme.scss')).toMatchObject({
            path: '/styles',
            language: 'scss',
        });
    });

    test('keeps unsaved browser content and intentional empty files', () => {
        const payload = [
            { path: '/', name: 'styles.css', content: 'body { color: blue; }', _resolved: true },
            { path: '/styles', name: 'theme.scss', content: '', _resolved: true },
        ];
        const merged = mergeProjectFiles(payload, stored);

        expect(merged.find((f) => f.name === 'styles.css').content).toBe('body { color: blue; }');
        expect(merged.find((f) => f.name === 'theme.scss').content).toBe('');
    });

    test('matches path shapes without duplicating', () => {
        const merged = mergeProjectFiles(
            [{ path: '/styles/theme.scss', name: 'theme.scss', content: '', _resolved: false }],
            stored
        );
        expect(merged.filter((f) => f.name === 'theme.scss')).toHaveLength(1);
        expect(merged.find((f) => f.name === 'theme.scss').content).toBe('$accent: #4f9cf9;');
    });

    test('is a no-op without stored files', () => {
        const payload = [{ path: '/', name: 'index.html', content: '' }];
        expect(mergeProjectFiles(payload, [])).toBe(payload);
        expect(mergeProjectFiles(payload, null)).toBe(payload);
    });
});

describe('validateDeployFiles', () => {
    test('accepts css and scss alongside markup', () => {
        const files = [
            { path: '/', name: 'index.html', content: '<html></html>' },
            { path: '/', name: 'styles.css', content: 'body{margin:0}' },
            { path: '/styles', name: 'theme.scss', content: '$x: 1;' },
        ];
        expect(() => validateDeployFiles(files)).not.toThrow();
    });

    test('still rejects an empty file list', () => {
        expect(() => validateDeployFiles([])).toThrow(/no deployable files/i);
    });
});

describe('createTarballSync', () => {
    test('writes stylesheets into the deployment archive', () => {
        const files = [
            { path: '/', name: 'index.html', content: '<link rel="stylesheet" href="styles.css">' },
            { path: '/', name: 'styles.css', content: 'body { background: #111; }' },
            { path: '/styles', name: 'theme.scss', content: '$accent: #4f9cf9;' },
        ].map((f) => ({ ...f, path: buildFileRelPath(f) }));

        const tarPath = createTarballSync(files);
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stylesheet-extract-'));
        try {
            execFileSync('tar', ['-xzf', tarPath, '-C', outDir]);
            expect(fs.readFileSync(path.join(outDir, 'styles.css'), 'utf8')).toBe('body { background: #111; }');
            expect(fs.readFileSync(path.join(outDir, 'styles', 'theme.scss'), 'utf8')).toBe('$accent: #4f9cf9;');
            expect(fs.existsSync(path.join(outDir, 'index.html'))).toBe(true);
        } finally {
            fs.rmSync(outDir, { recursive: true, force: true });
            fs.rmSync(tarPath, { force: true });
        }
    });
});

describe('fileKey', () => {
    test('normalizes the path shapes stylesheets arrive in', () => {
        expect(fileKey({ path: '/', name: 'a.css' })).toBe('a.css');
        expect(fileKey({ path: '/a.css', name: 'a.css' })).toBe('a.css');
        expect(fileKey({ path: '/src', name: 'a.css' })).toBe('src/a.css');
        expect(fileKey({ path: '/src/a.css', name: 'a.css' })).toBe('src/a.css');
    });
});
