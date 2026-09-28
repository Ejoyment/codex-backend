/**
 * Editor wiring tests — Run button/SSE client, real terminal socket wiring,
 * permission matrix adjustments, and server mounts (source-level assertions).
 */

const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

describe('Run wiring (Phase 3)', () => {
  const src = () => read('buildrs-frontend/pages/editor.js');

  test('editor calls the run engine and streams SSE', () => {
    expect(src()).toContain("import { startRun, streamRun, runLanguageFor } from '../lib/ideRun'");
    expect(src()).toContain('await startRun(');
    expect(src()).toContain('streamRun(started.runId');
  });

  test('Run button and ⌘R are wired', () => {
    expect(src()).toContain('onClick={handleRun}');
    expect(src()).toContain('Run File (⌘R)');
    expect(src()).toMatch(/k === 'r'/);
    expect(src()).toContain('runRef.current?.()');
  });

  test('run results feed the Problems panel', () => {
    expect(src()).toContain('setRunProblems(monacoRef.current');
    expect(src()).toContain('setExternalProblems(problems)');
  });

  test('ideRun client exists and targets the SSE endpoint', () => {
    const lib = read('buildrs-frontend/lib/ideRun.js');
    expect(lib).toContain('/api/ide/run');
    expect(lib).toContain('text/event-stream');
  });
});

describe('Terminal wiring (Phase 4)', () => {
  const src = () => read('buildrs-frontend/pages/editor.js');

  test('editor connects to the /terminal socket namespace', () => {
    expect(src()).toContain("io(`${SOCKET_URL}/terminal`");
    expect(src()).toContain("socket.emit('terminal:create'");
    expect(src()).toContain("socket.emit('terminal:input'");
    expect(src()).toContain("socket.emit('terminal:resize'");
    expect(src()).toContain("socket.emit('terminal:destroy'");
    expect(src()).toContain("socket.on('terminal:data'");
  });

  test('fake command shell is gone', () => {
    expect(src()).not.toContain('handleTerminalCommand');
    expect(src()).not.toContain('BuildrsHQ Terminal');
  });

  test('terminal chrome reflects the real session state', () => {
    expect(src()).toContain('termInfo');
    expect(src()).toContain('Workspace Shell · PTY');
  });

  test('freebie tier gets one terminal', () => {
    const permissionMatrix = require('../middleware/permissionMatrix');
    expect(permissionMatrix.limits.freebie.maxTerminals).toBe(1);
    expect(permissionMatrix.scopes['terminal:access']).toEqual([
      'freebie', 'starter', 'professional', 'enterprise',
    ]);
    expect(permissionMatrix.scopes['terminal:create']).toEqual([
      'freebie', 'starter', 'professional', 'enterprise',
    ]);
  });

  test('server exposes the /terminal namespace', () => {
    expect(read('server.js')).toContain("io.of('/terminal')");
    expect(read('server.js')).toContain("terminalService.createTerminal");
  });
});

describe('Server mounts', () => {
  const src = () => read('server.js');

  test('/api/ide and /api/sandbox are mounted', () => {
    expect(src()).toContain("app.use('/api/ide', ideRoutes)");
    expect(src()).toContain("app.use('/api/sandbox', sandboxRoutes)");
  });
});

describe('Output polish (Phase 6)', () => {
  const src = () => read('buildrs-frontend/pages/editor.js');

  test('ANSI color codes are parsed and rendered as styled segments', () => {
    expect(src()).toContain('function ansiSegments(text)');
    expect(src()).toContain('function stripAnsi(text)');
    expect(src()).toContain('ansiSegments(l.text)');
  });

  test('Output panel can copy and clear', () => {
    expect(src()).toContain('function copyOutput()');
    expect(src()).toContain('navigator.clipboard');
    expect(src()).toContain('onClick={copyOutput}');
    expect(src()).toContain('onClick={clearOutput}');
  });

  test('lua and groovy are runnable from the editor', () => {
    const run = read('buildrs-frontend/lib/ideRun.js');
    expect(run).toContain("'lua'");
    expect(run).toContain("'groovy'");
    expect(src()).toContain("lua: 'lua'");
    expect(src()).toContain("groovy: 'groovy'");
  });
});
