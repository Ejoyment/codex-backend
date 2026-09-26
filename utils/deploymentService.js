const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');

const SSH_HOST = process.env.DEPLOY_SSH_HOST;
const SSH_PORT = parseInt(process.env.DEPLOY_SSH_PORT || '22');
const SSH_USER = process.env.DEPLOY_SSH_USER || 'deployer';
const DOMAIN = process.env.DEPLOY_DOMAIN || 'buildrshq.dev';
const DEPLOY_SUBDIR = (process.env.DEPLOY_ROOT || 'deployments').replace(/^\/+/, '').replace(/^~\/?/, '');
const DEPLOY_TIMEOUT_MS = parseInt(process.env.DEPLOY_TIMEOUT_MS) || 180000;

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
    } catch (_) {}
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

function sshExec(command, input = null) {
  return new Promise((resolve, reject) => {
    try {
      if (!SSH_HOST) return reject(new Error('DEPLOY_SSH_HOST env not set'));
      const key = getKeyFile();
      const sshCmd = `ssh -i "${key}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} ${JSON.stringify(command)}`;
      const opts = { timeout: DEPLOY_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' };
      if (input) opts.input = input;
      const proc = exec(sshCmd, opts);

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d; });
      proc.stderr.on('data', d => { stderr += d; });

      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(stderr || `Process exited with code ${code}`));
        resolve(stdout.trim());
      });
      proc.on('error', err => {
        if (err.killed) return reject(new Error('SSH command killed: timeout exceeded'));
        reject(new Error((err.stderr || err.stdout || err.message || '').toString().trim()));
      });
    } catch (err) {
      reject(new Error(err.message || 'SSH command failed'));
    }
  });
}


