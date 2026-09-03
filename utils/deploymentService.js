/**
 * Deployment Service
 * Manages Docker containers on the Hetzner VPS via SSH for user deployments.
 */

const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const SSH_HOST = process.env.DEPLOY_SSH_HOST;
const SSH_PORT = parseInt(process.env.DEPLOY_SSH_PORT || '22');
const SSH_USER = process.env.DEPLOY_SSH_USER || 'deployer';
let SSH_KEY = process.env.DEPLOY_SSH_KEY;
// Support reading key from file path if env var contains a file path
const SSH_KEY_FILE = process.env.DEPLOY_SSH_KEY_FILE;
if (!SSH_KEY && SSH_KEY_FILE) {
    try { SSH_KEY = fs.readFileSync(SSH_KEY_FILE, 'utf8'); } catch (_) {}
}
const DOMAIN = process.env.DEPLOY_DOMAIN || 'buildrshq.dev';
const DEPLOY_ROOT = process.env.DEPLOY_ROOT || '/opt/deployments';

function sshExec(command) {
    return new Promise((resolve, reject) => {
        if (!SSH_KEY) return reject(new Error('DEPLOY_SSH_KEY env not set'));
        if (!SSH_HOST) return reject(new Error('DEPLOY_SSH_HOST env not set'));

        const conn = new Client();
        const output = [];
        let errorOutput = [];

        conn.on('ready', () => {
            conn.exec(command, { pty: false }, (err, stream) => {
                if (err) { conn.end(); return reject(err); }
                stream.on('close', (code) => {
                    conn.end();
                    const stderr = errorOutput.join('').trim();
                    const stdout = output.join('').trim();
                    if (code !== 0 && stderr) return reject(new Error(stderr));
                    resolve(stdout);
                });
                stream.on('data', (data) => output.push(data.toString()));
                stream.stderr.on('data', (data) => errorOutput.push(data.toString()));
            });
        });
        conn.on('error', (err) => reject(new Error('SSH connection failed: ' + err.message)));
        conn.connect({
            host: SSH_HOST, port: SSH_PORT, username: SSH_USER,
            privateKey: SSH_KEY, readyTimeout: 10000,
        });
    });
}

async function writeRemoteFile(remotePath, content) {
    const base64 = Buffer.from(content || '').toString('base64');
    await sshExec(`mkdir -p $(dirname "${remotePath}")`);
    await sshExec(`echo "${base64}" | base64 -d > "${remotePath}"`);
}
function detectRuntime(files) {
    const names = files.map(f => f.name.toLowerCase());
    const paths = files.map(f => ((f.path || '') + '/' + f.name).toLowerCase());

    // Custom Dockerfile
    if (names.includes('dockerfile')) {
        return { runtime: 'docker', dockerfile: null, exposePort: 80 };
    }

    // Node.js
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

    // Python
    if (paths.some(p => p.endsWith('requirements.txt')) || paths.some(p => p.endsWith('pipfile'))) {
        const dockerfile = `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
ENV PORT=8000
CMD ["python", "app.py"]
`;
        return { runtime: 'python', dockerfile, exposePort: 8000 };
    }

    // Static HTML default
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

    const deploymentDir = `${DEPLOY_ROOT}/${sanitizedSubdomain}`;
    const containerName = `deploy-${sanitizedSubdomain}`;

    // 1. Detect runtime
    const { runtime, dockerfile, exposePort } = detectRuntime(files);
    console.log(`[deploy] Runtime: ${runtime}, port: ${exposePort}`);

    // 2. Prepare remote directory
    await sshExec(`mkdir -p ${deploymentDir}`);

    // 3. Write all files to VPS
    for (const file of files) {
        const relPath = file.path
            ? path.join(file.path.replace(/^\//, ''), file.name)
            : file.name;
        await writeRemoteFile(`${deploymentDir}/${relPath}`, file.content || '');
    }

    // 4. Write Dockerfile if auto-generated
    if (dockerfile) {
        await writeRemoteFile(`${deploymentDir}/Dockerfile`, dockerfile);
    }

    // 5. Remove old container if exists
    try { await sshExec(`docker rm -f ${containerName} 2>/dev/null || true`); } catch (_) {}

    // 6. Build image
    await sshExec(`docker build -t ${containerName} ${deploymentDir}`).catch(err => {
        throw new Error(`Docker build failed: ${err.message}`);
    });

    // 7. Run container with Traefik labels
    const runCmd = `docker run -d \
  --name ${containerName} \
  --restart unless-stopped \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.${sanitizedSubdomain}.rule=Host(\`${sanitizedSubdomain}.${DOMAIN}\`)" \
  --label "traefik.http.routers.${sanitizedSubdomain}.entrypoints=websecure" \
  --label "traefik.http.routers.${sanitizedSubdomain}.tls.certresolver=letsencrypt" \
  --label "traefik.http.services.${sanitizedSubdomain}.loadbalancer.server.port=${exposePort}" \
  ${containerName}`;

    const containerId = (await sshExec(runCmd)).trim();
    console.log(`[deploy] ${containerName} started (${containerId})`);

    // 8. Prune old build cache
    try { await sshExec(`docker image prune -f 2>/dev/null || true`); } catch (_) {}

    return { containerId, url: `https://${sanitizedSubdomain}.${DOMAIN}` };
}

async function stopDeployment(subdomain) {
    const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const containerName = `deploy-${sanitized}`;
    try {
        await sshExec(`docker rm -f ${containerName} 2>/dev/null || true`);
        await sshExec(`docker rmi ${containerName} 2>/dev/null || true`);
        await sshExec(`rm -rf ${DEPLOY_ROOT}/${sanitized}`);
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