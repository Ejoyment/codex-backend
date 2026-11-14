/**
 * A spec validates against the code of its own project — never its workspace.
 *
 * One project, one contract. Two projects sharing a workspace must not see each
 * other's files during verification.
 */

const mockCodeFileFind = jest.fn();
const mockCodeFileFindOne = jest.fn();

jest.mock('../models/LocalProject', () => ({
  findById: jest.fn(() => ({ select: () => ({ lean: jest.fn().mockResolvedValue(null) }) }))
}));

jest.mock('../models/CodeFile', () => ({
  find: jest.fn((...args) => mockCodeFileFind(...args)),
  findOne: jest.fn((...args) => mockCodeFileFindOne(...args))
}));

const sddVerificationService = require('../utils/sddVerificationService');

const WORKSPACE = '507f191e810c19729de860ea';
const PROJECT = '507f1f77bcf86cd799439012';
const OTHER_PROJECT = '507f1f77bcf86cd799439013';

beforeEach(() => {
  jest.clearAllMocks();
  mockCodeFileFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mockCodeFileFindOne.mockReturnValue({ select: () => null });
});

describe('resolveSpecCodeScope', () => {
  test('scopes every spec to its project', async () => {
    await expect(sddVerificationService.resolveSpecCodeScope({ projectId: PROJECT })).resolves.toEqual({ project: PROJECT });
  });

  test('ignores a workspace even when one is stored on the spec', async () => {
    await expect(
      sddVerificationService.resolveSpecCodeScope({ projectId: PROJECT, workspaceId: WORKSPACE })
    ).resolves.toEqual({ project: PROJECT });
  });

  test('a spec with no project resolves to no scope', async () => {
    await expect(sddVerificationService.resolveSpecCodeScope({})).resolves.toBeNull();
    await expect(sddVerificationService.resolveSpecCodeScope(null)).resolves.toBeNull();
  });
});

describe('getSpecCodeFiles', () => {
  test('reads only the files of the spec project', async () => {
    await sddVerificationService.getSpecCodeFiles({ projectId: PROJECT, workspaceId: WORKSPACE });

    expect(mockCodeFileFind).toHaveBeenCalledWith({ project: PROJECT });
  });

  test('queries nothing when there is no project', async () => {
    await expect(sddVerificationService.getSpecCodeFiles({})).resolves.toEqual([]);
    expect(mockCodeFileFind).not.toHaveBeenCalled();
  });
});

describe('findSpecCodeFile', () => {
  test('matches both stored path shapes inside the project', async () => {
    await sddVerificationService.findSpecCodeFile({ projectId: PROJECT }, 'src/auth.js');

    expect(mockCodeFileFindOne).toHaveBeenCalledWith({
      project: PROJECT,
      $or: [
        { path: 'src/auth.js' },
        { path: '/src', name: 'auth.js' },
      ],
    });
  });

  test('never reads a file outside the project scope', async () => {
    await expect(sddVerificationService.findSpecCodeFile({}, 'src/auth.js')).resolves.toBeNull();
    expect(mockCodeFileFindOne).not.toHaveBeenCalled();
  });
});

