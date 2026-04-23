const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const querystring = require('node:querystring');
const Emby = require('../../index.js');
const { stubMathRandom } = require('../helpers/seededRandom');

const CONFIG = Object.freeze({
    id: 'test-client-id',
    secret: 'test-client-secret',
    api_token: 'test-api-token',
    base_url: 'https://chat.example',
});

// Deterministic Math.random that yields byte 0 → 'a' (first charset char).
// strRandom(32) with all-zeros produces 32 x 'a'.
const predictableNonce = (char, len = 32) => char.repeat(len);

const expectedHmac = (secret, parts) => crypto.createHmac('sha256', secret).update(parts.join(',')).digest('hex');

const parseQuery = (urlStr) => {
    const q = urlStr.split('?')[1] || '';
    return querystring.parse(q);
};

describe('Emby.url()', () => {
    let sdk;
    let restore;

    beforeEach(() => {
        sdk = new Emby(CONFIG);
    });
    afterEach(() => {
        if (restore) {
            restore();
            restore = null;
        }
    });

    test('throws when clientId missing', () => {
        const s = new Emby({ ...CONFIG, id: undefined });
        assert.throws(() => s.url({ user: { id: 'u1' } }), /client id is required/);
    });

    test('throws when clientSecret missing', () => {
        const s = new Emby({ ...CONFIG, secret: undefined });
        assert.throws(() => s.url({ user: { id: 'u1' } }), /client secret is required/);
    });

    test('throws when user is not a plain object', () => {
        assert.throws(() => sdk.url({ user: 'nope' }), /user parameter have to be a plain object/);
    });

    test('minimal call: user only — signature is HMAC-SHA256(secret, clientId,nonce,u1,User)', () => {
        restore = stubMathRandom([0]); // strRandom produces all 'a'
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({ user: { id: 'u1', name: 'User' } });

        const qs = parseQuery(out);
        assert.equal(qs.nonce, nonce);
        assert.equal(qs['user[id]'], 'u1');
        assert.equal(qs['user[name]'], 'User');

        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1', 'User']);
        assert.equal(qs.signature, expected);
        assert.equal(qs.signature.length, 64); // SHA-256 hex = 64 chars
    });

    test('chat as string is coerced to { id }', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({ chat: 'c-abc', user: { id: 'u1' } });

        const qs = parseQuery(out);
        assert.equal(qs['chat[id]'], 'c-abc');
        // chat.id participates in signature after user
        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1', 'c-abc']);
        assert.equal(qs.signature, expected);
    });

    test('chat as plain object flows through normalizeChat', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({
            chat: { id: 'c1', title: 'Room', bogus: 'ignored' },
            user: { id: 'u1' },
        });

        const qs = parseQuery(out);
        assert.equal(qs['chat[id]'], 'c1');
        assert.equal(qs['chat[title]'], 'Room');
        assert.equal(qs['chat[bogus]'], undefined);

        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1', 'c1', 'Room']);
        assert.equal(qs.signature, expected);
    });

    test('chat = null produces URL without chat fields in signature', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({ chat: null, user: { id: 'u1' } });

        const qs = parseQuery(out);
        assert.equal(qs['chat[id]'], undefined);
        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1']);
        assert.equal(qs.signature, expected);
    });

    test('chat = 123 (non-object, non-string) is treated as null', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({ chat: 123, user: { id: 'u1' } });
        const qs = parseQuery(out);
        assert.equal(qs['chat[id]'], undefined);
        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1']);
        assert.equal(qs.signature, expected);
    });

    test('participants are normalized and ordered after user in the signature', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({
            user: { id: 'u1' },
            participants: [
                { id: 'p1', name: 'Alice' },
                { id: 'p2', name: 'Bob' },
            ],
        });

        const qs = parseQuery(out);
        assert.equal(qs['recipients[0][id]'], 'p1');
        assert.equal(qs['recipients[0][name]'], 'Alice');
        assert.equal(qs['recipients[0][is_bot]'], 'false');
        assert.equal(qs['recipients[1][id]'], 'p2');

        // sig = clientId, nonce, user.id, p1.id, p1.name, p2.id, p2.name
        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1', 'p1', 'Alice', 'p2', 'Bob']);
        assert.equal(qs.signature, expected);
    });

    test('rights are validated and included in signature (sorted within object)', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({
            user: {
                id: 'u1',
                rights: { send_messages: true, edit_messages: 'any', bogus: 'drop' },
            },
        });

        const qs = parseQuery(out);
        assert.equal(qs['user[rights][send_messages]'], '1');
        assert.equal(qs['user[rights][edit_messages]'], 'any');
        assert.equal(qs['user[rights][bogus]'], undefined);

        // rights is an OBJECT — packObjectForSignature emits sorted dot-notation
        const expected = expectedHmac(CONFIG.secret, [
            CONFIG.id,
            nonce,
            'u1',
            'rights.edit_messages=any',
            'rights.send_messages=1',
        ]);
        assert.equal(qs.signature, expected);
    });

    test('invalid rights are stripped (processUserRights returns undefined for unknown-only)', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({
            user: {
                id: 'u1',
                rights: { bogus: 'x', pin_messages: 'invalid-enum' },
            },
        });
        const qs = parseQuery(out);
        assert.equal(qs['user[rights]'], undefined);

        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1']);
        assert.equal(qs.signature, expected);
    });

    test('extra keys are passed through to query but NOT to signature', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({
            user: { id: 'u1' },
            extra: { theme: 'dark', lang: 'ru' },
        });

        const qs = parseQuery(out);
        assert.equal(qs.theme, 'dark');
        assert.equal(qs.lang, 'ru');

        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1']);
        assert.equal(qs.signature, expected);
    });

    test('session auto-generated when user.id is missing', () => {
        restore = stubMathRandom([0]);
        // when user.id absent, session is generated via strRandom(40) → 'a' * 40
        const out = sdk.url({ user: { name: 'Anon' } });
        const qs = parseQuery(out);
        assert.equal(qs['user[session]'], 'a'.repeat(40));
    });

    test('session passed as string is preserved', () => {
        restore = stubMathRandom([0]);
        const out = sdk.url({ user: { name: 'Anon', session: 'fixed-session-abc' } });
        const qs = parseQuery(out);
        assert.equal(qs['user[session]'], 'fixed-session-abc');
    });

    test('baseUrl is the URL prefix', () => {
        restore = stubMathRandom([0]);
        const out = sdk.url({ user: { id: 'u1' } });
        assert.equal(out.startsWith('https://chat.example?'), true);
    });
});

