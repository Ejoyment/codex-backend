/**
 * Auto Validator
 * Runs lint, typecheck, tests after agent mutations for self-healing
 * Enhanced with comprehensive error parsing
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const CodeFile = require('../models/CodeFile');

class AutoValidator {
    /**
     * Detect project configuration
     */
    async detectConfig(workspaceId) {
        try {
            const packageJsonFile = await CodeFile.findOne({
                company: workspaceId,
                $or: [
                    { path: '/package.json' },
                    { path: 'package.json' },
                    { name: 'package.json' }
                ]
            }).lean();

            if (!packageJsonFile) return { hasConfig: false };

            let pkg;
            try {
                pkg = JSON.parse(packageJsonFile.content);
            } catch (e) {
                return { hasConfig: false };
            }

            const hasTypeScript = await CodeFile.findOne({
                company: workspaceId,
                name: { $regex: /tsconfig\.json$/ }
            });

            const hasEslint = await CodeFile.findOne({
                company: workspaceId,
                name: { $regex: /\.eslintrc/ }
            });

            const hasJest = !!(pkg.devDependencies?.jest || pkg.dependencies?.jest || pkg.scripts?.test?.includes('jest'));
            const hasVitest = !!(pkg.devDependencies?.vitest || pkg.dependencies?.vitest);
            const hasVite = !!(pkg.devDependencies?.vite || pkg.dependencies?.vite);

            return {
                hasConfig: true,
                scripts: pkg.scripts || {},
                hasTypeScript: !!hasTypeScript,
                hasEslint: !!hasEslint,
                hasJest,
                hasVitest,
                hasVite,
                deps: { ...pkg.dependencies, ...pkg.devDependencies },
                pkgName: pkg.name
            };
        } catch (error) {
            console.error('Error detecting config:', error);
            return { hasConfig: false };
        }
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
                errors.push({
                    file: tsMatch[1].trim(),
                    line: parseInt(tsMatch[2]),
                    column: parseInt(tsMatch[3]),
                    severity: tsMatch[4],
                    code: tsMatch[5],
                    message: tsMatch[6],
                    source: 'tsc',
                    raw: line
                });
                continue;
            }

            // TypeScript errors alt format: file.ts:line:col - error TSxxxx: message
            tsMatch = line.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s+(.+)/);
            if (tsMatch) {
                errors.push({
                    file: tsMatch[1].trim(),
                    line: parseInt(tsMatch[2]),
                    column: parseInt(tsMatch[3]),
                    severity: tsMatch[4],
                    code: tsMatch[5],
                    message: tsMatch[6],
                    source: 'tsc',
                    raw: line
                });
                continue;
            }

            // ESLint errors
            let eslintMatch = line.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)/);
            if (eslintMatch && (source === 'eslint' || line.includes('eslint'))) {
                errors.push({
                    file: eslintMatch[1].trim(),
                    line: parseInt(eslintMatch[2]),
                    column: parseInt(eslintMatch[3]),
                    severity: eslintMatch[4],
                    message: eslintMatch[6] || eslintMatch[5],
                    rule: eslintMatch[5],
                    source: 'eslint',
                    raw: line
                });
                continue;
            }

            eslintMatch = line.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)\s+(error|warning)\s+(.+)/);
            if (eslintMatch && (source === 'eslint')) {
                errors.push({
                    file: eslintMatch[1].trim(),
                    line: parseInt(eslintMatch[2]),
                    column: parseInt(eslintMatch[3]),
                    severity: eslintMatch[4],
                    message: eslintMatch[5],
                    source: 'eslint',
                    raw: line
                });
                continue;
            }

            // Next.js / Webpack errors
            let webpackMatch = line.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)\s*-\s*(.+)/);
            if (webpackMatch && (line.includes('Module parse failed') || line.includes('SyntaxError'))) {
                errors.push({
                    file: webpackMatch[1].trim(),
                    line: parseInt(webpackMatch[2]),
                    column: parseInt(webpackMatch[3]),
                    severity: 'error',
                    message: webpackMatch[4],
                    source: 'webpack',
                    raw: line
                });
                continue;
            }

            // Jest test failures
            if (line.includes('FAIL') && line.match(/\.test\.|\.spec\./)) {
                const testMatch = line.match(/FAIL\s+(.+\.test\.[jt]sx?)/);
                if (testMatch) {
                    errors.push({
                        file: testMatch[1].trim(),
                        line: 0,
                        column: 0,
                        severity: 'error',
                        message: 'Test failed - see details',
                        source: 'jest',
                        raw: line
                    });
                }
            }

            // Vitest errors
            if (source === 'vitest' && line.includes('×') && line.match(/\.test\.|\.spec\./)) {
                errors.push({
                    file: line.match(/([^\s]+\.(?:test|spec)\.[jt]sx?)/)?.[1] || 'unknown',
                    line: 0,
                    column: 0,
                    severity: 'error',
                    message: line.trim(),
                    source: 'vitest',
                    raw: line
                });
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
     * Validate workspace
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
                results.summary = 'No package.json found, skipping validation';
                return results;
            }

            const gitService = require('./gitService');
            const workspacePath = gitService.getWorkspacePath ? gitService.getWorkspacePath(workspaceId) : null;
            const cwd = workspacePath || process.cwd();

            // Try typecheck first
            if (config.scripts.typecheck) {
                try {
                    const { stdout, stderr } = await execPromise('npm run typecheck', { cwd, timeout: timeoutMs });
                    results.commandsRun.push('npm run typecheck');
                    const errors = this.parseErrors(stderr || stdout, 'tsc');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                    results.details.typecheck = { passed: errors.filter(e => e.severity === 'error').length === 0, errors: errors.length };
                } catch (err) {
                    results.commandsRun.push('npm run typecheck (failed)');
                    const errors = this.parseErrors(err.stderr || err.stdout || err.message, 'tsc');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                    results.details.typecheck = { passed: false, errors: errors.length };
                }
            } else if (config.hasTypeScript) {
                try {
                    const { stdout, stderr } = await execPromise('npx tsc --noEmit --pretty false', { cwd, timeout: timeoutMs });
                    results.commandsRun.push('tsc --noEmit');
                    const errors = this.parseErrors(stderr || stdout, 'tsc');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                    results.details.typecheck = { passed: errors.filter(e => e.severity === 'error').length === 0, errors: errors.length };
                } catch (err) {
                    results.commandsRun.push('tsc --noEmit (failed)');
                    const errors = this.parseErrors(err.stderr || err.stdout || err.message, 'tsc');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                    results.details.typecheck = { passed: false, errors: errors.length };
                }
            }

            // Try lint if no type errors or as additional check
            if (config.scripts.lint || config.hasEslint) {
                try {
                    const lintCmd = config.scripts.lint ? 'npm run lint' : 'npx eslint . --ext .js,.jsx,.ts,.tsx --format compact';
                    const { stdout, stderr } = await execPromise(lintCmd, { cwd, timeout: timeoutMs });
                    results.commandsRun.push(config.scripts.lint || 'eslint');
                    const errors = this.parseErrors(stderr || stdout, 'eslint');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                    results.details.lint = { passed: errors.filter(e => e.severity === 'error').length === 0, errors: errors.length };
                } catch (err) {
                    results.commandsRun.push((config.scripts.lint || 'eslint') + ' (failed)');
                    const errors = this.parseErrors(err.stderr || err.stdout || err.message, 'eslint');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                    results.details.lint = { passed: false, errors: errors.length };
                }
            }

            // Run tests if available and quick check
            if (config.scripts.test && !config.scripts.test.includes('watch')) {
                try {
                    const testCmd = config.scripts.test.includes('--') ? config.scripts.test : 'npm test -- --watchAll=false --maxWorkers=1 --passWithNoTests';
                    const { stdout, stderr } = await execPromise(testCmd, { cwd, timeout: timeoutMs });
                    results.commandsRun.push('tests');
                    const errors = this.parseErrors(stderr || stdout, config.hasVitest ? 'vitest' : 'jest');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                    }
                    results.details.tests = { passed: errors.filter(e => e.severity === 'error').length === 0, errors: errors.length };
                } catch (err) {
                    results.commandsRun.push('tests (failed)');
                    const errors = this.parseErrors(err.stderr || err.stdout || err.message, config.hasVitest ? 'vitest' : 'jest');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                    }
                    results.details.tests = { passed: false, errors: errors.length };
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