describe('verifySpecSnapshot trust states', () => {
  const file = (path, content) => ({ path, name: path.split('/').pop(), content });

  test('matches full paths, not just the directory', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      targetModules: ['src/**'],
      requirements: [
        { id: 'R1', text: 'index exists', checkType: 'file_exists', checkConfig: { path: 'src/index.ts' }, severity: 'blocking' },
        { id: 'R2', text: 'has express', checkType: 'code_pattern', checkConfig: { pattern: "from ['\"]express['\"]" }, severity: 'blocking' },
      ],
    }, [file('src/index.ts', "import express from 'express';")]);

    expect(result.requirements.map((item) => item.status)).toEqual(['pass', 'pass']);
    expect(result.verdict).toBe('pass');
  });

  test('an AST import check passes only when the import is real', async () => {
    const pass = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [{ id: 'R1', text: 'import express', checkType: 'ast_import', checkConfig: { module: 'express' }, severity: 'blocking' }],
    }, [file('src/index.ts', "import express from 'express';")]);
    expect(pass.requirements[0].status).toBe('pass');

    const fail = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [{ id: 'R1', text: 'import express', checkType: 'ast_import', checkConfig: { module: 'express' }, severity: 'blocking' }],
    }, [file('src/index.ts', "const express = require('not-express');")]);
    expect(fail.requirements[0].status).toBe('fail');
    expect(fail.verdict).toBe('fail');
  });

  test('an AST import check can forbid a module', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [{ id: 'R1', text: 'no lodash', checkType: 'ast_import', checkConfig: { module: 'lodash', mode: 'forbid' }, severity: 'blocking' }],
    }, [file('src/index.ts', "import map from 'lodash/map';")]);

    expect(result.requirements[0].status).toBe('fail');
  });

  test('a route check finds Express routes', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [{ id: 'R1', text: 'health route', checkType: 'route', checkConfig: { method: 'get', path: '/health' }, severity: 'blocking' }],
    }, [file('src/index.ts', "app.get('/health', (req, res) => res.send('ok'));")]);

    expect(result.requirements[0].status).toBe('pass');
  });

  test('a route check fails when the method does not match', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [{ id: 'R1', text: 'health route', checkType: 'route', checkConfig: { method: 'post', path: '/health' }, severity: 'blocking' }],
    }, [file('src/index.ts', "app.get('/health', (req, res) => res.send('ok'));")]);

    expect(result.requirements[0].status).toBe('fail');
  });

  test('a manual check is not evaluated, never failed', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [{ id: 'R1', text: 'Review design', checkType: 'manual', severity: 'blocking' }],
    }, [file('src/index.js', 'export {};')]);

    expect(result.requirements[0].status).toBe('not_evaluated');
    expect(result.verdict).toBe('not_evaluated');
    expect(result.passed).toBe(false);
  });

  test('a contract test without a runner result is not evaluated', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [{ id: 'R1', text: 'auth contract', checkType: 'contract_test', checkConfig: { command: 'npm test -- auth' }, severity: 'blocking' }],
    }, [file('src/index.js', 'export {};')]);

    expect(result.requirements[0].status).toBe('not_evaluated');
    expect(result.verdict).toBe('not_evaluated');
  });

  test('a contract test uses the isolated command result', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [{ id: 'R1', text: 'auth contract', checkType: 'contract_test', checkConfig: { command: 'npm test -- auth' }, severity: 'blocking' }],
    }, [file('src/index.js', 'export {};')], {
      commandResult: { command: 'npm test -- auth', status: 'fail', exitCode: 1, output: 'auth failed' },
    });

    expect(result.requirements[0].status).toBe('fail');
    expect(result.requirements[0].evidence).toContain('auth failed');
    expect(result.verdict).toBe('fail');
  });

  test('a warning that is not evaluated does not block a pass', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [
        { id: 'R1', text: 'has express', checkType: 'code_pattern', checkConfig: { pattern: 'express' }, severity: 'blocking' },
        { id: 'R2', text: 'human review', checkType: 'manual', severity: 'warning' },
      ],
    }, [file('src/index.js', "const express = require('express');")]);

    expect(result.verdict).toBe('pass');
  });

  test('forbidden imports are blocking failures', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [],
      forbiddenImports: ['jsonwebtoken'],
    }, [file('src/auth.js', "const jwt = require('jsonwebtoken');")]);

    expect(result.forbiddenImports[0].status).toBe('fail');
    expect(result.verdict).toBe('fail');
  });

  test('a configured verification command is reported as not evaluated until it runs', async () => {
    const result = await sddVerificationService.verifySpecSnapshot({
      projectId: PROJECT,
      requirements: [],
      verificationCommand: 'npm test',
    }, []);

    expect(result.verificationCommand).toMatchObject({ command: 'npm test', status: 'not_evaluated' });
  });
});
