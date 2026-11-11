/**
 * Deployment updates are pushed over the existing /collab namespace to the
 * user's room (every signed-in socket joins `agent:<userId>`), so the UI no
 * longer waits for a poll to notice a deploy finished or to see build output.
 */
const realtimeBus = require('../utils/realtimeBus');

function fakeIO() {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const of = jest.fn(() => ({ to }));
    return { io: { of }, of, to, emit };
}

describe('emitDeploymentUpdate', () => {
    afterEach(() => realtimeBus.setIO(null));

    test('emits to the owning user room on /collab', () => {
        const { io, of, to, emit } = fakeIO();
        realtimeBus.setIO(io);

        const ok = realtimeBus.emitDeploymentUpdate('user1', {
            deploymentId: 'dep1',
            deployment: { _id: 'dep1', status: 'success', steps: [] },
            buildLogs: 'done',
        });

        expect(ok).toBe(true);
        expect(of).toHaveBeenCalledWith('/collab');
        expect(to).toHaveBeenCalledWith('agent:user1');
        expect(emit).toHaveBeenCalledWith('deployment:update', expect.objectContaining({
            userId: 'user1',
            deploymentId: 'dep1',
            buildLogs: 'done',
            deployment: expect.objectContaining({ status: 'success' }),
            timestamp: expect.any(String),
        }));
    });

    test('streams log chunks without a deployment document', () => {
        const { io, emit } = fakeIO();
        realtimeBus.setIO(io);

        realtimeBus.emitDeploymentUpdate('user1', { deploymentId: 'dep1', logChunk: 'Step 1/4\n' });

        expect(emit).toHaveBeenCalledWith('deployment:update', expect.objectContaining({
            deploymentId: 'dep1',
            logChunk: 'Step 1/4\n',
        }));
    });

    test('is a no-op before sockets exist', () => {
        realtimeBus.setIO(null);
        expect(realtimeBus.emitDeploymentUpdate('user1', { deploymentId: 'dep1' })).toBe(false);
    });

    test('requires a user id', () => {
        const { io, emit } = fakeIO();
        realtimeBus.setIO(io);
        expect(realtimeBus.emitDeploymentUpdate(null, { deploymentId: 'dep1' })).toBe(false);
        expect(emit).not.toHaveBeenCalled();
    });
});
