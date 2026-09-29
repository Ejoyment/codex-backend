const mongoose = require('mongoose');
const SpecModel = require('../models/SpecModel');
const LocalTask = require('../models/LocalTask');
const LocalProject = require('../models/LocalProject');
const CodeFile = require('../models/CodeFile');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

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

      const assertions = Array.isArray(spec.assertions) ? spec.assertions : [];
      const results = [];
      let allPassed = true;

      for (const assertion of assertions) {
        const result = await this.evaluateAssertion(assertion, spec, taskId);
        results.push(result);
        if (!result.passed) {
          allPassed = false;
        }
      }

      const codeFiles = await this.getSpecCodeFiles(spec);
      const structured = await this.verifySpecSnapshot(spec.toObject(), codeFiles);
      const blockingFailed = structured.requirements.some((result) => result.severity === 'blocking' && result.status === 'fail') || structured.forbiddenImports.some((result) => result.status === 'fail');
      const blockingPending = structured.requirements.some((result) => result.severity === 'blocking' && result.status === 'pending');
      allPassed = allPassed && !blockingFailed && !blockingPending;
      const hasWarnings = structured.requirements.some((result) => result.severity === 'warning' && result.status !== 'pass');
      const status = blockingFailed ? 'failing' : (blockingPending || hasWarnings ? 'warning' : 'healthy');
      spec.requirements = (spec.requirements || []).map((requirement) => {
        const result = structured.requirements.find((item) => item.id === requirement.id);
        return result ? { ...requirement.toObject?.() || requirement, status: result.status, evidence: result.evidence } : requirement;
      });
      spec.status = status;
      spec.lastValidatedAt = new Date();
      spec.lastValidationResult = { ...structured, results, passed: allPassed, status };
      await spec.save();

      if (taskId) {
        await LocalTask.findByIdAndUpdate(taskId, {
          $set: {
            'agentExecution.logs': [{
              timestamp: new Date(),
              message: `Spec verification ${allPassed ? 'passed' : 'failed'}: ${assertions.length} assertions checked`
            }]
          }
        });
      }

      return {
        success: true,
        passed: allPassed,
        specId: spec._id,
        checkedAssertions: assertions.length,
        passedAssertions: results.filter(r => r.passed).length,
        failedAssertions: results.filter(r => !r.passed).length,
        results,
        requirements: structured.requirements,
        forbiddenImports: structured.forbiddenImports,
        status,
        checkedAt: spec.lastValidatedAt,
        summary: allPassed ? 'All spec assertions passed' : 'One or more assertions failed',
      };
    } catch (error) {
      console.error('SDD verification error:', error);
      return { success: false, error: error.message };
    }
  }

  async verifySpecSnapshot(spec, codeFiles = []) {
    const inScope = (filePath) => {
      const patterns = [...(spec.targetModules || []), ...(spec.targetFiles || [])];
      if (!patterns.length) return true;
      return patterns.some((pattern) => {
        const escaped = pattern.split('**')
          .map((part) => part.split('*').map((segment) => segment.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
          .join('.*');
        return new RegExp(`^${escaped}$`).test(filePath);
      });
    };
    const files = codeFiles.filter((file) => inScope(file.path || file.name || ''));
    const results = (spec.requirements || []).map((requirement) => {
      const config = requirement.checkConfig || {};
      let status = 'pending';
      let evidence = 'This check requires human or secondary-model review.';
      if (requirement.checkType === 'file_exists') {
        const path = config.path || config.file;
        const passed = files.some((file) => (file.path || file.name) === path);
        status = passed ? 'pass' : 'fail';
        evidence = passed ? `Found ${path}` : `File not found: ${path || '(no path configured)'}`;
      } else if (requirement.checkType === 'code_pattern') {
        try {
          if (!config.pattern) throw new Error('No pattern configured');
          const pattern = new RegExp(config.pattern, config.flags || '');
          const candidates = config.files?.length ? files.filter((file) => config.files.includes(file.path)) : files;
          const match = candidates.find((file) => pattern.test(file.content || ''));
          status = match ? 'pass' : 'fail';
          evidence = match ? `Pattern found in ${match.path}` : 'Pattern not found in the scoped files';
        } catch (error) {
          status = 'fail';
          evidence = `Invalid pattern: ${error.message}`;
        }
      }
      return { id: requirement.id, text: requirement.text, severity: requirement.severity, status, evidence };
    });
    const forbiddenImportResults = (spec.forbiddenImports || []).map((forbidden) => {
      const match = files.find((file) => (file.content || '').includes(forbidden));
      return { forbidden, status: match ? 'fail' : 'pass', evidence: match ? `Found in ${match.path}` : 'Not found in scoped files' };
    });
    const blockingFailures = results.filter((result) => result.severity === 'blocking' && result.status !== 'pass').length + forbiddenImportResults.filter((result) => result.status !== 'pass').length;
    return {
      specId: spec._id,
      title: spec.title,
      passed: blockingFailures === 0,
      requirements: results,
      forbiddenImports: forbiddenImportResults,
      verificationCommand: spec.verificationCommand ? { command: spec.verificationCommand, status: 'pending', reason: 'Requires an isolated workspace runner' } : null,
      checkedAt: new Date(),
    };
  }

  async evaluateAssertion(assertion, spec, taskId) {
    const rule = assertion.rule || '';
    const target = assertion.target || '';

    try {
      if (rule.includes('RS256')) {
        return await this.checkRS256Assertion(target, spec);
      }
      if (rule.includes('Token expiration')) {
        return await this.checkTokenExpirationAssertion(target, spec);
      }
      if (rule.includes('middleware')) {
        return await this.checkMiddlewareAssertion(target, spec);
      }
      if (rule.includes('import')) {
        return await this.checkImportAssertion(target, spec);
      }
      if (rule.includes('test')) {
        return await this.runTestAssertion(target, spec);
      }

      const result = await this.runGenericAssertion(rule, target, spec, taskId);
      return result;
    } catch (error) {
      return { rule, passed: false, error: error.message, assertion };
    }
  }

  async checkRS256Assertion(target, spec) {
    const modules = spec.targetModules || [];
    const files = await CodeFile.find({
      path: { $in: [target, ...modules] }
    });
    let foundRS256 = false;
    for (const file of files) {
      if (file.content && file.content.includes('RS256')) {
        foundRS256 = true;
        break;
      }
    }
    return { rule: 'Must use RS256 algorithm for token signing', passed: foundRS256, assertion: { rule: 'Must use RS256 algorithm for token signing', target } };
  }

  async checkTokenExpirationAssertion(target, spec) {
    const modules = spec.targetModules || [];
    const files = await CodeFile.find({ path: { $in: [target, ...modules] } });
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
    return { rule: 'Token expiration must not exceed 3600 seconds', passed: foundValid, assertion: { rule: 'Token expiration must not exceed 3600 seconds', target } };
  }

  async checkMiddlewareAssertion(target, spec) {
    const modules = spec.targetModules || [];
    const files = await CodeFile.find({ path: { $in: modules } });
    let found = true;
    for (const file of files) {
      if (file.content && !file.content.includes('rateLimiter')) {
        found = false;
        break;
      }
    }
    return { rule: 'Must pass through rateLimiter middleware', passed: found, assertion: { rule: 'Must pass through rateLimiter middleware', target } };
  }

  async checkImportAssertion(target, spec) {
    const modules = spec.targetModules || [];
    const files = await CodeFile.find({ path: { $in: modules } });
    let found = true;
    for (const file of files) {
      if (file.content && !file.content.includes('require')) {
        found = false;
        break;
      }
    }
    return { rule: 'Required imports must be present', passed: found, assertion: { rule: 'Required imports must be present', target } };
  }

  async runTestAssertion(target, spec) {
    try {
      if (target && !/^[A-Za-z0-9_./-]+$/.test(target)) {
        return { rule: 'Test suite binding', passed: false, assertion: { rule: 'Test suite binding', target }, error: 'Test selector contains unsupported characters' };
      }
      const args = ['run', 'test:spec'];
      if (target) args.push('--', target);
      const result = execFileSync('npm', args, {
        cwd: process.cwd(),
        timeout: 30000,
        encoding: 'utf8'
      });
      return { rule: 'Test suite binding', passed: true, assertion: { rule: 'Test suite binding', target }, output: result };
    } catch (error) {
      return { rule: 'Test suite binding', passed: false, assertion: { rule: 'Test suite binding', target }, error: error.message };
    }
  }

  async runGenericAssertion(rule, target, spec, taskId) {
    const specContent = spec.content || '';
    const assertionRegex = new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const passed = assertionRegex.test(specContent) || (target && assertionRegex.test(target));
    return { rule, passed, assertion: { rule, target } };
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
    const assertions = Array.isArray(spec.assertions) ? spec.assertions : [];
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
    // Accepts a project id (primary) or a workspace id (collaboration scope).
    const scopeQuery = mongoose.Types.ObjectId.isValid(scopeId)
      ? { $or: [{ projectId: scopeId }, { workspaceId: scopeId }] }
      : { workspaceId: scopeId };
    const query = specId ? { _id: specId } : scopeQuery;
    const specs = await SpecModel.find(query).populate('workspaceId');
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
      allPassed: results.every(r => r.passed !== false),
      results,
      timestamp: new Date(),
    };
  }

  /**
   * The code a spec validates against.
   *
   * Specs are project-scoped. A project inside a workspace validates against
   * that workspace's VFS (CodeFile.company). A solo project has no workspace,
   * so we fall back to the files the project owner created — otherwise a solo
   * spec would always verify against an empty file set and report everything
   * as "pending".
   */
  async resolveSpecCodeScope(spec) {
    const workspaceId = await this.resolveSpecWorkspaceId(spec);
    if (workspaceId) return { company: workspaceId };

    const project = await this.resolveSpecProject(spec);
    if (project?.userId) return { createdBy: project.userId };

    return null;
  }

  async getSpecCodeFiles(spec) {
    const scope = await this.resolveSpecCodeScope(spec);
    if (!scope) return [];
    return CodeFile.find(scope).select('path name language content').lean();
  }

  /**
   * A single target file, scoped the same way as getSpecCodeFiles so a drift
   * check can never read a file belonging to someone else's workspace.
   */
  async findSpecCodeFile(spec, filePath) {
    const scope = await this.resolveSpecCodeScope(spec);
    if (!scope) return null;
    return CodeFile.findOne({ ...scope, path: filePath }).select('path name language content');
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