function detectRuntime(files) {
  const names = files.map(f => f.name.toLowerCase());
  const paths = files.map(f => ((f.path || '') + '/' + f.name).toLowerCase());
  const content = files.map(f => (f.content || '').toLowerCase());

  if (names.includes('dockerfile') || files.some(f => f.name.toLowerCase() === 'dockerfile')) {
    const userDockerfile = files.find(f => f.name.toLowerCase() === 'dockerfile');
    return { runtime: 'docker', dockerfile: userDockerfile?.content || null, exposePort: 80 };
  }

  if (paths.some(p => p.endsWith('package.json'))) {
    const hasBuild = files.some(f =>
      f.name === 'package.json' && f.content && f.content.includes('"build"')
    );
    const entry = ['server.js', 'app.js', 'index.js', 'main.js'].find(e => names.includes(e)) || 'index.js';
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

  if (paths.some(p => p.endsWith('go.mod')) || paths.some(p => p.endsWith('.go'))) {
    const dockerfile = `FROM golang:1.21-alpine
WORKDIR /app
COPY go.mod ./
COPY . .
RUN go build -o main .
EXPOSE 8080
CMD ["./main"]
`;
    return { runtime: 'go', dockerfile, exposePort: 8080 };
  }

  if (paths.some(p => p.endsWith('Gemfile'))) {
    const dockerfile = `FROM ruby:3.2-alpine
WORKDIR /app
COPY Gemfile* ./
RUN bundle install
COPY . .
EXPOSE 3000
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
`;
    return { runtime: 'ruby', dockerfile, exposePort: 3000 };
  }

  const hasHtml = names.some(n => n.endsWith('.html'));
  const hasPhp = names.some(n => n.endsWith('.php'));
  const hasNginxConfig = names.some(n => n === 'nginx.conf' || n === 'nginx.conf');

  if (hasNginxConfig) {
    const nginxConf = files.find(f => f.name === 'nginx.conf');
    const dockerfile = `FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY . /usr/share/nginx/html
EXPOSE 80
`;
    return { runtime: 'static', dockerfile, exposePort: 80 };
  }

  if (hasPhp) {
    const dockerfile = `FROM php:8.2-apache
COPY . /var/www/html
EXPOSE 80
`;
    return { runtime: 'php', dockerfile, exposePort: 80 };
  }

  const dockerfile = `FROM nginx:alpine
COPY . /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html index.htm; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
`;
  return { runtime: 'static', dockerfile, exposePort: 80 };
}

function createTarballSync(files) {
  const tarPath = path.join(os.tmpdir(), `deploy-${Date.now()}.tar.gz`);
  const tmpDir = path.join(os.tmpdir(), `deploy-src-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const file of files) {
    const relPath = file.path.replace(/^\//, '');
    assertSafeRelPath(relPath);
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content || '');
  }
  try {
    execSync(`tar -czf '${tarPath}' -C '${tmpDir}' .`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('Failed to create tarball');
  }
  return tarPath;
}

async function deployProject(subdomain, files) {
  const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!sanitizedSubdomain || sanitizedSubdomain.length < 2) {
    throw new Error('Subdomain must be at least 2 characters');
  }

  const deployBase = await findWritableBase();
  const deploymentDir = `${deployBase}/${sanitizedSubdomain}`;
  const containerName = `deploy-${sanitizedSubdomain}`;
  const nextContainerName = `${containerName}-next-${Date.now()}`;
  const imageTag = `${containerName}:${Date.now()}`;

  const { runtime, dockerfile, exposePort } = detectRuntime(files);
  console.log(`[deploy] Runtime: ${runtime}, port: ${exposePort}, dir: ${deploymentDir}`);

  await sshExec(`mkdir -p ${deploymentDir}`);


  if (dockerfile) {
    await writeRemoteFile(`${deploymentDir}/Dockerfile`, dockerfile);
    await writeRemoteFile(`${deploymentDir}/.dockerignore`, 'node_modules\nnpm-debug.log\n.git\n.env\n.env.*\n__pycache__\n*.pyc\n*.pyo\n*.log\ncoverage\n.nyc_output\ndist\nbuild\n.venv\nvenv\n');
  }

  const fileEntries = files.map(f => ({
    name: f.name,
    path: f.path ? path.join(f.path.replace(/^\//, ''), f.name) : f.name,
    content: typeof f.content === 'string' ? f.content : (f.content || '')
  }));
  // Validate before tarball + fallback: blocks local tmpDir escape,
  // Tar Slip on the VPS, and remote-path breakout.
  for (const file of fileEntries) {
    assertSafeRelPath(file.path);
  }

  try {
    const tarPath = createTarballSync(fileEntries);
    const tarB64 = Buffer.from(fs.readFileSync(tarPath)).toString('base64');
    await writeRemoteFile(`${deploymentDir}/deploy.tar.gz`, tarB64, true);
    await sshExec(`cd '${deploymentDir}' && tar -xzf deploy.tar.gz && rm deploy.tar.gz`);
    fs.unlinkSync(tarPath);
    const fileCount = await sshExec(`find ${deploymentDir} -type f | wc -l`).catch(() => '0');
    const fileList = await sshExec(`ls ${deploymentDir}`).catch(() => '');
    console.log(`[deploy] ${fileCount.trim()} files in ${deploymentDir}: ${fileList}`);
  } catch (tarErr) {
    console.error(`[deploy] Tarball failed: ${tarErr.message}`);
    for (const file of fileEntries) {
      const relPath = file.path.replace(/^\//, '');
      await writeRemoteFile(`${deploymentDir}/${relPath}`, file.content || '');
    }
  }

  await sshExec(`docker build --force-rm --no-cache -t ${imageTag} '${deploymentDir}'`).catch(err => {
    const logs = sshExec(`docker logs ${nextContainerName} 2>&1 || true`).catch(() => '');
    throw new Error(`Docker build failed: ${err.message}`);
  });

  const existingContainer = (await sshExec(`docker ps -q --filter "name=${containerName}" 2>/dev/null || true`).catch(() => '')).trim();

  const runScript = `#!/bin/bash
docker rm -f ${nextContainerName} 2>/dev/null || true
docker run -d \\
  --name ${nextContainerName} \\
  --restart unless-stopped \\
  --cap-drop ALL \\
  --security-opt no-new-privileges \\
  --memory 512m \\
  --cpus 1 \\
  --pids-limit 100 \\
  --label 'traefik.enable=true' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.rule=Host(\`${sanitizedSubdomain}.${DOMAIN}\`) || Host(\`www.${sanitizedSubdomain}.${DOMAIN}\`)' \\
  --label 'traefik.http.routers.${sanitizedSubdomain}.entrypoints=web' \\
  --label 'traefik.http.services.${sanitizedSubdomain}.loadbalancer.server.port=${exposePort}' \\
  ${imageTag}
`;

  await writeRemoteFile(`${deploymentDir}/run.sh`, runScript);
  const nextContainerId = (await sshExec(`bash ${deploymentDir}/run.sh`)).trim();

  if (existingContainer) {
    await sshExec(`docker rm -f ${containerName} 2>/dev/null || true`);
  }

  await sshExec(`docker rename ${nextContainerName} ${containerName}`).catch(async (renameErr) => {
    console.warn('[deploy] rename to active container failed, leaving standby container:', renameErr.message);
    await sshExec(`docker rm -f ${nextContainerName} 2>/dev/null || true`);
    throw renameErr;
  });

  console.log(`[deploy] ${containerName} started (${nextContainerId}) using blue-green swap`);

  try { await sshExec(`docker image prune -f 2>/dev/null || true`); } catch (_) {}

  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const health = await sshExec(`docker inspect --format='{{.State.Running}}' ${containerName} 2>/dev/null || echo 'false'`);
    if (health !== 'true') {
      throw new Error('Container is not running after deployment');
    }
    console.log(`[deploy] ${containerName} health check passed`);
  } catch (healthErr) {
    console.warn('[deploy] Health check issue:', healthErr.message);
  }

  return { containerId: nextContainerId, url: `https://${sanitizedSubdomain}.${DOMAIN}` };
}

async function writeRemoteFile(remotePath, content, isBase64 = false) {
  if (remotePath.includes('..') || remotePath.includes("'") || remotePath.includes('\n')) throw new Error('Invalid remote path');
  const encoded = isBase64 ? content : Buffer.from(content || '').toString('base64');
  const parentDir = remotePath.includes('/')
    ? remotePath.slice(0, remotePath.lastIndexOf('/'))
    : '.';
  await sshExec(`mkdir -p '${parentDir}'`);
  await sshExec(`cat | base64 -d > '${remotePath}'`, encoded);
}

// Shared validation: every file path segment must be a plain filename.
// Protects local tmpDir writes, tarball entries (Tar Slip on the VPS),
// and the per-file fallback loop.
function assertSafeRelPath(relPath) {
  for (const segment of String(relPath).split('/')) {
    if (segment === '..' || !/^[a-zA-Z0-9._-]+$/.test(segment)) throw new Error('Invalid file path');
  }
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

module.exports = { sshExec, writeRemoteFile, detectRuntime, deployProject, stopDeployment, isSubdomainTaken, createTarballSync };
