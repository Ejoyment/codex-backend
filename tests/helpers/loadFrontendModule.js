// Tiny ESM->CJS shim.
//
// This project uses SWC via Next.js and has no babel, so Jest cannot import the
// frontend's ESM modules directly. Rather than duplicate the logic here (which
// would let the real files drift), this helper executes the *actual* source
// with its imports injected as test doubles.
const fs = require('fs');

const KNOWN_GLOBALS = ['window', 'document', 'localStorage', 'navigator', 'AudioContext'];

function transform(source) {
    return (
        source
            // import D, { a, b as c } from 'mod';
            .replace(/^import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,
                (_, def, names, mod) =>
                    `const ${def} = __deps[${JSON.stringify(mod)}];` +
                    `const {${names.replace(/\s+as\s+/g, ': ')}} = __deps[${JSON.stringify(mod)}];`)
            // import { a, b as c } from 'mod';
            .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,
                (_, names, mod) => `const {${names.replace(/\s+as\s+/g, ': ')}} = __deps[${JSON.stringify(mod)}];`)
            // import D from 'mod';
            .replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm,
                (_, name, mod) => `const ${name} = __deps[${JSON.stringify(mod)}];`)
            // side-effect import
            .replace(/^import\s+['"]([^'"]+)['"];?/gm, (_, mod) => `__deps[${JSON.stringify(mod)}];`)
            // export forms
            .replace(/^export\s+(async\s+)?function\s+/gm, '$1function ')
            .replace(/^export\s+const\s+/gm, 'const ')
            .replace(/^export\s+let\s+/gm, 'let ')
            .replace(/^export\s+default\s+/gm, 'exports.default = ')
    );
}

/**
 * Execute a frontend ESM module.
 *
 * @param {string} file
 * @param {object} [options]
 * @param {object} [options.deps]      test doubles keyed by import specifier
 * @param {string[]} [options.exports] extra export names to return
 * @param {object} [options.globals]   window/document/localStorage stand-ins
 */
function loadEsmModule(file, { deps = {}, exports: extraExports = [], globals = {} } = {}) {
    const source = fs.readFileSync(file, 'utf8');

    const declared = [...source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map((m) => m[1]);
    const constExports = [...source.matchAll(/^export\s+(?:const|let)\s+(\w+)/gm)].map((m) => m[1]);
    const names = [...new Set([...declared, ...constExports, ...extraExports])];

    // Only bind the globals this file actually references.
    const used = KNOWN_GLOBALS.filter((g) => new RegExp(`\\b${g}\\b`).test(source));
    const bindings = used.map((g) => `const ${g} = __g[${JSON.stringify(g)}];`);

    const body = `${bindings.join('\n')}\n${transform(source)}\n;return { ${names.join(', ')} };`;

    // eslint-disable-next-line no-new-func
    const factory = new Function('__deps', '__g', body);
    return factory(deps, globals);
}

module.exports = { loadEsmModule, transform };
