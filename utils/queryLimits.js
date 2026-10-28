function boundedLimit(value, defaultValue, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
    return Math.min(parsed, max);
}

module.exports = { boundedLimit };
