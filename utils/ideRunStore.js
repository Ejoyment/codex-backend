/**
 * IDE run state (DES-03).
 *
 * Runs used to live only in a per-process Map, so a status poll or SSE stream
 * that reached another instance returned 404. Records are mirrored to Redis
 * when configured, and live output is relayed over a pub/sub channel so any
 * instance with a subscribed stream sees it. Without Redis this is exactly the
 * previous single-instance store.
 */
const RUN_TTL_MS = 10 * 60 * 1000;
const MAX_RUNS = 200;
const CHANNEL = 'ide:runs';
const KEY_PREFIX = 'ide:run:';

const runs = new Map(); // runId -> run (listeners live only in this process)
let subscriber = null;
let subscribing = null;

function sweepRuns() {
  const now = Date.now();
  for (const [id, run] of runs) {
    if (now - run.createdAt > RUN_TTL_MS) runs.delete(id);
  }
  if (runs.size > MAX_RUNS) {
    const oldest = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < runs.size - MAX_RUNS; i++) runs.delete(oldest[i].id);
  }
}
const sweepTimer = setInterval(sweepRuns, 60 * 1000);
if (sweepTimer.unref) sweepTimer.unref();

function serializable(run) {
  return {
    id: run.id,
    userId: run.userId,
    language: run.language,
    entry: run.entry,
    backend: run.backend,
    status: run.status,
    output: run.output,
    outputChunks: run.outputChunks,
    problems: run.problems,
    result: run.result,
    error: run.error,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
  };
}

function applyToLocal(run, event, data) {
  if (event === 'output' && typeof data?.chunk === 'string') {
    // Chunks published by another instance were not appended locally.
    if (data.origin !== process.pid) {
      run.output += data.chunk;
      run.outputChunks = (run.outputChunks || 0) + 1;
      if (run.output.length > 512 * 1024) run.output = run.output.slice(-256 * 1024);
    }
  }
  for (const listener of [...(run.listeners || [])]) {
    try {
      listener(event, data);
    } catch {
      // A broken stream must not stop delivery to the others.
    }
  }
}

async function ensureSubscriber() {
  if (subscriber) return subscriber;
  if (subscribing) return subscribing;
  subscribing = (async () => {
    const redis = await require('./redis').getRedisClients();
    if (!redis) return null;
    const sub = redis.pub.duplicate();
    sub.on('error', () => {});
    await sub.connect();
    await sub.subscribe(CHANNEL);
    sub.on('message', (channel, message) => {
      if (channel !== CHANNEL) return;
      let payload;
      try { payload = JSON.parse(message); } catch { return; }
      const run = runs.get(payload?.runId);
      if (!run) return;
      // Redis echoes back to the publishing instance; that instance already
      // dispatched the event locally, so ignore the copy.
      if (payload?.data?.origin === process.pid) return;
      applyToLocal(run, payload.event, payload.data);
    });
    subscriber = sub;
    return sub;
  })().catch((error) => {
    console.warn('IDE run event subscriber unavailable:', error.message);
    return null;
  }).finally(() => { subscribing = null; });
  return subscribing;
}

async function persist(run) {
  const redis = await require('./redis').getRedisClients().catch(() => null);
  if (!redis) return false;
  try {
    await redis.pub.set(`${KEY_PREFIX}${run.id}`, JSON.stringify(serializable(run)), 'PX', RUN_TTL_MS);
    return true;
  } catch {
    return false;
  }
}

async function create(run) {
  runs.set(run.id, run);
  sweepRuns();
  await persist(run);
  return run;
}

async function get(runId) {
  const local = runs.get(runId);
  if (local) return local;
  const redis = await require('./redis').getRedisClients().catch(() => null);
  if (!redis) return null;
  try {
    const raw = await redis.pub.get(`${KEY_PREFIX}${runId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const run = { ...parsed, listeners: new Set() };
    runs.set(run.id, run);
    sweepRuns();
    return run;
  } catch {
    return null;
  }
}

async function save(run) {
  await persist(run);
  return run;
}

async function remove(runId) {
  runs.delete(runId);
  const redis = await require('./redis').getRedisClients().catch(() => null);
  if (!redis) return;
  try { await redis.pub.del(`${KEY_PREFIX}${runId}`); } catch { /* best effort */ }
}

/**
 * Deliver an event to streams attached to this instance and relay it to the
 * other instances. Output chunks carry the origin pid so the publishing
 * instance does not append its own chunk twice.
 */
async function publish(run, event, data) {
  applyToLocal(run, event, { ...data, origin: process.pid });
  const redis = await require('./redis').getRedisClients().catch(() => null);
  if (!redis) return;
  try {
    await ensureSubscriber();
    await redis.pub.publish(CHANNEL, JSON.stringify({ runId: run.id, event, data: { ...data, origin: process.pid } }));
  } catch {
    // Single-instance delivery already happened above.
  }
}

async function subscribe(run, listener) {
  if (!run.listeners) run.listeners = new Set();
  run.listeners.add(listener);
  await ensureSubscriber();
  return () => {
    run.listeners?.delete(listener);
  };
}

module.exports = {
  RUN_TTL_MS,
  create,
  get,
  save,
  remove,
  publish,
  subscribe,
  _runs: runs,
};
