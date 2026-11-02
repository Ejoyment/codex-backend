const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [];
for (const dir of ['styles', 'pages', 'components']) {
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        walk(p);
      } else if (/\.(js|jsx|css)$/.test(entry.name)) {
        if (entry.name === 'design-tokens.css') continue;
        targets.push(p);
      }
    }
  };
  walk(path.join(root, dir));
}

const hexMap = {
  '#08080b': '#0f131c',
  '#0a0b10': '#0a0d15',
  '#0d0d12': '#121821',
  '#0c0c11': '#0d121a',
  '#0e0e14': '#121821',
  '#0c0d12': '#0d121a',
  '#0a0a0f': '#0a0d15',
  '#090a0f': '#0a0d15',
  '#070b10': '#0a0d15',
  '#0b0f17': '#0e141d',
  '#0b1118': '#0e141d',
  '#0b1018': '#0e141d',
  '#0a1017': '#0e141d',
  '#0a1019': '#0e141d',
  '#090d13': '#0c111a',
  '#080d13': '#0c111a',
  '#080d14': '#0a0d15',
  '#080d15': '#0a0d15',
  '#0a111a': '#0a0d15',
  '#0e1118': '#0d121a',
  '#0f1115': '#0f131c',
  '#121219': '#161d29',
  '#14141e': '#161d29',
  '#14151c': '#1a2230',
  '#161b26': '#182130',
  '#171b23': '#1a2230',
  '#1b1b22': '#1d263b',
  '#1e1e2e': '#1d263b',
  '#202632': '#1d263b',
  '#101722': '#101d2c',
  '#101923': '#101d2c',
  '#111622': '#101d2c',
  '#121a27': '#101d2c',
  '#11151c': '#121821',
  '#171b24': '#182130',
  '#141821': '#161d29',
  '#101218': '#121821',
  '#0f1117': '#0f131c',
  '#0e0f15': '#121821',
  '#0d0e14': '#121821',
  '#0b0d13': '#0c111a',
  '#0b0d12': '#0c111a',
  '#0a0e16': '#0a0d15',
  '#0a0e14': '#0a0d15',
  '#090e14': '#0a0d15',
  '#0e151d': '#0e141d',
  '#0c141d': '#0e141d',
  '#0c131e': '#0e141d',
  '#0c131b': '#0e141d',
  '#0b111b': '#0e141d',
  '#0a1118': '#0a0d15',
  '#12161d': '#121821',
  '#12161b': '#121821',
  '#111925': '#101d2c',
  '#111a28': '#101d2c',
  '#10202b': '#101d2c',
  '#101a28': '#101d2c',
  '#101823': '#101d2c',
  '#0f1523': '#101d2c',
  '#0f0f1a': '#121821',
  '#0f0f15': '#121821',
  '#0e1721': '#101d2c',
  '#151d2b': '#1a2230',
  '#172230': '#1a2230',
  '#1b2533': '#1d263b',
  '#1b2a38': '#1d263b',
  '#1a2734': '#1d263b',
  '#14202c': '#101d2c',
  '#252d3a': '#2a3446',
  '#2a2e3a': '#2a3446',
  '#2a2d39': '#2a3446',
  '#2a2d2e': '#2a3446',
  '#22232b': '#1d263b',
  '#23232c': '#1d263b',
  '#24252d': '#1d263b',
  '#222638': '#1d263b',
  '#111118': '#121821',
  '#111219': '#121821',
  '#11121a': '#121821',
  '#171923': '#161d29',
  '#171b20': '#161d29',

  '#eceef1': '#ffffff',
  '#e4e4e4': '#dee2f6',
  '#d4d4d4': '#c7d2dd',
  '#dce1e8': '#dee2f6',
  '#dce6ee': '#dee2f6',
  '#e2e2ea': '#dee2f6',
  '#e5e5e5': '#dee2f6',
  '#e6e8ee': '#dee2f6',
  '#e7e9ee': '#dee2f6',
  '#e9f2f7': '#dee2f6',
  '#e5eaf0': '#dee2f6',
  '#e2e5ec': '#dee2f6',
  '#e2e8ef': '#dee2f6',
  '#e0e4eb': '#c7d2dd',
  '#cdd3dc': '#c7d2dd',
  '#c9d1d9': '#c7d2dd',
  '#c6cad2': '#c7d2dd',
  '#bbbbbb': '#c7d2dd',
  '#b9c7d2': '#c7d2dd',
  '#d1d5db': '#c7d2dd',
  '#a8adba': '#a9b7c4',
  '#9aa1ae': '#9aaeba',
  '#9ba9b8': '#9aaeba',
  '#9aa8b8': '#9aaeba',
  '#9299a7': '#9aaeba',
  '#8c8c8c': '#9aaeba',
  '#8b93a1': '#9aaeba',
  '#8290a0': '#9aaeba',
  '#9ca3af': '#9aaeba',
  '#8190a0': '#748194',
  '#818896': '#748194',
  '#7f8da0': '#748194',
  '#7f8da1': '#748194',
  '#748294': '#748194',
  '#727987': '#748194',
  '#727988': '#748194',
  '#718091': '#748194',
  '#6e7681': '#748194',
  '#6e6e6e': '#748194',
  '#6d7482': '#748194',
  '#686e7c': '#748194',
  '#6b7280': '#748194',
  '#565d6b': '#59687a',
  '#525764': '#59687a',
  '#5b6472': '#59687a',
  '#5a6270': '#59687a',
  '#4b5563': '#59687a',

  '#2fd6e6': '#12dce5',
  '#53dfee': '#68f7ff',
  '#17d1dc': '#12dce5',
  '#1ad5df': '#12dce5',
  '#18d8c0': '#12dce5',
  '#18d1dc': '#12dce5',
  '#16d7c7': '#12dce5',
  '#16d1dc': '#12dce5',
  '#168b99': '#0c969c',
  '#55d9e5': '#12dce5',
  '#6be7f2': '#68f7ff',
  '#34d399': '#03ba03',
  '#5ddeaa': '#03ba03',
  '#7bd197': '#56e5a9',
  '#22c55e': '#03ba03',
  '#a78bfa': '#8a38f5',
  '#c4b5fd': '#c795e8',
  '#8b5cf6': '#8a38f5',
  '#3b82f6': '#12dce5',
  '#60a5fa': '#68f7ff',
  '#2563eb': '#12dce5',
  '#1d4ed8': '#0c969c',
  '#0ea5e9': '#12dce5',
  '#38bdf8': '#68f7ff',
  '#f87171': '#ec1414',
  '#ef4444': '#ec1414',
  '#fca5a5': '#ec8f8f',
  '#f14c4c': '#ec1414',
  '#fbbf24': '#e5b84a',
  '#f59e0b': '#e5b84a',
  '#06141a': '#0a0d15',

  // Editor / terminal chrome previously matched VS Code's grays.
  '#1e1e1e': '#0a0d15',
  '#252526': '#101d2c',
  '#2d2d2d': '#1d263b',
  '#1a1a1a': '#0f131c',
  '#3c3c3c': '#2a3446',
  '#454545': '#2a3446',
  '#232323': '#1d263b',

  // Alpha-adjusted white hairlines.
  '#ffffff12': '#ffffff10',
  '#ffffff14': '#ffffff12',
  '#ffffff0d': '#ffffff0f',
  '#ffffff0a': '#ffffff0d',
  '#ffffff08': '#ffffff0a',
  '#2fd6e680': '#12dce580',
};

