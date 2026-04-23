const Emby = require('../../index.js');

const DEFAULTS = Object.freeze({
    id: 'test-client-id',
    secret: 'test-client-secret',
    api_token: 'test-api-token',
});

/**
 * Build an Emby SDK instance pointed at a mock server.
 * @param {string} baseUrl - ephemeral mock base URL (e.g. from startMockServer)
 * @param {object} [overrides] - partial config overrides (id, secret, api_token, base_url, api_url)
 */
function makeSdk(baseUrl, overrides = {}) {
    return new Emby({
        ...DEFAULTS,
        base_url: baseUrl,
        api_url: baseUrl,
        ...overrides,
    });
}

module.exports = { makeSdk, DEFAULTS };
