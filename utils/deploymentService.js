/**
 * Deployment Service
 * Manages Docker containers on the Hetzner VPS via SSH for user deployments.
 *
 * Uses the system `ssh` binary via child_process so OpenSSH Ed25519 / RSA keys
 * in `-----BEGIN OPENSSH PRIVATE KEY-----` format work natively (the `ssh2`
 * npm library cannot parse those keys).
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SSH_HOST = process.env.DEPLOY_SSH_HOST;
const SSH_PORT = parseInt(process.env.DEPLOY_SSH_PORT || '22');
const SSH_USER = process.env.DEPLOY_SSH_USER || 'deployer';
const DOMAIN = process.env.DEPLOY_DOMAIN || 'buildrshq.dev';
// Relative to the SSH user's home directory — always writable.
const DEPLOY_SUBDIR = (process.env.DEPLOY_ROOT || 'deployments').replace(/^\/+/, '').replace(/^~\/?/, '');

function getRawKey() {
  if (process.env.DEPLOY_SSH_KEY) return process.env.DEPLOY_SSH_KEY;
  const keyFilePath = process.env.DEPLOY_SSH_KEY_FILE;
  if (keyFilePath) {
    try { return fs.readFileSync(keyFilePath, 'utf8'); } catch (_) {}
  }
  return null;
}

let keyFile = null;
let homeDirCache = null;

// Resolve the remote user's home directory once.
async function getHomeDir() {
  if (homeDirCache) return homeDirCache;
  try {
    const out = await sshExec('echo $HOME');
    homeDirCache = (out.trim() || '/home/deployer').replace(/\/+$/, '');
  } catch (_) {
    homeDirCache = '/home/deployer';
  }
  return homeDirCache;
}

// Find a writable deployment base by trying multiple locations.
async function findWritableBase() {
  const homeDir = await getHomeDir();
  const candidates = [
    `${homeDir}/deployments`,
    `${homeDir}/${DEPLOY_SUBDIR}`,
    '/var/tmp/deployments',
    '/tmp/deployments',
  ];
  for (const dir of candidates) {
    try {
      await sshExec(`mkdir -p ${dir} && touch ${dir}/.writetest && rm -f ${dir}/.writetest`);
      return dir;
    } catch (_) {
      // try next
    }
  }
  throw new Error(
    'No writable deployment directory found on the VPS. ' +
    `Tried: ${candidates.join(', ')}. ` +
    'Ensure the SSH user can write to its home directory or /var/tmp.'
  );
}

function getKeyFile() {
  if (keyFile) return keyFile;
  const rawKey = getRawKey();
  if (!rawKey) throw new Error('DEPLOY_SSH_KEY env not set');

  let key = rawKey;
  key = key.replace(/\\n/g, '\n');
  if (!key.includes('-----BEGIN')) {
    const b64 = key.replace(/[\r\n\s]+/g, '');
    key = '-----BEGIN OPENSSH PRIVATE KEY-----\n' + b64 + '\n-----END OPENSSH PRIVATE KEY-----\n';
  }
  if (!key.endsWith('\n')) key += '\n';

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-key-'));
  const file = path.join(dir, 'id_key');
  fs.writeFileSync(file, key, { mode: 0o600 });
  keyFile = file;
  return file;
}

function sshExec(command) {
  return new Promise((resolve, reject) => {
    try {
      if (!SSH_HOST) return reject(new Error('DEPLOY_SSH_HOST env not set'));
      const key = getKeyFile();
      const out = execSync(
        `ssh -i "${key}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} ${JSON.stringify(command)}`,
        { timeout: 300000, maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' }
      );
      resolve(out.trim());
    } catch (err) {
      reject(new Error((err.stderr || err.stdout || err.message || '').toString().trim()));
    }
  });
}

async function writeRemoteFile(remotePath, content) {
  const base64 = Buffer.from(content || '').toString('base64');
  // Compute the parent directory client-side to avoid nested shell quotes
  const parentDir = remotePath.includes('/')
    ? remotePath.slice(0, remotePath.lastIndexOf('/'))
    : '.';
  await sshExec(`mkdir -p '${parentDir}'`);
  await sshExec(`echo '${base64}' | base64 -d > '${remotePath}'`);
}

function detectRuntime(files) {
  const names = files.map(f => f.name.toLowerCase());
  const paths = files.map(f => ((f.path || '') + '/' + f.name).toLowerCase());

  if (names.includes('dockerfile')) {
    return { runtime: 'docker', dockerfile: null, exposePort: 80 };
  }

  if (paths.some(p => p.endsWith('package.json'))) {
    const hasBuild = files.some(f =>
      f.name === 'package.json' && f.content && f.content.includes('"build"')
    );
    const entry = ['server.js', 'app.js', 'index.js'].find(e => names.includes(e)) || 'index.js';
    const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production --no-audit --no-fund
COPY . .
EXPOSE 3000
ENV PORT=3000
${hasBuild ? 'RUN npm run build' : ''}
CMD ["node", "${entry}"]
`;
    return { runtime: 'node', dockerfile, exposePort: 3000 };
  }

  if (paths.some(p => p.endsWith('requirements.txt')) || paths.some(p => p.endsWith('pipfile'))) {
    const dockerfile = `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
ENV PORT=8000
CMD ["python", "app.py"]
`;
    return { runtime: 'python', dockerfile, exposePort: 8000 };
  }

  const dockerfile = `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`;
  return { runtime: 'static', dockerfile, exposePort: 80 };
}

async function deployProject(subdomain, files) {
  const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!sanitizedSubdomain || sanitizedSubdomain.length < 2) {
    throw new Error('Subdomain must be at least 2 characters');
  }

  // Always deploy inside a writable directory on the VPS
  const deployBase = await findWritableBase();
  const deploymentDir = `${deployBase}/${sanitizedSubdomain}`;
  const containerName = `deploy-${sanitizedSubdomain}`;

  const { runtime, dockerfile, exposePort } = detectRuntime(files);
  console.log(`[deploy] Runtime: ${runtime}, port: ${exposePort}, dir: ${deploymentDir}`);

  await sshExec(`mkdir -p ${deploymentDir}`);

  for (const file of files) {
    const relPath = file.path
      ? path.join(file.path.replace(/^\//, ''), file.name)
      : file.name;
    await writeRemoteFile(`${deploymentDir}/${relPath}`, file.content || '');
  }

  if (dockerfile) {
    await writeRemoteFile(`${deploymentDir}/Dockerfile`, dockerfile);
  }

  try { await sshExec(`docker rm -f ${containerName} 2>/dev/null || true`); } catch (_) {}

  await sshExec(`docker build -t ${containerName} ${deploymentDir}`).catch(err => {
    throw new Error(`Docker build failed: ${err.message}`);
  });

  // Write the docker run command to a script file (base64 transfer) so the
  // Traefik `Host()` backticks are never interpreted by an intermediate shell.
  const runScript = `#!/bin/bash
docker rm -f ${containerName} 2>/dev/null || true
docker run -d \\
  --name ${containerName} \\
  --restart unless-stopped \\
  --label 'traefik.enable=true' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.rule=Host(\`${sanitizedSubdomain}.${DOMAIN}\`) || Host(\`www.${sanitizedSubdomain}.${DOMAIN}\`)' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.entrypoints=websecure' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.tls.certresolver=letsencrypt' \\
  --label 'traefik.http.services.${sanitizedSubdomain}.loadbalancer.server.port=${exposePort}' \\
  ${containerName}
`;

  await writeRemoteFile(`${deploymentDir}/run.sh`, runScript);
  const containerId = (await sshExec(`bash ${deploymentDir}/run.sh`)).trim();
  console.log(`[deploy] ${containerName} started (${containerId})`);

  try { await sshExec(`docker image prune -f 2>/dev/null || true`); } catch (_) {}

  return { containerId, url: `https://${sanitizedSubdomain}.${DOMAIN}` };
}

async function stopDeployment(subdomain) {
  const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const containerName = `deploy-${sanitized}`;
  try {
    await sshExec(`docker rm -f ${containerName} 2>/dev/null || true`);
    await sshExec(`docker rmi ${containerName} 2>/dev/null || true`);
    const homeDir = await getHomeDir();
    await sshExec(`rm -rf ${homeDir}/${DEPLOY_SUBDIR}/${sanitized} 2>/dev/null || true`);
  } catch (_) {}
}

async function isSubdomainTaken(subdomain) {
  const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  try {
    const out = await sshExec(`docker ps -a --filter "name=deploy-${sanitized}" --format "{{.Names}}"`);
    return out.trim().length > 0;
  } catch (_) { return false; }
}

module.exports = { sshExec, writeRemoteFile, detectRuntime, deployProject, stopDeployment, isSubdomainTaken };