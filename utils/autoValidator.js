/**
 * Auto Validator
 * Runs lint, typecheck, tests after agent mutations for self-healing
 * Enhanced with comprehensive error parsing across languages.
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const CodeFile = require('../models/CodeFile');

/**
 * Per-language validation toolchains. A project is validated by installing its
 * dependencies then running its check command; output is parsed by the named
 * source so file:line and severity surface correctly.
 */
const LANGUAGE_CONFIGS = {
  node: {
    manifests: ['package.json'],
    install: ({ lockfile }) => {
      if (lockfile === 'pnpm-lock.yaml') return 'pnpm install --frozen-lockfile';
      if (lockfile === 'yarn.lock') return 'yarn install --frozen-lockfile';
      return 'npm ci';
    },
    checks: [
      { name: 'typecheck', source: 'tsc', cmd: ({ scripts }) => scripts.typecheck || 'npx tsc --noEmit --pretty false' },
      { name: 'lint', source: 'eslint', cmd: ({ scripts }) => scripts.lint || 'npx eslint . --ext .js,.jsx,.ts,.tsx --format compact' },
      { name: 'tests', source: configSource => configSource === 'vitest' ? 'vitest' : 'jest', cmd: ({ scripts }) => scripts.test || 'npm test -- --watchAll=false --maxWorkers=1 --passWithNoTests' },
    ],
  },
  python: {
    manifests: ['requirements.txt', 'pyproject.toml', 'pipfile'],
    install: ({ lockfile }) => {
      if (lockfile === 'poetry.lock') return 'poetry install --no-interaction';
      return 'pip install -r requirements.txt';
    },
    checks: [
      { name: 'typecheck', source: 'python', cmd: () => 'python -m py_compile *.py || true' },
      { name: 'lint', source: 'python', cmd: () => 'python -m flake8 . --max-line-length=100 || true' },
      { name: 'tests', source: 'python', cmd: () => 'python -m pytest -q || true' },
    ],
  },
  go: {
    manifests: ['go.mod'],
    install: () => 'go mod download',
    checks: [
      { name: 'build', source: 'go', cmd: () => 'go build ./...' },
      { name: 'vet', source: 'go', cmd: () => 'go vet ./...' },
      { name: 'tests', source: 'go', cmd: () => 'go test ./...' },
    ],
  },
  rust: {
    manifests: ['cargo.toml'],
    install: () => 'cargo fetch',
    checks: [
      { name: 'build', source: 'rust', cmd: () => 'cargo build' },
      { name: 'clippy', source: 'rust', cmd: () => 'cargo clippy -- -D warnings || true' },
      { name: 'tests', source: 'rust', cmd: () => 'cargo test' },
    ],
  },
  java: {
    manifests: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    install: ({ manifest }) => manifest === 'pom.xml' ? 'mvn dependency:resolve -q' : 'gradle dependencies --configuration runtimeClasspath -q',
    checks: [
      { name: 'build', source: 'java', cmd: ({ manifest }) => manifest === 'pom.xml' ? 'mvn compile -q' : 'gradle compileJava' },
      { name: 'tests', source: 'java', cmd: ({ manifest }) => manifest === 'pom.xml' ? 'mvn test -q' : 'gradle test' },
    ],
  },
  ruby: {
    manifests: ['gemfile'],
    install: () => 'bundle install',
    checks: [
      { name: 'lint', source: 'ruby', cmd: () => 'bundle exec rubocop --format progress || true' },
      { name: 'tests', source: 'ruby', cmd: () => 'bundle exec rspec --format progress || true' },
    ],
  },
  php: {
    manifests: ['composer.json'],
    install: () => 'composer install --no-interaction',
    checks: [
      { name: 'lint', source: 'php', cmd: () => 'find . -name "*.php" -exec php -l {} \\; || true' },
      { name: 'tests', source: 'php', cmd: () => 'php vendor/bin/phpunit --no-coverage || true' },
    ],
  },
  elixir: {
    manifests: ['mix.exs'],
    install: () => 'mix deps.get',
    checks: [
      { name: 'compile', source: 'elixir', cmd: () => 'mix compile --force || true' },
      { name: 'tests', source: 'elixir', cmd: () => 'mix test || true' },
    ],
  },
  swift: {
    manifests: ['package.swift'],
    install: () => 'swift package resolve',
    checks: [
      { name: 'build', source: 'swift', cmd: () => 'swift build' },
      { name: 'tests', source: 'swift', cmd: () => 'swift test' },
    ],
  },
  dart: {
    manifests: ['pubspec.yaml'],
    install: () => 'dart pub get',
    checks: [
      { name: 'analyze', source: 'dart', cmd: () => 'dart analyze' },
      { name: 'tests', source: 'dart', cmd: () => 'dart test' },
    ],
  },
  dotnet: {
    manifests: ['*.csproj', '*.fsproj', '*.vbproj', 'solution.sln', 'sln'],
    install: () => 'dotnet restore',
    checks: [
      { name: 'build', source: 'dotnet', cmd: () => 'dotnet build' },
      { name: 'tests', source: 'dotnet', cmd: () => 'dotnet test' },
    ],
  },
};

