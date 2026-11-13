const STAGE_COPY = {
    validation: 'Deployment setup failed. Check your project files and configuration, then try again.',
    prepare: 'Deployment preparation failed. Check the repository connection and try again.',
    build: 'The build failed. Review the build logs for the failing command.',
    start: 'The app failed to start. Review the runtime logs for details.',
    platform: 'Deployment failed due to a platform error. Please retry.',
};

const GENERIC_COPY = STAGE_COPY.platform;

function publicDeployFailure({ fault, stage, timedOutMessage } = {}) {
    if (timedOutMessage) return String(timedOutMessage);
    if (fault === 'platform') return GENERIC_COPY;
    return STAGE_COPY[stage] || GENERIC_COPY;
}

module.exports = {
    STAGE_COPY,
    GENERIC_COPY,
    publicDeployFailure,
};
