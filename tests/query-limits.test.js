const { boundedLimit } = require('../utils/queryLimits');

describe('boundedLimit', () => {
    test('uses the default for missing, invalid, or non-positive values', () => {
        expect(boundedLimit(undefined, 25, 100)).toBe(25);
        expect(boundedLimit('nope', 25, 100)).toBe(25);
        expect(boundedLimit('0', 25, 100)).toBe(25);
        expect(boundedLimit('-5', 25, 100)).toBe(25);
        expect(boundedLimit('Infinity', 25, 100)).toBe(25);
    });

    test('clamps finite values to the maximum', () => {
        expect(boundedLimit('10', 25, 100)).toBe(10);
        expect(boundedLimit('1000', 25, 100)).toBe(100);
        expect(boundedLimit(2.9, 25, 100)).toBe(2);
    });
});
