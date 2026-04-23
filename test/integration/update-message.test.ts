import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import type { MessageButton } from '../../src/types';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };
type JsonBody = Record<string, unknown>;

describe('Emby.updateMessage()', () => {
    let server: MockServer;
    let sdk: Emby;

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

    test('success with text → PUT /chats/c1/messages/m1', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        const r = await sdk.updateMessage<{ is_updated: boolean }>('c1', 'm1', { text: 'new text' });

        assert.equal(r.is_updated, true);
        const req = server.lastRequest!;
        const body = req.body as JsonBody;
        const message = body.message as Record<string, unknown>;
        assert.equal(req.method, 'PUT');
        assert.equal(req.path, '/api/v1/chats/c1/messages/m1');
        assert.equal(message.text, 'new text');
        assert.equal(body.update_extra_mode, 'merge');
    });

    test('isDeleted=true sets is_deleted="1" and drops text', async () => {
        server.respondWith(loadFixture('chats/update-message/success-deleted'));

        await sdk.updateMessage('c1', 'm1', { text: 'ignored', isDeleted: true });

        const message = (server.lastRequest!.body as JsonBody).message as Record<string, unknown>;
        assert.equal(message.is_deleted, '1');
        assert.equal(message.text, undefined);
    });

    test('extra object attaches to message, default mode is merge', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        await sdk.updateMessage('c1', 'm1', { text: 'x', extra: { tag: 'pinned' } });

        const body = server.lastRequest!.body as JsonBody;
        const message = body.message as Record<string, unknown>;
        assert.deepEqual(message.extra, { tag: 'pinned' });
        assert.equal(body.update_extra_mode, 'merge');
    });

    test('replaceExtra=true sets update_extra_mode=replace', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        await sdk.updateMessage('c1', 'm1', { text: 'x', extra: { tag: 'pinned' } }, { replaceExtra: true });

        assert.equal((server.lastRequest!.body as JsonBody).update_extra_mode, 'replace');
    });

    test('returnMessage=true sends return_message="1"', async () => {
        server.respondWith(loadFixture('chats/update-message/success-with-return-message'));

        const r = await sdk.updateMessage<{ message: { id: string } }>(
            'c1',
            'm1',
            { text: 'updated' },
            { returnMessage: true },
        );

        assert.equal((server.lastRequest!.body as JsonBody).return_message, '1');
        assert.equal(r.message.id, 'm1');
    });

    test('buttons array propagates into message', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        const buttons: MessageButton[] = [{ label: 'OK', action: 'ok', type: 'local' }];
        await sdk.updateMessage('c1', 'm1', { text: 'x', buttons });

        const message = (server.lastRequest!.body as JsonBody).message as Record<string, unknown>;
        assert.deepEqual(message.buttons, buttons);
    });

    test('empty extra and empty buttons are omitted', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        await sdk.updateMessage('c1', 'm1', { text: 'x', extra: {}, buttons: [] });

        const message = (server.lastRequest!.body as JsonBody).message as Record<string, unknown>;
        assert.equal('extra' in message, false);
        assert.equal('buttons' in message, false);
    });

    test('empty text is omitted (no .text in message body)', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));
        await sdk.updateMessage('c1', 'm1', { text: '', extra: { a: 'b' } });
        const message = (server.lastRequest!.body as JsonBody).message as Record<string, unknown>;
        assert.equal('text' in message, false);
    });

    test('404 not found', async () => {
        server.respondWith(loadFixture('chats/update-message/not-found'));
        await assert.rejects(
            sdk.updateMessage('c1', 'missing', { text: 'x' }),
            (err) => (err as HttpErr).status === 404,
        );
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/update-message/server-error'));
        await assert.rejects(sdk.updateMessage('c1', 'm1', { text: 'x' }), (err) => (err as HttpErr).status === 500);
    });
});
