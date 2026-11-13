const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');

// Delegate runs get a hard 30-minute worker timeout (routes/agent-v1.js), and the
// socket path emits progress without a global deadline, so anything shorter would
// reap live executions. Two hours is past every legitimate run and still frees
// concurrency slots the same day.
const DEFAULT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const STALE_SUMMARY = 'Execution stalled and was marked failed by the stale-run reaper.';

function configuredStaleAfterMs() {
    const configured = Number.parseInt(process.env.AGENT_EXECUTION_STALE_MS, 10);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STALE_AFTER_MS;
}

async function reapStaleAgentExecutions(options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const staleAfterMs = Number.isFinite(options.staleAfterMs) && options.staleAfterMs > 0
        ? options.staleAfterMs
        : configuredStaleAfterMs();
    const batchSize = Number.isFinite(options.batchSize) && options.batchSize > 0
        ? Math.floor(options.batchSize)
        : DEFAULT_BATCH_SIZE;
    const cutoff = new Date(now.getTime() - staleAfterMs);

    const stale = await AgentExecution.find({
        status: 'running',
        updatedAt: { $lt: cutoff },
    })
        .select('_id taskId')
        .limit(batchSize)
        .lean();

    let reaped = 0;
    for (const execution of stale) {
        const result = await AgentExecution.updateOne(
            { _id: execution._id, status: 'running', updatedAt: { $lt: cutoff } },
            {
                $set: {
                    status: 'failed',
                    completedAt: now,
                    updatedAt: now,
                    summary: STALE_SUMMARY,
                },
                $push: {
                    logs: { timestamp: now, message: STALE_SUMMARY },
                    terminalLog: { timestamp: now, type: 'error', message: STALE_SUMMARY },
                },
            }
        );
        if (!result?.modifiedCount) continue;

        reaped += 1;
        if (!execution.taskId) continue;

        try {
            await LocalTask.updateOne(
                { _id: execution.taskId, 'agentExecution.status': 'running' },
                {
                    $set: {
                        'agentExecution.status': 'failed',
                        'agentExecution.error': STALE_SUMMARY,
                        updatedAt: now,
                    },
                    $push: {
                        'agentExecution.logs': { timestamp: now, message: STALE_SUMMARY },
                    },
                }
            );
        } catch (error) {
            console.error('[agent-reaper] failed to mirror task state:', error.message);
        }
    }

    return { scanned: stale.length, reaped };
}

module.exports = {
    DEFAULT_STALE_AFTER_MS,
    STALE_SUMMARY,
    configuredStaleAfterMs,
    reapStaleAgentExecutions,
};
