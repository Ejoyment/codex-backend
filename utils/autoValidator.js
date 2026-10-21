/**
 * Auto Validator
 * Runs lint, typecheck, tests after agent mutations for self-healing
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const CodeFile = require('../models/CodeFile');
const path = require('path');

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

            return {
                hasConfig: true,
                scripts: pkg.scripts || {},
                hasTypeScript: !!hasTypeScript,
                hasEslint: !!hasEslint,
                deps: { ...pkg.dependencies, ...pkg.devDependencies }
            };
        } catch (error) {
            console.error('Error detecting config:', error);
            return { hasConfig: false };
        }
    }

    /**
     * Parse errors from output
     */
    parseErrors(output, source) {
        const errors = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // TypeScript errors: file.ts(line,col): error TSxxxx
            const tsMatch = line.match(/(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)/);
            if (tsMatch) {
                errors.push({
                    file: tsMatch[1].trim(),
                    line: parseInt(tsMatch[2]),
                    column: parseInt(tsMatch[3]),
                    severity: tsMatch[4],
                    message: tsMatch[5],
                    source: 'tsc',
                    raw: line
                });
                continue;
            }

            // ESLint errors
            const eslintMatch = line.match(/(.+?):(\d+):(\d+)\s+(error|warning)\s+(.+)/);
            if (eslintMatch && source === 'eslint') {
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
        }

        return errors;
    }

    /**
     * Validate workspace
     */
    async validate({ workspaceId, mutatedFiles = [], timeoutMs = 120000 }) {
        const results = {
            success: true,
            errors: [],
            warnings: [],
            commandsRun: [],
            summary: ''
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
                } catch (err) {
                    results.commandsRun.push('npm run typecheck (failed)');
                    const errors = this.parseErrors(err.stderr || err.stdout || err.message, 'tsc');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                }
            } else if (config.hasTypeScript) {
                try {
                    const { stdout, stderr } = await execPromise('npx tsc --noEmit --pretty false', { cwd, timeout: timeoutMs });
                    results.commandsRun.push('tsc --noEmit');
                    const errors = this.parseErrors(stderr || stdout, 'tsc');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                    }
                } catch (err) {
                    results.commandsRun.push('tsc --noEmit (failed)');
                    const errors = this.parseErrors(err.stderr || err.stdout || err.message, 'tsc');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                    }
                }
            }

            // Try lint
            if (results.errors.length === 0 && config.scripts.lint) {
                try {
                    const { stdout, stderr } = await execPromise('npm run lint', { cwd, timeout: timeoutMs });
                    results.commandsRun.push('npm run lint');
                    const errors = this.parseErrors(stderr || stdout, 'eslint');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                        results.warnings.push(...errors.filter(e => e.severity === 'warning'));
                    }
                } catch (err) {
                    results.commandsRun.push('npm run lint (failed)');
                    const errors = this.parseErrors(err.stderr || err.stdout || err.message, 'eslint');
                    if (errors.length > 0) {
                        results.errors.push(...errors.filter(e => e.severity === 'error'));
                    }
                }
            }

            results.success = results.errors.length === 0;
            results.summary = results.success 
                ? `Validation passed (${results.commandsRun.join(', ')})`
                : `Found ${results.errors.length} error(s)`;
        } catch (error) {
            console.error('Validation error:', error);
            results.summary = `Validation error: ${error.message}`;
        }

        return results;
    }
}

module.exports = new AutoValidator();
