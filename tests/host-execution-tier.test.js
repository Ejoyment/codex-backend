const fs = require('fs');
const path = require('path');
const permissionMatrix = require('../middleware/permissionMatrix');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

describe('host execution tier policy', () => {
  test('host terminal, host IDE fallback, and host debugger are paid-only', () => {
    const paid = ['pro', 'pro_plus', 'team_standard', 'team_premium', 'enterprise'];
    expect(permissionMatrix.scopes['terminal:host']).toEqual(paid);
    expect(permissionMatrix.scopes['ide:host']).toEqual(paid);
    expect(permissionMatrix.scopes['debug:host']).toEqual(paid);
  });

  test('free terminal and sandboxed IDE access remain available', () => {
    expect(permissionMatrix.scopes['terminal:create']).toContain('developer');
    expect(permissionMatrix.scopes['ide:run']).toContain('developer');
  });

  test('terminal socket passes the paid host decision to the service', () => {
    const source = read('server.js');
    expect(source).toContain("'host',\n                'terminal'");
    expect(source).toContain('allowHostShell: hostPermission.allowed');
    expect(read('utils/terminalService.js')).toContain("options.allowHostShell !== false");
  });

  test('IDE run and debugger launch gate host execution', () => {
    expect(read('routes/ide.js')).toContain("'host', 'ide'");
    expect(read('routes/ide.js')).toContain('allowHost: hostPermission.allowed');
    expect(read('routes/debug.js')).toContain("requirePermission('debug', 'host')");
  });
});