describe('Emby.urlByChatId()', () => {
    let sdk;
    let restore;

    beforeEach(() => {
        sdk = new Emby(CONFIG);
    });
    afterEach(() => {
        if (restore) {
            restore();
            restore = null;
        }
    });

    test('throws when clientId missing', () => {
        const s = new Emby({ ...CONFIG, id: undefined });
        assert.throws(() => s.urlByChatId('c1', { id: 'u1' }), /client id is required/);
    });

    test('throws when clientSecret missing', () => {
        const s = new Emby({ ...CONFIG, secret: undefined });
        assert.throws(() => s.urlByChatId('c1', { id: 'u1' }), /client secret is required/);
    });

    test('throws when chat is neither object nor string', () => {
        assert.throws(() => sdk.urlByChatId(123, { id: 'u1' }), /chat.*object or string/);
    });

    test('throws when chat has no id', () => {
        assert.throws(() => sdk.urlByChatId({ title: 'No ID' }, { id: 'u1' }), /chat id isn't passed/);
    });

    test('throws when user is not a plain object', () => {
        assert.throws(() => sdk.urlByChatId('c1', 'not-object'), /user.*plain object/);
    });

    test('signature is MD5 of [clientSecret, nonce, user fields, chat fields]', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId('c1', { id: 'u1', name: 'User' });

        const qs = parseQuery(out);
        assert.equal(qs.nonce, nonce);
        assert.equal(qs['chat[id]'], 'c1');
        assert.equal(qs['user[id]'], 'u1');

        const expected = crypto
            .createHash('md5')
            .update([CONFIG.secret, nonce, 'u1', 'User', 'c1'].join(','))
            .digest('hex');
        assert.equal(qs.signature, expected);
        assert.equal(qs.signature.length, 32); // MD5 hex = 32 chars
    });

    test('rights are EXCLUDED from signature (unlike url())', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId('c1', {
            id: 'u1',
            rights: { send_messages: true, edit_messages: 'my' },
        });

        const qs = parseQuery(out);
        // rights still pass through in query (they are in user normalization)
        assert.equal(qs['user[rights][send_messages]'], '1');

        // but the signature is the same as without rights
        const expectedWithoutRights = crypto
            .createHash('md5')
            .update([CONFIG.secret, nonce, 'u1', 'c1'].join(','))
            .digest('hex');
        assert.equal(qs.signature, expectedWithoutRights);
    });

    test('chat as plain object propagates title through signature', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId({ id: 'c1', title: 'Room' }, { id: 'u1' });

        const qs = parseQuery(out);
        assert.equal(qs['chat[title]'], 'Room');

        const expected = crypto
            .createHash('md5')
            .update([CONFIG.secret, nonce, 'u1', 'c1', 'Room'].join(','))
            .digest('hex');
        assert.equal(qs.signature, expected);
    });

    test('participants are normalized and appended to signature in order', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId('c1', { id: 'u1' }, [{ id: 'p1', name: 'Alice' }]);

        const qs = parseQuery(out);
        assert.equal(qs['recipients[0][id]'], 'p1');
        assert.equal(qs['recipients[0][name]'], 'Alice');

        const expected = crypto
            .createHash('md5')
            .update([CONFIG.secret, nonce, 'u1', 'p1', 'Alice', 'c1'].join(','))
            .digest('hex');
        assert.equal(qs.signature, expected);
    });

    test('extra keys merged into query but not into signature', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId('c1', { id: 'u1' }, [], { theme: 'dark' });

        const qs = parseQuery(out);
        assert.equal(qs.theme, 'dark');

        const expected = crypto.createHash('md5').update([CONFIG.secret, nonce, 'u1', 'c1'].join(',')).digest('hex');
        assert.equal(qs.signature, expected);
    });

    test('session auto-generated when user.id is missing', () => {
        restore = stubMathRandom([0]);
        const out = sdk.urlByChatId('c1', { name: 'Anon' });
        const qs = parseQuery(out);
        assert.equal(qs['user[session]'], 'a'.repeat(40));
    });

    test('session passed as string is preserved when user.id missing', () => {
        restore = stubMathRandom([0]);
        const out = sdk.urlByChatId('c1', { name: 'Anon', session: 'keep-me' });
        const qs = parseQuery(out);
        assert.equal(qs['user[session]'], 'keep-me');
    });
});
