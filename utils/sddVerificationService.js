const mongoose = require('mongoose');
const SpecModel = require('../models/SpecModel');
const LocalTask = require('../models/LocalTask');
const LocalProject = require('../models/LocalProject');
const CodeFile = require('../models/CodeFile');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const verificationRunner = require('./specVerificationRunner');

const AST_LANGUAGES = {
  javascript: 'javascript',
  js: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  go: 'go',
  rust: 'rust',
  java: 'java',
  rb: 'ruby',
  ruby: 'ruby',
  php: 'php',
};

const TRUST_STATES = Object.freeze(['pass', 'fail', 'not_evaluated']);

/** Full project-relative path for a CodeFile-shaped object. */
function fileFullPath(file) {
  return verificationRunner.fullPathFor(file) || '';
}

/** Convert a simple glob (`src/**`, `*.js`) to an anchored RegExp. */
function globToRegExp(pattern) {
  const escaped = String(pattern || '')
    .split('**')
    .map((part) => part.split('*').map((segment) => segment.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${escaped}$`);
}

function normalizeCheckStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'pass' || status === 'passed' || status === 'success') return 'pass';
  if (status === 'fail' || status === 'failed' || status === 'error') return 'fail';
  return 'not_evaluated';
}

/**
 * Real import extraction. JavaScript/TypeScript goes through the AST; if the
 * parser rejects the file (JSX, decorators, newer syntax) we fall back to a
 * conservative import/require scan rather than silently reporting a pass.
 */
function collectImports(content) {
  const text = String(content || '');
  const imports = new Set();
  try {
    const ast = acorn.parse(text, { ecmaVersion: 2022, sourceType: 'module' });
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'ImportDeclaration' && node.source?.value) imports.add(node.source.value);
      if (node.type === 'ExportAllDeclaration' && node.source?.value) imports.add(node.source.value);
      if (node.type === 'ExportNamedDeclaration' && node.source?.value) imports.add(node.source.value);
      if (node.type === 'CallExpression' && node.callee?.name === 'require' && node.arguments?.[0]?.value) {
        imports.add(node.arguments[0].value);
      }
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === 'object' && child.type) visit(child);
      }
    };
    visit(ast);
  } catch (_) {
    const patterns = [
      /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) imports.add(match[1]);
    }
  }
  return [...imports];
}

function routeMatches(content) {
  const text = String(content || '');
  const matches = [];
  const patterns = [
    // Express/Koa/Fastify style: app.get('/health', ...), router.post("/x")
    /(?:^|[^\w.])(?:app|router|server|fastify)\.(get|post|put|patch|delete|all|use|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    // Python decorators: @app.get("/health"), @router.post('/x')
    /@(?:app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*['"]([^'"]+)['"]/g,
    // Next.js route handlers: export async function GET(...)
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(/g,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        method: String(match[1] || '').toLowerCase(),
        path: match[2] || '',
        index: match.index,
      });
    }
  }
  return matches;
}

function routeFromConfig(config = {}) {
  const raw = config.route || config.path || config.url || '';
  if (!raw) return { method: null, path: null };
  const parts = String(raw).trim().split(/\s+/);
  if (parts.length >= 2 && /^[a-z]+$/i.test(parts[0])) {
    return { method: parts[0].toLowerCase(), path: parts.slice(1).join(' ') };
  }
  return {
    method: config.method ? String(config.method).toLowerCase() : null,
    path: String(raw),
  };
}

function verdictFor(results = []) {
  const blocking = results.filter((result) => result.severity === 'blocking');
  if (blocking.some((result) => result.status === 'fail')) return 'fail';
  if (blocking.some((result) => result.status === 'not_evaluated')) return 'not_evaluated';
  return 'pass';
}

function statusForVerdict(verdict, results = []) {
  if (verdict === 'fail') return 'failing';
  if (verdict === 'not_evaluated') return 'partial';
  const warning = results.some((result) => result.severity === 'warning' && result.status !== 'pass');
  return warning ? 'warning' : 'healthy';
}

class SDDVerificationService {
  constructor() {
    this.driftWarnings = [];
    this.astCache = new Map();
  }

  parseSpecFrontmatter(content) {
    if (!content || !content.startsWith('---')) return null;
    const endIdx = content.indexOf('---', 3);
    if (endIdx === -1) return null;

    const frontmatter = content.substring(3, endIdx).trim();
    const body = content.substring(endIdx + 3).trim();
    const parsed = {};

    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      if (key === 'assertions') {
        parsed.assertions = this.parseAssertions(value);
      } else if (key === 'target_modules' || key === 'targetFiles') {
        parsed[key] = this.parseArrayValue(value);
      } else {
        parsed[key] = value.replace(/^["']|["']$/g, '');
      }
    }

    return { frontmatter: parsed, body };
  }

  parseAssertions(value) {
    const assertions = [];
    const lines = value.split('\n').filter(l => l.trim().startsWith('- '));
    for (const line of lines) {
      const rule = line.trim().substring(2).replace(/^["']|["']$/g, '');
      if (rule) assertions.push({ rule });
    }
    return assertions;
  }

  parseArrayValue(value) {
    try {
      return JSON.parse(value.replace(/'/g, '"'));
    } catch {
      return value.split(',').map(v => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  async verifySpec(specId, taskId = null) {
    try {
      const spec = await SpecModel.findById(specId);
      if (!spec) {
        return { success: false, error: 'Spec not found' };
      }

      const parsedSpec = this.parseSpecFrontmatter(spec.content);
      if (parsedSpec) {
        spec.assertions = parsedSpec.frontmatter.assertions || spec.assertions;
        spec.targetModules = parsedSpec.frontmatter.target_modules || spec.targetModules;
      }

      // Verification is project-scoped: one project, one contract. The
      // workspace is collaboration context only and never widens the file set.
      const codeFiles = await this.getSpecCodeFiles(spec);
      const specObject = typeof spec.toObject === 'function' ? spec.toObject() : spec;

      const commandResult = spec.verificationCommand
        ? await verificationRunner.runVerificationCommand({
          command: spec.verificationCommand,
          files: codeFiles,
        })
        : null;
      const requirementCommands = await this.runRequirementCommands(specObject, codeFiles);

      const assertions = Array.isArray(spec.assertions) ? spec.assertions : [];
      const results = [];
      for (const assertion of assertions) {
        results.push(await this.evaluateAssertion(assertion, spec, taskId, codeFiles));
      }
      const legacyFailed = results.some((result) => result.status === 'fail');

      const structured = await this.verifySpecSnapshot(specObject, codeFiles, {
        commandResult,
        requirementCommands,
      });

      const gateResults = [...structured.requirements];
      if (structured.verificationCommand && structured.verificationCommand.status !== 'pass') {
        gateResults.push({
          id: 'verification-command',
          severity: 'blocking',
          status: structured.verificationCommand.status,
        });
      }
      const verdict = legacyFailed ? 'fail' : verdictFor(gateResults);
      const status = statusForVerdict(verdict, structured.requirements);
      const allPassed = verdict === 'pass';

      spec.requirements = (spec.requirements || []).map((requirement) => {
        const result = structured.requirements.find((item) => item.id === requirement.id);
        return result
          ? { ...(requirement.toObject?.() || requirement), status: result.status, evidence: result.evidence }
          : requirement;
      });
      spec.status = status;
      spec.verdict = verdict;
      spec.lastValidatedAt = new Date();
      spec.lastValidationResult = {
        ...structured,
        results,
        verdict,
        passed: allPassed,
        status,
      };
      await spec.save();

      if (taskId) {
        await LocalTask.findByIdAndUpdate(taskId, {
          $set: {
            'agentExecution.logs': [{
              timestamp: new Date(),
              message: `Spec verification ${verdict === 'pass' ? 'passed' : verdict === 'fail' ? 'failed' : 'was not fully evaluated'}: ${assertions.length} assertions checked`
            }]
          }
        });
      }

      return {
        success: true,
        passed: allPassed,
        verdict,
        specId: spec._id,
        checkedAssertions: assertions.length,
        passedAssertions: results.filter(r => r.status === 'pass').length,
        failedAssertions: results.filter(r => r.status === 'fail').length,
        notEvaluatedAssertions: results.filter(r => r.status === 'not_evaluated').length,
        results,
        requirements: structured.requirements,
        forbiddenImports: structured.forbiddenImports,
        verificationCommand: structured.verificationCommand,
        status,
        checkedAt: spec.lastValidatedAt,
        summary: verdict === 'pass'
          ? 'All blocking requirements passed'
          : verdict === 'fail'
            ? 'One or more blocking requirements failed'
            : 'Some blocking requirements could not be evaluated',
      };
    } catch (error) {
      console.error('SDD verification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Contract tests that carry their own command run separately from the
   * spec-wide verification command. Capped so a spec cannot turn one
   * verification click into an unbounded number of container runs.
   */
  async runRequirementCommands(spec, files = [], { hostDir = null } = {}) {
    const commands = {};
    const candidates = (spec.requirements || [])
      .filter((requirement) => requirement.checkType === 'contract_test')
      .filter((requirement) => requirement.checkConfig?.command)
      .slice(0, 5);
    for (const requirement of candidates) {
      commands[requirement.id] = await verificationRunner.runVerificationCommand({
        command: requirement.checkConfig.command,
        files,
        hostDir,
      });
    }
    return commands;
  }

  async verifySpecSnapshot(spec, codeFiles = [], options = {}) {
    const { commandResult = null, requirementCommands = {} } = options;
    const patterns = [...(spec.targetModules || []), ...(spec.targetFiles || [])];
    const inScope = (filePath) => {
      if (!patterns.length) return true;
      return patterns.some((pattern) => globToRegExp(pattern).test(filePath));
    };
    const files = (codeFiles || []).map((file) => ({ ...file, fullPath: fileFullPath(file) }));
    const scopedFiles = files.filter((file) => inScope(file.fullPath));

    const evaluate = (requirement) => {
      const config = requirement.checkConfig || {};
      const base = {
        id: requirement.id,
        text: requirement.text,
        severity: requirement.severity || 'blocking',
        checkType: requirement.checkType || 'manual',
      };

      if (requirement.checkType === 'file_exists') {
        const wanted = String(config.path || config.file || config.glob || '').replace(/^\/+/, '');
        if (!wanted) return { ...base, status: 'not_evaluated', evidence: 'No path configured for this file check.' };
        const match = files.find((file) => (
          /[*?]/.test(wanted) ? globToRegExp(wanted).test(file.fullPath) : file.fullPath === wanted
        ));
        return {
          ...base,
          status: match ? 'pass' : 'fail',
          evidence: match ? `Found ${match.fullPath}` : `File not found: ${wanted}`,
        };
      }

      if (requirement.checkType === 'code_pattern') {
        if (!config.pattern) return { ...base, status: 'not_evaluated', evidence: 'No pattern configured for this check.' };
        try {
          const pattern = new RegExp(config.pattern, config.flags || '');
          const candidates = config.files?.length
            ? scopedFiles.filter((file) => config.files.some((candidate) => String(candidate).replace(/^\/+/, '') === file.fullPath))
            : scopedFiles;
          const match = candidates.find((file) => pattern.test(file.content || ''));
          return {
            ...base,
            status: match ? 'pass' : 'fail',
            evidence: match ? `Pattern found in ${match.fullPath}` : 'Pattern not found in the scoped files',
          };
        } catch (error) {
          return { ...base, status: 'fail', evidence: `Invalid pattern: ${error.message}` };
        }
      }

      if (requirement.checkType === 'ast_import') {
        const raw = config.module || config.import || config.imports || config.pattern;
        const configured = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(String);
        if (!configured.length) return { ...base, status: 'not_evaluated', evidence: 'No import configured for this check.' };
        const mode = config.mode === 'forbid' || configured.every((value) => value.startsWith('!')) ? 'forbid' : 'require';
        const wanted = configured.map((value) => value.replace(/^!/, ''));
        const found = [];
        for (const file of scopedFiles) {
          for (const imported of collectImports(file.content)) {
            if (wanted.some((module) => imported === module || imported.startsWith(`${module}/`))) {
              found.push({ file: file.fullPath, module: imported });
            }
          }
        }
        const passed = mode === 'forbid' ? found.length === 0 : wanted.every((module) => (
          found.some((item) => item.module === module || item.module.startsWith(`${module}/`))
        ));
        const evidence = mode === 'forbid'
          ? (passed ? `No forbidden import of ${wanted.join(', ')}` : `Forbidden import ${found[0]?.module} in ${found[0]?.file}`)
          : (passed ? `Found import ${wanted.join(', ')} in ${found[0]?.file}` : `Import not found: ${wanted.join(', ')}`);
        return { ...base, status: passed ? 'pass' : 'fail', evidence };
      }

      if (requirement.checkType === 'route') {
        const route = routeFromConfig(config);
        if (!route.path) return { ...base, status: 'not_evaluated', evidence: 'No route path configured for this check.' };
        const matches = [];
        for (const file of scopedFiles) {
          for (const candidate of routeMatches(file.content)) {
            if (route.path && candidate.path !== route.path) continue;
            if (route.method && candidate.method !== route.method) continue;
            matches.push({ file: file.fullPath, ...candidate });
          }
        }
        const label = `${route.method ? `${route.method.toUpperCase()} ` : ''}${route.path}`;
        return {
          ...base,
          status: matches.length ? 'pass' : 'fail',
          evidence: matches.length ? `Route ${label} found in ${matches[0].file}` : `Route ${label} not found`,
        };
      }

      if (requirement.checkType === 'test_name' || requirement.checkType === 'contract_test') {
        const result = requirementCommands[requirement.id] || commandResult;
        if (!result) {
          return {
            ...base,
            status: 'not_evaluated',
            evidence: 'This check runs in the isolated verification runner, which was not available for this pass.',
          };
        }
        const status = normalizeCheckStatus(result.status);
        const detail = result.status === 'not_evaluated'
          ? result.reason || 'The command did not run.'
          : `${result.command || 'command'} exited ${result.exitCode ?? '?'}`;
        const output = verificationRunner.tailOutput(result.output, 1200);
        return {
          ...base,
          status,
          evidence: output ? `${detail}\n${output}` : detail,
        };
      }

      if (requirement.checkType === 'ai_review') {
        return { ...base, status: 'not_evaluated', evidence: 'Requires human or secondary-model review.' };
      }

      return {
        ...base,
        status: 'not_evaluated',
        evidence: requirement.checkType === 'manual'
          ? 'Manual check — not evaluated automatically.'
          : `Unsupported check type: ${requirement.checkType || '(none)'}`,
      };
    };

    const results = (spec.requirements || []).map(evaluate);

    const forbiddenImportResults = (spec.forbiddenImports || []).map((forbidden) => {
      const match = scopedFiles.find((file) => {
        const imports = collectImports(file.content);
        if (imports.length) {
          return imports.some((imported) => imported === forbidden || imported.startsWith(`${forbidden}/`));
        }
        return String(file.content || '').includes(forbidden);
      });
      return {
        forbidden,
        status: match ? 'fail' : 'pass',
        evidence: match ? `Found in ${match.fullPath}` : 'Not found in the project files',
      };
    });

    const gateResults = [
      ...results,
      ...forbiddenImportResults.map((result) => ({ severity: 'blocking', status: result.status })),
    ];
    const verdict = verdictFor(gateResults);

    let verificationCommand = null;
    if (spec.verificationCommand) {
      verificationCommand = commandResult || {
        command: spec.verificationCommand,
        status: 'not_evaluated',
        reason: 'Verification command has not run in this context.',
        output: '',
      };
    }

    return {
      specId: spec._id,
      title: spec.title,
      passed: verdict === 'pass',
      verdict,
      requirements: results,
      forbiddenImports: forbiddenImportResults,
      verificationCommand,
      checkedAt: new Date(),
    };
  }

  /**
   * Pre-approval verification for several specs against one proposed file set.
   * Commands are deduplicated by command string so a shared command runs once.
   */
  async verifySpecSnapshots(specs = [], codeFiles = [], { hostDir = null } = {}) {
    const commandResults = new Map();
    for (const spec of specs) {
      const command = String(spec.verificationCommand || '').trim();
      if (!command || commandResults.has(command)) continue;
      commandResults.set(command, await verificationRunner.runVerificationCommand({
        command,
        files: codeFiles,
        hostDir,
      }));
    }

    const results = [];
    for (const spec of specs) {
      const command = String(spec.verificationCommand || '').trim();
      const requirementCommands = await this.runRequirementCommands(spec, codeFiles, { hostDir });
      results.push(await this.verifySpecSnapshot(spec, codeFiles, {
        commandResult: command ? commandResults.get(command) : null,
        requirementCommands,
      }));
    }
    return results;
  }

  async evaluateAssertion(assertion, spec, taskId, codeFiles = []) {
    const rule = assertion.rule || '';
    const target = assertion.target || '';

    try {
      if (rule.includes('RS256')) {
        return await this.checkRS256Assertion(target, spec, codeFiles);
      }
      if (rule.includes('Token expiration')) {
        return await this.checkTokenExpirationAssertion(target, spec, codeFiles);
      }
      if (rule.includes('middleware')) {
        return await this.checkMiddlewareAssertion(target, spec, codeFiles);
      }
      if (rule.includes('import')) {
        return await this.checkImportAssertion(target, spec, codeFiles);
      }
      if (rule.includes('test')) {
        return await this.runTestAssertion(target, spec, codeFiles);
      }

      const result = await this.runGenericAssertion(rule, target, spec, taskId);
      return result;
    } catch (error) {
      return { rule, status: 'fail', passed: false, error: error.message, assertion };
    }
  }

  /** Files a legacy assertion applies to, always inside the project scope. */
  legacyFiles(codeFiles, target, spec) {
    const patterns = [target, ...(spec.targetModules || [])].filter(Boolean);
    if (!patterns.length) return codeFiles;
    return codeFiles.filter((file) => {
      const full = fileFullPath(file);
      return patterns.some((pattern) => {
        const normalized = String(pattern).replace(/^\/+/, '');
        return full === normalized || full.startsWith(`${normalized.replace(/\/$/, '')}/`) || globToRegExp(normalized).test(full);
      });
    });
  }

  async checkRS256Assertion(target, spec, codeFiles = []) {
    const files = this.legacyFiles(codeFiles, target, spec);
    const foundRS256 = files.some((file) => String(file.content || '').includes('RS256'));
    return {
      rule: 'Must use RS256 algorithm for token signing',
      status: foundRS256 ? 'pass' : 'fail',
      passed: foundRS256,
      assertion: { rule: 'Must use RS256 algorithm for token signing', target },
    };
  }

  async checkTokenExpirationAssertion(target, spec, codeFiles = []) {
    const files = this.legacyFiles(codeFiles, target, spec);
    let foundValid = true;
    for (const file of files) {
      if (file.content && file.content.includes('expire')) {
        const expMatch = file.content.match(/expir(?:e|ation)\s*[:=]\s*(\d+)/);
        if (expMatch && parseInt(expMatch[1]) > 3600) {
          foundValid = false;
          break;
        }
      }
    }
    return {
      rule: 'Token expiration must not exceed 3600 seconds',
      status: foundValid ? 'pass' : 'fail',
      passed: foundValid,
      assertion: { rule: 'Token expiration must not exceed 3600 seconds', target },
    };
  }

  async checkMiddlewareAssertion(target, spec, codeFiles = []) {
    const files = this.legacyFiles(codeFiles, target, spec);
    const found = files.every((file) => !file.content || String(file.content).includes('rateLimiter'));
    return {
      rule: 'Must pass through rateLimiter middleware',
      status: found ? 'pass' : 'fail',
      passed: found,
      assertion: { rule: 'Must pass through rateLimiter middleware', target },
    };
  }

  async checkImportAssertion(target, spec, codeFiles = []) {
    const files = this.legacyFiles(codeFiles, target, spec);
    const found = files.every((file) => !file.content || collectImports(file.content).length > 0);
    return {
      rule: 'Required imports must be present',
      status: found ? 'pass' : 'fail',
      passed: found,
      assertion: { rule: 'Required imports must be present', target },
    };
  }

  async runTestAssertion(target, spec, codeFiles = []) {
    if (target && !/^[A-Za-z0-9_./-]+$/.test(target)) {
      return {
        rule: 'Test suite binding',
        status: 'fail',
        passed: false,
        assertion: { rule: 'Test suite binding', target },
        error: 'Test selector contains unsupported characters',
      };
    }
    const command = `npm run test:spec${target ? ` -- ${target}` : ''}`;
    const result = await verificationRunner.runVerificationCommand({ command, files: codeFiles });
    const status = normalizeCheckStatus(result.status);
    return {
      rule: 'Test suite binding',
      status,
      passed: status === 'pass' ? true : status === 'fail' ? false : null,
      assertion: { rule: 'Test suite binding', target },
      output: result.output,
      error: result.status === 'not_evaluated' ? result.reason : undefined,
    };
  }

  async runGenericAssertion(rule, target, spec, taskId) {
    const specContent = spec.content || '';
    const assertionRegex = new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const passed = assertionRegex.test(specContent) || (target && assertionRegex.test(target));
    return { rule, status: passed ? 'pass' : 'fail', passed, assertion: { rule, target } };
  }

  async parseAST(codeContent, language = 'javascript') {
    const langKey = language.toLowerCase();
    const astLang = AST_LANGUAGES[langKey] || 'javascript';

    try {
      const cacheKey = `${astLang}:${codeContent.substring(0, 100)}`;
      if (this.astCache.has(cacheKey)) {
        return this.astCache.get(cacheKey);
      }

      let ast;
      if (astLang === 'javascript' || astLang === 'typescript') {
        ast = acorn.parse(codeContent, {
          ecmaVersion: 2022,
          sourceType: 'module',
          locations: true,
        });
      } else {
        const stripped = codeContent.replace(/#.*\n/g, '').replace(/import\s+\S+\s+from\s+['"]\S+['"];/g, '');
        try {
          ast = acorn.parse(stripped, { ecmaVersion: 2022, sourceType: 'module', locations: true });
        } catch {
          const stripped2 = codeContent.replace(/#.*\n/g, '');
          ast = acorn.parse(stripped2, { ecmaVersion: 2020, sourceType: 'script', locations: true });
        }
      }

      const analysis = this.analyzeAST(ast, astLang, codeContent);
      this.astCache.set(cacheKey, analysis);
      return analysis;
    } catch (error) {
      return { error: error.message, nodes: 0, imports: [], functions: [], classes: [], hasDrift: false };
    }
  }

  analyzeAST(ast, language, codeContent) {
    const analysis = {
      nodes: 0,
      imports: [],
      functions: [],
      classes: [],
      hasDrift: false,
      warnings: [],
    };

    const traverse = (node, depth = 0) => {
      if (!node || typeof node !== 'object') return;
      analysis.nodes++;

      if (node.type === 'ImportDeclaration') {
        analysis.imports.push({
          source: node.source.value,
          specifiers: node.specifiers.map(s => s.local.name),
          line: node.loc?.start?.line,
        });
      }

      if (node.type === 'FunctionDeclaration') {
        analysis.functions.push({
          name: node.id?.name,
          line: node.loc?.start?.line,
        });
      }

      if (node.type === 'ClassDeclaration') {
        analysis.classes.push({
          name: node.id?.name,
          line: node.loc?.start?.line,
        });
      }

      if (node.type === 'ExportNamedDeclaration') {
        analysis.exports = analysis.exports || [];
        analysis.exports.push(node.declaration?.id?.name || 'anonymous');
      }

      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'range') continue;
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(c => traverse(c, depth + 1));
        } else if (child && typeof child === 'object' && child.type) {
          traverse(child, depth + 1);
        }
      }
    };

    try {
      traverse(ast);
    } catch {}

    return analysis;
  }

  async checkASTDrift(codeContent, spec, targetFile, language = 'javascript') {
    const driftWarnings = [];
    const assertions = Array.isArray(spec?.assertions) ? spec.assertions : [];
    const astAnalysis = await this.parseAST(codeContent, language);

    for (const assertion of assertions) {
      const rule = assertion.rule || '';
      const target = assertion.target || '';

      if (target && targetFile && targetFile.includes(target)) {
        if (rule.includes('RS256') && !codeContent.includes('RS256')) {
          driftWarnings.push({
            file: targetFile,
            rule,
            message: `Missing RS256 requirement in ${targetFile}`,
            severity: 'warning',
            astNode: null,
          });
        }
        if (rule.includes('middleware') && !codeContent.includes('rateLimiter')) {
          driftWarnings.push({
            file: targetFile,
            rule,
            message: `Missing rateLimiter middleware in ${targetFile}`,
            severity: 'warning',
            astNode: null,
          });
        }
        if (rule.includes('import') && astAnalysis.imports.length > 0) {
          const hasRequiredImport = astAnalysis.imports.some(imp =>
            imp.source.includes('middleware') || imp.source.includes('auth')
          );
          if (!hasRequiredImport) {
            driftWarnings.push({
              file: targetFile,
              rule,
              message: `Missing required import in ${targetFile}`,
              severity: 'warning',
              astNode: null,
            });
          }
        }
      }
    }

    if (astAnalysis.functions.length > 0 && assertions.some(a => a.rule.includes('middleware'))) {
      const hasRateLimiter = codeContent.includes('rateLimiter');
      if (!hasRateLimiter) {
        driftWarnings.push({
          file: targetFile,
          rule: 'Must use rateLimiter middleware',
          message: `AST analysis detected functions in ${targetFile} but missing rateLimiter middleware`,
          severity: 'warning',
          astNode: { type: 'FunctionDeclaration' },
        });
      }
    }

    const hasDrift = driftWarnings.length > 0;
    if (hasDrift) {
      this.driftWarnings.push(...driftWarnings);
    }

    return {
      file: targetFile,
      hasDrift,
      warnings: driftWarnings,
      astAnalysis: {
        nodes: astAnalysis.nodes,
        imports: astAnalysis.imports.length,
        functions: astAnalysis.functions.length,
        classes: astAnalysis.classes.length,
      },
      timestamp: new Date(),
    };
  }

  async runSDDVerification(scopeId, specId = null) {
    // Verification is project-scoped. `scopeId` is a project id; a workspace is
    // collaboration context and must never widen the contract to other projects.
    const query = specId ? { _id: specId } : { projectId: scopeId };
    const specs = await SpecModel.find(query);
    const results = [];

    for (const spec of specs) {
      const verification = await this.verifySpec(spec._id);
      results.push({
        specId: spec._id,
        title: spec.title,
        ...verification,
      });
    }

    return {
      success: true,
      totalSpecs: results.length,
      allPassed: results.every(r => r.verdict === 'pass'),
      results,
      timestamp: new Date(),
    };
  }

  /**
   * The code a spec validates against.
   *
   * Specs are project-scoped: one project, one contract. The workspace is
   * collaboration context and is deliberately not part of this query, so two
   * projects sharing a workspace can never verify against each other's files.
   */
  async resolveSpecCodeScope(spec) {
    if (!spec?.projectId) return null;
    return { project: String(spec.projectId) };
  }

  async getSpecCodeFiles(spec) {
    const scope = await this.resolveSpecCodeScope(spec);
    if (!scope) return [];
    return CodeFile.find(scope).select('path name language content encoding contentOmitted').lean();
  }

  /**
   * A single target file, scoped the same way as getSpecCodeFiles so a drift
   * check can never read a file belonging to another project.
   */
  async findSpecCodeFile(spec, filePath) {
    const scope = await this.resolveSpecCodeScope(spec);
    if (!scope) return null;
    const normalized = String(filePath || '').replace(/^\/+/, '');
    const fileName = normalized.split('/').pop();
    const dir = normalized.includes('/') ? `/${normalized.slice(0, normalized.lastIndexOf('/'))}` : '/';
    return CodeFile.findOne({
      ...scope,
      $or: [
        { path: normalized },
        { path: dir, name: fileName },
      ],
    }).select('path name language content encoding contentOmitted');
  }

  /**
   * Workspace backing a spec: its own, else the parent project's.
   */
  async resolveSpecWorkspaceId(spec) {
    if (!spec) return null;
    if (spec.workspaceId) return spec.workspaceId;

    const project = await this.resolveSpecProject(spec);
    return project?.workspaceId || null;
  }

  async resolveSpecProject(spec) {
    if (!spec?.projectId) return null;
    return LocalProject.findById(spec.projectId).select('userId workspaceId').lean();
  }

  async generateDriftReport(scopeId) {
    // A project id scopes to that project; a workspace id expands to all of
    // its projects (and anything still filed directly under the workspace).
    const query = mongoose.Types.ObjectId.isValid(scopeId)
      ? { $or: [{ projectId: scopeId }, { workspaceId: scopeId }] }
      : { workspaceId: scopeId };
    const specs = await SpecModel.find(query);
    const reports = [];

    for (const spec of specs) {
      for (const targetFile of spec.targetModules || spec.targetFiles || []) {
        const codeFile = await this.findSpecCodeFile(spec, targetFile);
        if (!codeFile) continue;

        const language = path.extname(targetFile).replace('.', '') || 'javascript';
        const drift = await this.checkASTDrift(codeFile.content, spec, targetFile, language);
        if (drift.hasDrift) {
          reports.push(drift);
        }
      }
    }

    return {
      scopeId,
      totalWarnings: reports.length,
      reports,
      timestamp: new Date(),
    };
  }

  async runInWorker(specId, taskId, codeContent, language) {
    if (!isMainThread) {
      const result = await this.checkASTDrift(codeContent, null, '', language);
      parentPort.postMessage({ success: true, result });
      return;
    }

    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: { specId, taskId, codeContent, language, isWorker: true },
      });

      worker.on('message', (msg) => {
        resolve(msg.result);
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  }

  async analyzeCodebaseAST(workspaceId) {
    const codeFiles = await CodeFile.find({ company: workspaceId });
    const analyses = [];

    for (const file of codeFiles) {
      const language = path.extname(file.path).replace('.', '') || 'javascript';
      const analysis = await this.parseAST(file.content, language);
      analyses.push({
        file: file.path,
        language,
        ...analysis,
      });
    }

    return analyses;
  }

  getDriftWarnings() {
    return [...this.driftWarnings];
  }

  clearASTCache() {
    this.astCache.clear();
  }
}

if (isMainThread && workerData && workerData.isWorker) {
  const { specId, taskId, codeContent, language } = workerData;
  const service = new SDDVerificationService();
  service.checkASTDrift(codeContent, null, '', language).then(result => {
    parentPort.postMessage({ success: true, result });
  }).catch(err => {
    parentPort.postMessage({ success: false, error: err.message });
  });
}

module.exports = new SDDVerificationService();