// File markers that classify a project's language by root-first presence.
const LANGUAGE_MARKERS = [
  ['python', ['pyproject.toml', 'pipfile', 'requirements.txt']],
  ['go', ['go.mod']],
  ['rust', ['cargo.toml']],
  ['java', ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts']],
  ['ruby', ['gemfile']],
  ['php', ['composer.json']],
  ['elixir', ['mix.exs']],
  ['swift', ['package.swift']],
  ['dart', ['pubspec.yaml']],
  ['dotnet', ['*.csproj', '*.fsproj', '*.vbproj', 'solution.sln', 'sln']],
  ['node', ['package.json']],
];

class AutoValidator {
    /**
     * Detect project configuration across all supported languages.
     */
    async detectConfig(workspaceId) {
        try {
            const entries = await CodeFile.find({
                company: workspaceId,
            })
            .select('name path')
            .limit(2000)
            .lean();

            if (!entries || !entries.length) return { hasConfig: false };

            const names = entries.map((e) => String(e.name || '').toLowerCase()).filter(Boolean);
            const detectedLang = this.classifyLanguage(names);

            if (!detectedLang) return { hasConfig: false };

            const cfg = LANGUAGE_CONFIGS[detectedLang];
            if (!cfg) return { hasConfig: false };

            const manifests = cfg.manifests.map((m) => {
                const re = new RegExp(m.replace(/\*/g, '.*').replace(/\./g, '\\.'));
                return entries.find((e) => re.test(String(e.name || '').toLowerCase()));
            }).filter(Boolean);

            const lockfile = this.detectLockfile(names);

            return {
                hasConfig: true,
                language: detectedLang,
                manifests,
                installScript: cfg.install({ lockfile }),
                checks: cfg.checks,
            };
        } catch (error) {
            console.error('Error detecting config:', error);
            return { hasConfig: false };
        }
    }

    /**
     * Classify a project's language by the highest-priority manifest present.
     */
    classifyLanguage(names = []) {
        const nameSet = new Set(names);
        for (const [lang, markers] of LANGUAGE_MARKERS) {
            for (const marker of markers) {
                if (nameSet.has(marker.toLowerCase())) return lang;
            }
        }
        return null;
    }

    detectLockfile(names = []) {
        const nameSet = new Set(names);
        if (nameSet.has('pnpm-lock.yaml')) return 'pnpm-lock.yaml';
        if (nameSet.has('yarn.lock')) return 'yarn.lock';
        if (nameSet.has('package-lock.json')) return 'package-lock.json';
        if (nameSet.has('poetry.lock')) return 'poetry.lock';
        if (nameSet.has('go.sum')) return 'go.sum';
        if (nameSet.has('cargo.lock')) return 'cargo.lock';
        if (nameSet.has('mix.lock')) return 'mix.lock';
        if (nameSet.has('package.swift.lock')) return 'package.swift.lock';
        if (nameSet.has('pubspec.lock')) return 'pubspec.lock';
        return null;
    }

    /**
     * Parse errors from output - comprehensive
     */
    parseErrors(output, source) {
        const errors = [];
        if (!output) return errors;
        const lines = output.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // TypeScript errors: file.ts(line,col): error TSxxxx: message
            let tsMatch = line.match(/([^\s(]+\.[jt]sx?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)/);
            if (tsMatch) {
                errors.push({ file: tsMatch[1].trim(), line: parseInt(tsMatch[2]), column: parseInt(tsMatch[3]), severity: tsMatch[4], code: tsMatch[5], message: tsMatch[6], source: 'tsc', raw: line });
                continue;
            }

            // TypeScript errors alt format: file.ts:line:col - error TSxxxx: message
            tsMatch = line.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s+(.+)/);
            if (tsMatch) {
                errors.push({ file: tsMatch[1].trim(), line: parseInt(tsMatch[2]), column: parseInt(tsMatch[3]), severity: tsMatch[4], code: tsMatch[5], message: tsMatch[6], source: 'tsc', raw: line });
                continue;
            }

            // ESLint errors
            let eslintMatch = line.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)/);
            if (eslintMatch && (source === 'eslint' || line.includes('eslint'))) {
                errors.push({ file: eslintMatch[1].trim(), line: parseInt(eslintMatch[2]), column: parseInt(eslintMatch[3]), severity: eslintMatch[4], message: eslintMatch[6] || eslintMatch[5], rule: eslintMatch[5], source: 'eslint', raw: line });
                continue;
            }

            eslintMatch = line.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)\s+(error|warning)\s+(.+)/);
            if (eslintMatch && (source === 'eslint')) {
                errors.push({ file: eslintMatch[1].trim(), line: parseInt(eslintMatch[2]), column: parseInt(eslintMatch[3]), severity: eslintMatch[4], message: eslintMatch[5], source: 'eslint', raw: line });
                continue;
            }

            // Next.js / Webpack errors
            let webpackMatch = line.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)\s*-\s*(.+)/);
            if (webpackMatch && (line.includes('Module parse failed') || line.includes('SyntaxError'))) {
                errors.push({ file: webpackMatch[1].trim(), line: parseInt(webpackMatch[2]), column: parseInt(webpackMatch[3]), severity: 'error', message: webpackMatch[4], source: 'webpack', raw: line });
                continue;
            }

            // Jest test failures
            if (line.includes('FAIL') && line.match(/\.test\.|\.spec\./)) {
                const testMatch = line.match(/FAIL\s+(.+\.test\.[jt]sx?)/);
                if (testMatch) {
                    errors.push({ file: testMatch[1].trim(), line: 0, column: 0, severity: 'error', message: 'Test failed - see details', source: 'jest', raw: line });
                    continue;
                }
            }

            // Vitest errors
            if (source === 'vitest' && line.includes('×') && line.match(/\.test\.|\.spec\./)) {
                errors.push({ file: line.match(/([^\s]+\.(?:test|spec)\.[jt]sx?)/)?.[1] || 'unknown', line: 0, column: 0, severity: 'error', message: line.trim(), source: 'vitest', raw: line });
                continue;
            }

            // Go errors: file.go:line:col: error message
            const goMatch = line.match(/([^\s:]+\.go):(\d+):(\d+):\s*(.+)/);
            if (source === 'go' && goMatch) {
                errors.push({ file: goMatch[1].trim(), line: parseInt(goMatch[2]), column: parseInt(goMatch[3]), severity: 'error', message: goMatch[4], source: 'go', raw: line });
                continue;
            }

            // Rust errors: error[E####]: message ... --> file.rs:line:col
            const rustMatch = line.match(/--> ([^\s:]+):(\d+):(\d+)/);
            if (source === 'rust' && rustMatch) {
                errors.push({ file: rustMatch[1].trim(), line: parseInt(rustMatch[2]), column: parseInt(rustMatch[3]), severity: 'error', message: line.includes('error[') ? line : '', source: 'rust', raw: line });
                continue;
            }

            // Python traceback file references
            const pyMatch = line.match(/  File "([^"]+)", line (\d+)/);
            if (source === 'python' && pyMatch) {
                errors.push({ file: pyMatch[1].trim(), line: parseInt(pyMatch[2]), column: 0, severity: 'error', message: line.trim(), source: 'python', raw: line });
                continue;
            }

            // Generic compiler: file.ext:line:col: error message
            const genMatch = line.match(/([^\s:]+\.(?:js|ts|py|go|rs|java|rb|php|cs|dart|ex|exs|swift|c|cc|cpp|h|hpp)):(\d+):(\d+):\s*(error|warning|fatal|panic):\s*(.+)/);
            if (genMatch) {
                errors.push({ file: genMatch[1].trim(), line: parseInt(genMatch[2]), column: parseInt(genMatch[3]), severity: genMatch[4], code: '', message: genMatch[5], source: source || 'generic', raw: line });
                continue;
            }
        }

        // Deduplicate
        const seen = new Set();
        return errors.filter(e => {
            const key = `${e.file}:${e.line}:${e.message.substring(0, 50)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Validate workspace across all supported languages.
     */
    async validate({ workspaceId, mutatedFiles = [], timeoutMs = 180000 }) {
        const results = {
            success: true,
            errors: [],
            warnings: [],
            commandsRun: [],
            summary: '',
            details: {}
        };

        try {
            const config = await this.detectConfig(workspaceId);
            if (!config.hasConfig) {
                results.summary = 'No recognized project manifest found, skipping validation';
                return results;
            }

            const gitService = require('./gitService');
            const workspacePath = gitService.getWorkspacePath ? gitService.getWorkspacePath(workspaceId) : null;
            const cwd = workspacePath || process.cwd();

            const effectiveTimeout = Math.max(timeoutMs, 60000);

            // Install dependencies before any check. Without this the workspace
            // is just source on disk: every check fails with "Cannot find
            // module" / "module not found" and the repair loop reports false
            // failures.
            if (config.installScript) {
                const installTimeout = Math.max(effectiveTimeout, 120000);
                try {
                    const { stdout, stderr } = await execPromise(config.installScript, {
                        cwd,
                        timeout: installTimeout,
                        maxBuffer: 20 * 1024 * 1024,
                        env: { ...process.env, CI: 'true', npm_config_audit: 'false' },
                    });
                    results.commandsRun.push(config.installScript);
                    results.details.install = { passed: true };
                } catch (err) {
                    results.commandsRun.push(`${config.installScript} (failed)`);
                    const installErrors = this.parseErrors(err.stderr || err.stdout || err.message, 'install');
                    if (installErrors.length) {
                        results.errors.push(...installErrors.filter(e => e.severity === 'error'));
                    }
                    results.details.install = { passed: false, error: (err.message || '').slice(0, 500) };
                    results.success = results.errors.length === 0;
                    results.summary = `Install failed: ${(err.message || '').slice(0, 200)}`;
                    return results;
                }
            }

            // Run each language check command in order; stop early on failure
            // so one broken check does not cascade into unrelated noise.
            for (const check of config.checks || []) {
                const cmd = typeof check.cmd === 'function' ? check.cmd({ scripts: config.scripts, manifest: config.manifests && config.manifests[0] }) : check.cmd;
                try {
                    const { stdout, stderr } = await execPromise(cmd, { cwd, timeout: effectiveTimeout, maxBuffer: 20 * 1024 * 1024 });
                    const output = stderr || stdout || '';
                    results.commandsRun.push(`${check.name} (${cmd})`);
                    const errors = this.parseErrors(output, check.source);
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                    results.details[check.name] = { passed: errors.filter(e => e.severity === 'error').length === 0, errors: errors.length };
                    if (errors.filter(e => e.severity === 'error').length > 0) {
                        // stop after the first failing check so the agent gets
                        // focused, actionable feedback rather than noise.
                        break;
                    }
                } catch (err) {
                    results.commandsRun.push(`${check.name} (failed)`);
                    const errors = this.parseErrors(err.stderr || err.stdout || err.message, check.source);
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                    results.details[check.name] = { passed: false, errors: errors.length };
                    break;
                }
            }

            results.success = results.errors.length === 0;
            results.summary = results.success
                ? `Validation passed (${results.commandsRun.join(', ')})`
                : `Found ${results.errors.length} error(s), ${results.warnings.length} warning(s)`;
        } catch (error) {
            console.error('Validation error:', error);
            results.summary = `Validation error: ${error.message}`;
        }

        return results;
    }
}

module.exports = new AutoValidator();
