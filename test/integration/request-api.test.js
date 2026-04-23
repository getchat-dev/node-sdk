const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startMockServer } = require('../helpers/mockServer');
const { makeSdk } = require('../helpers/sdkFactory');
const { loadRawFixture } = require('../helpers/loadFixture');

describe('requestApi (HTTP plumbing)', () => {
    let server;
    let sdk;

    before(async () => {
        server = await startMockServer();
        sdk = makeSdk(server.baseUrl);
    });
    after(async () => {
        await server.close();
    });
    beforeEach(() => {
        server.reset();
    });

    test('GET builds querystring from flatten() and sends no body', async () => {
        server.respondWith({ status: 200, body: { ok: true } });

        await sdk.requestApi('chats', { page: 2, filter: { status: 'open' } }, 'get');

        const req = server.lastRequest;
        assert.equal(req.method, 'GET');
        // flatten converts { filter: { status: 'open' } } → filter[status]=open,
        // then querystring.stringify encodes brackets to %5B/%5D,
        // then encodeURI re-encodes the % → %25 (double-encoded brackets).
        assert.match(req.path, /^\/api\/v1\/chats\?/);
        assert.match(req.path, /page=2/);
        assert.match(req.path, /filter%255Bstatus%255D=open/);
        assert.equal(req.rawBody, '');
    });

    test('POST sends JSON body with Content-Type application/json', async () => {
        server.respondWith({ status: 200, body: { ok: true } });

        await sdk.requestApi('chats/c1/messages', { messages: [{ text: 'hi' }] }, 'post');

        const req = server.lastRequest;
        assert.equal(req.method, 'POST');
        assert.equal(req.path, '/api/v1/chats/c1/messages');
        assert.equal(req.headers['content-type'], 'application/json');
        assert.deepEqual(req.body, { messages: [{ text: 'hi' }] });
    });

    test('PUT sends JSON body', async () => {
        server.respondWith({ status: 200, body: { ok: true } });

        await sdk.requestApi('chats/c1', { title: 'New' }, 'put');

        const req = server.lastRequest;
        assert.equal(req.method, 'PUT');
        assert.deepEqual(req.body, { title: 'New' });
    });

    test('DELETE uses querystring, no body', async () => {
        server.respondWith({ status: 200, body: { ok: true } });

        await sdk.requestApi('chats/c1', { reason: 'abuse' }, 'delete');

        const req = server.lastRequest;
        assert.equal(req.method, 'DELETE');
        assert.match(req.path, /reason=abuse/);
        assert.equal(req.rawBody, '');
    });

    test('always sends Authorization: Bearer $apiToken', async () => {
        server.respondWith({ status: 200, body: {} });

        await sdk.requestApi('chats', {}, 'get');

        assert.equal(server.lastRequest.headers.authorization, 'Bearer test-api-token');
    });

    test('always sends Accept: application/json', async () => {
        server.respondWith({ status: 200, body: {} });

        await sdk.requestApi('chats', {}, 'get');

        assert.equal(server.lastRequest.headers.accept, 'application/json');
    });

    test('custom version segment', async () => {
        server.respondWith({ status: 200, body: {} });

        await sdk.requestApi('chats', {}, 'get', 'v2');

        assert.match(server.lastRequest.path, /^\/api\/v2\/chats/);
    });

    test('default version is v1', async () => {
        server.respondWith({ status: 200, body: {} });

        await sdk.requestApi('chats', {}, 'get');

        assert.match(server.lastRequest.path, /^\/api\/v1\/chats/);
    });

    test('2xx resolves with parsed JSON body', async () => {
        server.respondWith({ status: 201, body: { created: true, id: 'x' } });

        const r = await sdk.requestApi('chats', { title: 'X' }, 'post');

        assert.deepEqual(r, { created: true, id: 'x' });
    });

    test('3xx (302) also resolves (statusCode < 400)', async () => {
        server.respondWith({ status: 302, body: { redirect: '/new' } });

        const r = await sdk.requestApi('chats', {}, 'get');

        assert.deepEqual(r, { redirect: '/new' });
    });

    test('204 No Content resolves with empty string body', async () => {
        server.respondWith({ status: 204, rawBody: '', contentType: 'text/plain' });

        const r = await sdk.requestApi('chats', {}, 'get');

        assert.equal(r, '');
    });

    test('4xx rejects with Error carrying .status', async () => {
        server.respondWith({ status: 404, body: { message: 'not found' } });

        await assert.rejects(
            sdk.requestApi('chats/unknown', {}, 'get'),
            (err) => err instanceof Error && err.status === 404,
        );
    });

    test('401 rejects with .status=401', async () => {
        server.respondWith({ status: 401, body: { message: 'unauthorized' } });

        await assert.rejects(sdk.requestApi('chats', {}, 'get'), (err) => err.status === 401);
    });

    test('500 rejects with .status=500', async () => {
        server.respondWith({ status: 500, body: { message: 'oops' } });

        await assert.rejects(sdk.requestApi('chats', {}, 'get'), (err) => err.status === 500);
    });

    test('application/json with malformed body rejects with SyntaxError', async () => {
        const broken = loadRawFixture('malformed-json.txt');
        server.respondWith({ status: 200, rawBody: broken, contentType: 'application/json' });

        await assert.rejects(sdk.requestApi('chats', {}, 'get'), (err) => err instanceof SyntaxError);
    });

    test('text/plain response body returned as raw string (not parsed)', async () => {
        const plain = loadRawFixture('plain-text.txt');
        server.respondWith({ status: 200, rawBody: plain, contentType: 'text/plain' });

        const r = await sdk.requestApi('chats', {}, 'get');

        assert.equal(typeof r, 'string');
        assert.match(r, /hello/);
    });

    test('closed socket before response rejects with network error', async () => {
        server.respondWith({ closeSocket: true });

        await assert.rejects(sdk.requestApi('chats', {}, 'get'), (err) => err instanceof Error && !err.status);
    });

    test('baseUrl trailing slashes are stripped by constructor', () => {
        const s = makeSdk('http://example.com///');
        assert.equal(s.baseUrl, 'http://example.com');
        // apiUrl is NOT stripped (only baseUrl gets this treatment)
        assert.equal(s.apiUrl, 'http://example.com///');
    });

    test('api_url passed explicitly overrides base_url for apiUrl', () => {
        const Emby = require('../../index.js');
        const s = new Emby({
            id: 'i',
            secret: 's',
            api_token: 't',
            base_url: 'http://base.example/',
            api_url: 'http://api.example',
        });
        assert.equal(s.baseUrl, 'http://base.example');
        assert.equal(s.apiUrl, 'http://api.example');
    });

    test('constructor leaves baseUrl untouched when non-string', () => {
        const Emby = require('../../index.js');
        const s = new Emby({});
        assert.equal(s.baseUrl, undefined);
    });

    test('https protocol selects https.request (error path, no listener)', async () => {
        const s = makeSdk('https://127.0.0.1:1/does-not-exist');
        await assert.rejects(s.requestApi('chats', {}, 'get'), (err) => err instanceof Error);
    });
});
