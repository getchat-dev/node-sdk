import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as querystring from 'node:querystring';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { Emby } from '../../src/index';
import { stubMathRandom } from '../helpers/seededRandom';

const CONFIG = Object.freeze({
    id: 'test-client-id',
    secret: 'test-client-secret',
    api_token: 'test-api-token',
    base_url: 'https://chat.example',
});

const predictableNonce = (char: string, len = 32): string => char.repeat(len);

const expectedHmac = (secret: string, parts: Array<string | number>): string =>
    crypto.createHmac('sha256', secret).update(parts.join(',')).digest('hex');

const parseQuery = (urlStr: string): querystring.ParsedUrlQuery => {
    const q = urlStr.split('?')[1] || '';
    return querystring.parse(q);
};

describe('Emby.url()', () => {
    let sdk: Emby;
    let restore: (() => void) | null = null;

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
        assert.throws(
            () => sdk.url({ user: 'nope' as unknown as { id: string } }),
            /user parameter have to be a plain object/,
        );
    });

    test('minimal call: user only — signature is HMAC-SHA256(secret, clientId,nonce,u1,User)', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({ user: { id: 'u1', name: 'User' } });

        const qs = parseQuery(out);
        assert.equal(qs.nonce, nonce);
        assert.equal(qs['user[id]'], 'u1');
        assert.equal(qs['user[name]'], 'User');

        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1', 'User']);
        assert.equal(qs.signature, expected);
        assert.equal((qs.signature as string).length, 64);
    });

    test('chat as string is coerced to { id }', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({ chat: 'c-abc', user: { id: 'u1' } });

        const qs = parseQuery(out);
        assert.equal(qs['chat[id]'], 'c-abc');
        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1', 'c-abc']);
        assert.equal(qs.signature, expected);
    });

    test('chat as plain object flows through normalizeChat', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({
            chat: { id: 'c1', title: 'Room', bogus: 'ignored' } as unknown as { id: string; title: string },
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

        const out = sdk.url({ chat: 123 as unknown as string, user: { id: 'u1' } });
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
        // is_bot boolean is coerced to 0/1 integer for the wire (Laravel `boolean` rule
        // rejects 'true'/'false' strings produced by querystring.stringify on bool).
        assert.equal(qs['recipients[0][is_bot]'], '0');
        assert.equal(qs['recipients[1][id]'], 'p2');

        const expected = expectedHmac(CONFIG.secret, [CONFIG.id, nonce, 'u1', 'p1', 'Alice', 'p2', 'Bob']);
        assert.equal(qs.signature, expected);
    });

    test('rights are validated and included in signature (sorted within object)', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.url({
            user: {
                id: 'u1',
                rights: { send_messages: true, edit_messages: 'any', bogus: 'drop' } as unknown as Record<
                    string,
                    unknown
                >,
            },
        });

        const qs = parseQuery(out);
        assert.equal(qs['user[rights][send_messages]'], '1');
        assert.equal(qs['user[rights][edit_messages]'], 'any');
        assert.equal(qs['user[rights][bogus]'], undefined);

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
                rights: { bogus: 'x', pin_messages: 'invalid-enum' } as unknown as Record<string, unknown>,
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
    let sdk: Emby;
    let restore: (() => void) | null = null;

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
        assert.throws(() => sdk.urlByChatId(123 as unknown as string, { id: 'u1' }), /chat.*object or string/);
    });

    test('throws when chat has no id', () => {
        assert.throws(() => sdk.urlByChatId({ title: 'No ID' }, { id: 'u1' }), /chat id isn't passed/);
    });

    test('throws when user is not a plain object', () => {
        assert.throws(() => sdk.urlByChatId('c1', 'not-object' as unknown as { id: string }), /user.*plain object/);
    });

    test('chat with create:true — signature follows PHP verifyLegacyMd5 (ksort + pre-coerced int)', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId(
            { id: 'https://markuper.com', create: true },
            { id: '10001', name: 'Howard Lovecraft' },
        );

        const qs = parseQuery(out);
        assert.equal(qs['chat[create]'], '1');
        assert.equal(qs['chat[id]'], 'https://markuper.com');
        assert.equal(qs['user[id]'], '10001');
        assert.equal(qs['user[name]'], 'Howard Lovecraft');

        // Signature input:
        //   user ksort([id, name]) → push '10001', 'Howard Lovecraft'
        //   chat ksort([create, id]) with create=1 (pre-coerced) → push 1, 'https://markuper.com'
        // Join stringifies 1 → "1" (matches PHP which sees raw wire "1" string — backend
        // `$beforeSanitizers['chat.create' => 'boolean']` does NOT run before `authorize()`,
        // confirmed by live backend logs).
        const expected = crypto
            .createHash('md5')
            .update([CONFIG.secret, nonce, '10001', 'Howard Lovecraft', 1, 'https://markuper.com'].join(','))
            .digest('hex');
        assert.equal(qs.signature, expected);
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
        assert.equal((qs.signature as string).length, 32);
    });

    test('rights are EXCLUDED from signature (unlike url())', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId('c1', {
            id: 'u1',
            rights: { send_messages: true, edit_messages: 'my' } as unknown as Record<string, unknown>,
        });

        const qs = parseQuery(out);
        assert.equal(qs['user[rights][send_messages]'], '1');

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

    test('recipient email/picture are signed (ksort order); link is on the wire but NOT signed; is_bot → 0', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId('c1', { id: 'u1' }, [
            { id: 'p1', name: 'Alice', email: 'a@x.com', link: 'https://link', picture: 'https://pic' },
        ]);

        const qs = parseQuery(out);
        // Everything the recipient carries reaches the wire...
        assert.equal(qs['recipients[0][id]'], 'p1');
        assert.equal(qs['recipients[0][name]'], 'Alice');
        assert.equal(qs['recipients[0][email]'], 'a@x.com');
        assert.equal(qs['recipients[0][picture]'], 'https://pic');
        assert.equal(qs['recipients[0][link]'], 'https://link');
        // is_bot defaults to false → coerced to integer 0 for the wire (Laravel `boolean` rule).
        assert.equal(qs['recipients[0][is_bot]'], '0');

        // ...but the signature only includes appendLegacy's recipient whitelist
        // [id,name,email,picture], ksorted alphabetically (email < id < name < picture),
        // so `link` and `is_bot` are excluded from the MD5 input.
        const expected = crypto
            .createHash('md5')
            .update([CONFIG.secret, nonce, 'u1', 'a@x.com', 'p1', 'Alice', 'https://pic', 'c1'].join(','))
            .digest('hex');
        assert.equal(qs.signature, expected);
    });

    test('user.link is excluded from the legacy signature (and stripped from the wire)', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        const out = sdk.urlByChatId('c1', {
            id: 'u1',
            name: 'U',
            email: 'u@x.com',
            picture: 'https://upic',
            link: 'https://ulink',
        });

        const qs = parseQuery(out);
        assert.equal(qs['user[email]'], 'u@x.com');
        assert.equal(qs['user[picture]'], 'https://upic');
        // `link` is not in normalizeData's user whitelist → dropped before it can reach the wire.
        assert.equal(qs['user[link]'], undefined);

        // Signature = user [email,id,name,picture] (ksorted), then chat [id]. No link anywhere.
        const expected = crypto
            .createHash('md5')
            .update([CONFIG.secret, nonce, 'u@x.com', 'u1', 'U', 'https://upic', 'c1'].join(','))
            .digest('hex');
        assert.equal(qs.signature, expected);
    });

    test('chat.list is stripped by normalizeChat (never reaches wire or signature)', () => {
        restore = stubMathRandom([0]);
        const nonce = predictableNonce('a', 32);

        // `list` is in appendLegacy's chat whitelist but NOT in normalizeChat's, so it is
        // dropped before signing — the appendLegacy 'list' entry is currently unreachable
        // via the public API. This test guards normalizeChat against accidentally passing it.
        const out = sdk.urlByChatId({ id: 'c1', title: 'T', list: 'x' } as unknown as { id: string; title: string }, {
            id: 'u1',
        });

        const qs = parseQuery(out);
        assert.equal(qs['chat[id]'], 'c1');
        assert.equal(qs['chat[title]'], 'T');
        assert.equal(qs['chat[list]'], undefined);

        // Signature = user [id], then chat [id,title] ksorted. No `list`.
        const expected = crypto
            .createHash('md5')
            .update([CONFIG.secret, nonce, 'u1', 'c1', 'T'].join(','))
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
