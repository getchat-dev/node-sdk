const fs = require('node:fs');
const path = require('node:path');

const FIXTURES_ROOT = path.join(__dirname, '..', 'fixtures');

/**
 * Load a JSON fixture by dotted or slash path.
 *   loadFixture('chats/list/success') → test/fixtures/chats/list/success.json
 *   loadFixture('chats.list.success')  → same
 *
 * Returns an object of the form { status, headers, body }.
 */
function loadFixture(id) {
    const normalized = id.replace(/\./g, '/');
    const file = path.join(FIXTURES_ROOT, `${normalized}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Load a raw (non-JSON) fixture from test/fixtures/raw/. */
function loadRawFixture(id) {
    const file = path.join(FIXTURES_ROOT, 'raw', id);
    return fs.readFileSync(file, 'utf8');
}

module.exports = { loadFixture, loadRawFixture };