const rgbMap = {
  '47,214,230': '18,220,229',
  '52,211,153': '3,186,3',
  '248,113,113': '236,20,20',
  '167,139,250': '138,56,245',
  '154,161,174': '154,174,186',
  '100,129,153': '116,129,148',
  '59,130,246': '18,220,229',
  '139,92,246': '138,56,245',
  '16,185,129': '3,186,3',
  '8,8,11': '15,19,28',
  '13,13,18': '18,24,33',
  '26,31,54': '16,29,44',
};

const hexRe = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const rgbaRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([^)]+?)\s*)?\)/g;
const monoRe = /ui-monospace[^;}]*monospace/g;
const interRe = /'Inter'[^;}]*sans-serif/g;
const groteskRe = /'Space Grotesk', system-ui, sans-serif/g;

const dry = process.argv.includes('--dry');
const report = [];
let total = 0;

for (const file of targets) {
  const before = fs.readFileSync(file, 'utf8');
  let count = 0;
  let out = before.replace(hexRe, (m) => {
    const key = m.toLowerCase();
    const next = hexMap[key];
    if (next && next !== key) {
      count += 1;
      return next;
    }
    return m;
  });

  out = out.replace(rgbaRe, (m, r, g, b, a) => {
    const key = `${r},${g},${b}`;
    if (rgbMap[key]) {
      count += 1;
      const [nr, ng, nb] = rgbMap[key].split(',');
      return `rgba(${nr},${ng},${nb}${a !== undefined ? `,${a}` : ''})`;
    }
    return m;
  });

  out = out.replace(monoRe, () => {
    count += 1;
    return 'var(--figma-font-mono)';
  });
  out = out.replace(interRe, () => {
    count += 1;
    return 'var(--figma-font-sans)';
  });
  out = out.replace(groteskRe, () => {
    count += 1;
    return 'var(--figma-font-sans)';
  });

  if (count > 0) {
    total += count;
    report.push({ file: path.relative(root, file), count });
    if (!dry) fs.writeFileSync(file, out);
  }
}

report.sort((a, b) => b.count - a.count);
console.log(dry ? 'DRY RUN' : 'APPLIED');
console.log(`files=${report.length} replacements=${total}`);
for (const row of report) console.log(`${String(row.count).padStart(5)}  ${row.file}`);
