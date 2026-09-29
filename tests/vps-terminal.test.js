/**
 * VPS terminal transport (Phase 4 backend) — source-level assertions.
 * No live VPS calls in jest; the transport itself was verified with a
 * separate live E2E (start/push/exec/resize/pull-back/kill).
 */

const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

describe('VPS terminal transport', () => {
  test('vpsShell exposes the node-pty subset terminalService relies on', () => {
    const src = read('utils/vpsShell.js');
    expect(src).toContain('terminalTransportEnabled');
    for (const m of [
      'write(data)', 'resize(cols, rows)', 'kill()', 'onData(cb)',
      'async start()', 'async pushFiles()', 'async pullFiles()',
    ]) {
      expect(src).toContain(m);
    }
    expect(src).toContain('IDE_TERMINAL_TRANSPORT');
    expect(src).toContain('docker exec -it');
    expect(src).toContain('setWindow(rows, cols, 0, 0)');
  });

  test('terminalService selects the VPS transport and round-trips files', () => {
    const src = read('utils/terminalService.js');
    expect(src).toContain("require('./vpsShell')");
    expect(src).toContain('new VpsShell(');
    expect(src).toContain('vps: true');
    expect(src).toContain('await vpsProcess.start()');
    expect(src).toContain('await vpsProcess.pushFiles()');
    // destroy: container → local dir → VFS before teardown
    expect(src).toContain('await terminal.process.pullFiles()');
    expect(src).toContain('syncPtyDirToVfs');
    // watcher is local-transport only
    expect(src).toContain('!this.terminals.get(sessionId)?.vps');
  });

  test('socket contract in server.js is unchanged', () => {
    const src = read('server.js');
    expect(src).toContain('terminalService.createTerminal(');
    expect(src).toContain("socket.emit('terminal:data'");
    expect(src).toContain("socket.emit('terminal:created'");
    expect(src).toContain('terminalService.destroy(');
  });

  test('createTerminal still returns the contract the frontend expects', () => {
    const src = read('utils/terminalService.js');
    expect(src).toMatch(/type: this\.usePty \? 'pty' : 'simulated'/);
    expect(src).toContain('token: sessionToken');
  });
});
