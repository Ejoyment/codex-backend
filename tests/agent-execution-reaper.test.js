jest.mock('../models/AgentExecution', () => ({
    find: jest.fn(),
    updateOne: jest.fn(),
}));

jest.mock('../models/LocalTask', () => ({
    updateOne: jest.fn(),
}));

const AgentExecution = require('../models/AgentExecution');
const LocalTask = require('../models/LocalTask');
const {
    DEFAULT_STALE_AFTER_MS,
    STALE_SUMMARY,
    configuredStaleAfterMs,
    reapStaleAgentExecutions,
} = require('../utils/agentExecutionReaper');

function findQuery(rows) {
    const lean = jest.fn().mockResolvedValue(rows);
    const limit = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ limit });
    return { select, limit, lean };
}

describe('reapStaleAgentExecutions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.AGENT_EXECUTION_STALE_MS;
        AgentExecution.updateOne.mockResolvedValue({ modifiedCount: 1 });
        LocalTask.updateOne.mockResolvedValue({ modifiedCount: 1 });
    });

    test('fails a stale running execution and mirrors the linked task', async () => {
        const now = new Date('2026-11-10T12:00:00.000Z');
        const staleAfterMs = 60 * 60 * 1000;
        const query = findQuery([{ _id: 'exec-1', taskId: 'task-1' }]);
        AgentExecution.find.mockReturnValue(query);

        const result = await reapStaleAgentExecutions({ now, staleAfterMs, batchSize: 25 });

        const cutoff = new Date(now.getTime() - staleAfterMs);
        expect(AgentExecution.find).toHaveBeenCalledWith({
            status: 'running',
            updatedAt: { $lt: cutoff },
        });
        expect(query.limit).toHaveBeenCalledWith(25);

        const [filter, update] = AgentExecution.updateOne.mock.calls[0];
        expect(filter).toEqual({ _id: 'exec-1', status: 'running', updatedAt: { $lt: cutoff } });
        expect(update.$set).toEqual({
            status: 'failed',
            completedAt: now,
            updatedAt: now,
            summary: STALE_SUMMARY,
        });
        expect(update.$push.logs).toEqual({ timestamp: now, message: STALE_SUMMARY });

        expect(LocalTask.updateOne).toHaveBeenCalledWith(
            { _id: 'task-1', 'agentExecution.status': 'running' },
            expect.objectContaining({
                $set: expect.objectContaining({
                    'agentExecution.status': 'failed',
                    'agentExecution.error': STALE_SUMMARY,
                    updatedAt: now,
                }),
            })
        );
        expect(result).toEqual({ scanned: 1, reaped: 1 });
    });

    test('reaps an execution with no linked task without touching tasks', async () => {
        AgentExecution.find.mockReturnValue(findQuery([{ _id: 'exec-2', taskId: null }]));

        const result = await reapStaleAgentExecutions({ now: new Date() });

        expect(result).toEqual({ scanned: 1, reaped: 1 });
        expect(LocalTask.updateOne).not.toHaveBeenCalled();
    });

    test('does not count an execution another writer already changed', async () => {
        AgentExecution.find.mockReturnValue(findQuery([{ _id: 'exec-3', taskId: 'task-3' }]));
        AgentExecution.updateOne.mockResolvedValue({ modifiedCount: 0 });

        const result = await reapStaleAgentExecutions({ now: new Date() });

        expect(result).toEqual({ scanned: 1, reaped: 0 });
        expect(LocalTask.updateOne).not.toHaveBeenCalled();
    });

    test('keeps reaping when the task mirror write fails', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        AgentExecution.find.mockReturnValue(findQuery([{ _id: 'exec-4', taskId: 'task-4' }]));
        LocalTask.updateOne.mockRejectedValue(new Error('mongo unavailable'));

        const result = await reapStaleAgentExecutions({ now: new Date() });

        expect(result).toEqual({ scanned: 1, reaped: 1 });
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    test('default window is longer than the 30-minute delegate timeout', () => {
        expect(DEFAULT_STALE_AFTER_MS).toBeGreaterThan(30 * 60 * 1000);
        expect(configuredStaleAfterMs()).toBe(DEFAULT_STALE_AFTER_MS);

        process.env.AGENT_EXECUTION_STALE_MS = '45000';
        expect(configuredStaleAfterMs()).toBe(45000);
        delete process.env.AGENT_EXECUTION_STALE_MS;
    });
});
