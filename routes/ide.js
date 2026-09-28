/**
 * IDE Run API Routes
 * Compile/execute user code from the editor's Run button.
 *
 *   GET  /api/ide/languages            supported run languages
 *   POST /api/ide/run                  start a run → { runId }
 *   GET  /api/ide/run/:runId           run status + result (JSON)
 *   GET  /api/ide/run/:runId/stream    SSE: status/output/result events
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const permissionMatrix = require('../middleware/permissionMatrix');
const {
  resolveLanguage,
  listLanguages,
  sanitizeFiles,
  rateGate,
  executeRun,
  generateRunId,
  pickStrategy,
} = require('../utils/ideRunner');

const RUN_TTL_MS = 10 * 60 * 1000; // keep finished runs around for late streams
const MAX_RUNS = 200;
const HEARTBEAT_MS = 15000;

/** runId -> run record */
const runs = new Map();

function sweepRuns() {
  const now = Date.now();
  for (const [id, run] of runs) {
    if (now - run.createdAt > RUN_TTL_MS) runs.delete(id);
  }
  // Hard cap so a burst can't grow memory unbounded.
  if (runs.size > MAX_RUNS) {
    const oldest = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < runs.size - MAX_RUNS; i++) runs.delete(oldest[i].id);
  }
}
const sweepTimer = setInterval(sweepRuns, 60 * 1000);
if (sweepTimer.unref) sweepTimer.unref();

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * @swagger
 * /api/ide/languages:
 *   get:
 *     summary: List languages supported by the Run engine
 *     tags:
 *       - IDE
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Language list
 */
router.get('/languages', authenticateToken, (req, res) => {
  res.json({
    languages: listLanguages(),
    backend: pickStrategy(),
  });
});

/**
 * @swagger
 * /api/ide/run:
 *   post:
 *     summary: Start a code run
 *     tags:
 *       - IDE
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - language
 *               - files
 *             properties:
 *               language:
 *                 type: string
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [path, content]
 *                   properties:
 *                     path:
 *                       type: string
 *                     content:
 *                       type: string
 *               entry:
 *                 type: string
 *               args:
 *                 type: array
 *                 items:
 *                   type: string
 *               stdin:
 *                 type: string
 *               timeoutMs:
 *                 type: integer
 *     responses:
 *       202:
 *         description: Run accepted
 */
router.post(
  '/run',
  authenticateToken,
  permissionMatrix.requirePermission('ide', 'run'),
  async (req, res) => {
    const userId = String(req.userId || req.user?._id || '');

    const def = resolveLanguage(req.body?.language);
    if (!def) {
      return res.status(400).json({ error: `Unsupported language: ${req.body?.language}` });
    }
    const v = sanitizeFiles(req.body?.files);
    if (v.error) {
      return res.status(400).json({ error: v.error });
    }

    const entry = String(req.body?.entry || def.defaultEntry).replace(/^\/+/, '');
    if (!v.files.some((f) => f.path === entry)) {
      return res.status(400).json({ error: `Entry file not found: ${entry}` });
    }

    const gate = rateGate(userId);
    if (!gate.allowed) {
      return res.status(429).json({ error: gate.reason });
    }

    const runId = generateRunId();
    const run = {
      id: runId,
      userId,
      language: def.id,
      entry,
      backend: pickStrategy(),
      status: 'running',
      output: '',
      outputChunks: 0,
      problems: [],
      result: null,
      error: null,
      listeners: new Set(),
      createdAt: Date.now(),
      finishedAt: null,
    };
    runs.set(runId, run);

    // Respond immediately; execution streams over /stream.
    res.status(202).json({
      runId,
      language: def.id,
      entry,
      backend: run.backend,
      status: 'running',
    });

    (async () => {
      try {
        const result = await executeRun({
          language: def.id,
          files: v.files,
          entry,
          args: Array.isArray(req.body.args) ? req.body.args : [],
          stdin: typeof req.body.stdin === 'string' ? req.body.stdin : undefined,
          timeoutMs: req.body.timeoutMs,
          onOutput: (chunk) => {
            run.output += chunk;
            run.outputChunks += 1;
            if (run.output.length > 512 * 1024) {
              run.output = run.output.slice(-256 * 1024);
            }
            for (const res of run.listeners) sseSend(res, 'output', { chunk });
          },
        });
        run.status = result.success ? 'success' : 'failed';
        run.result = {
          success: result.success,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          problems: result.problems,
          language: result.language,
          backend: result.backend,
        };
        run.problems = result.problems;
      } catch (err) {
        run.status = 'error';
        run.error = err.message;
        run.result = { success: false, exitCode: -1, timedOut: false, problems: [], error: err.message };
      } finally {
        gate.release();
        run.finishedAt = Date.now();
        if (run.result && typeof run.result.output === 'string') {
          run.output = run.result.output;
        }
        for (const client of run.listeners) {
          sseSend(client, 'status', { status: run.status });
          sseSend(client, 'result', { ...run.result, error: run.error });
          client.write('event: end\ndata: {}\n\n');
          client.end();
        }
        run.listeners.clear();
      }
    })();
  }
);

function ownsRun(req, run) {
  return run && run.userId === String(req.userId || req.user?._id || '');
}

/**
 * @swagger
 * /api/ide/run/{runId}:
 *   get:
 *     summary: Get run status/result as JSON
 *     tags:
 *       - IDE
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Run state
 */
router.get('/run/:runId', authenticateToken, (req, res) => {
  const run = runs.get(req.params.runId);
  if (!ownsRun(req, run)) return res.status(404).json({ error: 'Run not found' });
  res.json({
    runId: run.id,
    language: run.language,
    entry: run.entry,
    backend: run.backend,
    status: run.status,
    output: run.output,
    problems: run.problems,
    result: run.result,
    error: run.error,
  });
});

/**
 * @swagger
 * /api/ide/run/{runId}/stream:
 *   get:
 *     summary: SSE stream of a run (status, output, result)
 *     tags:
 *       - IDE
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: text/event-stream
 */
router.get('/run/:runId/stream', authenticateToken, (req, res) => {
  const run = runs.get(req.params.runId);
  if (!ownsRun(req, run)) return res.status(404).json({ error: 'Run not found' });

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  // Replay what already happened.
  sseSend(res, 'status', { status: run.status });
  if (run.output) sseSend(res, 'output', { chunk: run.output, replay: true });

  if (run.finishedAt) {
    sseSend(res, 'status', { status: run.status });
    sseSend(res, 'result', { ...(run.result || {}), error: run.error });
    res.write('event: end\ndata: {}\n\n');
    res.end();
    return;
  }

  run.listeners.add(res);
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);
  if (heartbeat.unref) heartbeat.unref();

  req.on('close', () => {
    clearInterval(heartbeat);
    run.listeners.delete(res);
  });
});

module.exports = router;
