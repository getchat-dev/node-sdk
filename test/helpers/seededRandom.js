const { mock } = require('node:test');

/**
 * Stub Math.random so that subsequent calls return a deterministic sequence.
 * Returns a disposer that restores the original implementation.
 *
 * @param {number[]} [sequence] - sequence of floats in [0,1). Cycles if exhausted.
 */
function stubMathRandom(sequence = [0.1, 0.25, 0.5, 0.75, 0.9]) {
    let i = 0;
    const m = mock.method(Math, 'random', () => {
        const v = sequence[i % sequence.length];
        i += 1;
        return v;
    });
    return () => m.mock.restore();
}

module.exports = { stubMathRandom };
