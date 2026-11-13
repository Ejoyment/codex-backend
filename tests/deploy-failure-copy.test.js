const { STAGE_COPY, GENERIC_COPY, publicDeployFailure } = require('../utils/deployFailure');

describe('publicDeployFailure', () => {
    test('never returns provider detail for a platform failure', () => {
        expect(publicDeployFailure({
            fault: 'platform',
            stage: 'build',
            detail: 'ssh: connect to host 10.0.0.4 port 22: Connection refused',
        })).toBe(GENERIC_COPY);
    });

    test('maps user faults to the stage copy', () => {
        expect(publicDeployFailure({ fault: 'user', stage: 'build' })).toBe(STAGE_COPY.build);
        expect(publicDeployFailure({ fault: 'user', stage: 'start' })).toBe(STAGE_COPY.start);
        expect(publicDeployFailure({ fault: 'user', stage: 'validation' })).toBe(STAGE_COPY.validation);
        expect(publicDeployFailure({ fault: 'user', stage: 'prepare' })).toBe(STAGE_COPY.prepare);
    });

    test('keeps the authored timeout message', () => {
        const timeoutMessage = 'Deployment timed out after 20 minutes while "build" was running. Your build or startup exceeded the time limit.';
        expect(publicDeployFailure({
            fault: 'user',
            stage: 'build',
            timedOutMessage: timeoutMessage,
        })).toBe(timeoutMessage);
    });

    test('falls back to generic copy for an unknown stage', () => {
        expect(publicDeployFailure({ fault: 'user', stage: 'mystery' })).toBe(GENERIC_COPY);
        expect(publicDeployFailure()).toBe(GENERIC_COPY);
    });
});
