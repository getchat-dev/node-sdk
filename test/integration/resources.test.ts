/**
 * The resource pipeline — how a file gets into a message:
 *
 *   1. `resourceUploadUrl` — ask for a `resource_id` and a presigned S3 URL;
 *   2. PUT the bytes to S3 yourself (the file never passes through this SDK);
 *   3. `resourceVerify` — say the upload is done;
 *   4. `resourceShow` — poll until `status: ready`, then send the message with
 *      the `attachment_id` it hands back.
 *
 * The failures worth nailing down: a tenant (or chat) with no S3 set up, an
 * unknown resource, a verify before the upload. Each answer has to reach the
 * caller with its status and message, and a refused POST must not be repeated.
 *
 * These run against the mock server, so they cover what the SDK sends and how it
 * reports an answer, never what the backend really does with a file. That half is
 * in `test/live/voice-messages.test.ts`, which needs a bucket.
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { ZodError } from 'zod';
import type { Emby } from '../../src/index';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number; body?: { status?: boolean; message?: string } };
type JsonBody = Record<string, unknown>;

describe('resource pipeline', () => {
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

    describe('api.resourceUploadUrl()', () => {
        test('POST /resources/upload-url and hands the answer back untouched', async () => {
            const fixture = loadFixture<{ body: Record<string, unknown> }>('resources/upload-url/success');
            server.respondWith(fixture);

            const r = await sdk.api.resourceUploadUrl({
                body: { type: 'voice', mime: 'audio/mpeg', name: 'note.mp3', size: 51_200, chat_id: 'c1' },
            });

            const req = server.lastRequest!;
            assert.equal(req.method, 'POST');
            assert.equal(req.path, '/api/v1/resources/upload-url');
            assert.deepEqual(req.body, {
                type: 'voice',
                mime: 'audio/mpeg',
                name: 'note.mp3',
                size: 51_200,
                chat_id: 'c1',
            });
            assert.deepEqual(r, fixture.body);
            // What the caller actually needs next: an id for verify, plus the URL
            // and the headers to PUT with. The object is private until verified.
            assert.equal(r.resource_id, 'res-abc123');
            assert.equal(r.method, 'PUT');
            assert.deepEqual(r.headers, { 'x-amz-acl': 'private', 'Content-Type': 'audio/mpeg' });
            assert.equal(r.max_duration, 600);
        });

        test('only type + mime are sent when nothing else is given', async () => {
            server.respondWith(loadFixture('resources/upload-url/success'));
            await sdk.api.resourceUploadUrl({ body: { type: 'voice', mime: 'audio/ogg' } });
            assert.deepEqual(server.lastRequest!.body, { type: 'voice', mime: 'audio/ogg' });
        });

        test('per-call request options stay out of the body', async () => {
            server.respondWith(loadFixture('resources/upload-url/success'));
            await sdk.api.resourceUploadUrl({ body: { type: 'voice', mime: 'audio/ogg' }, timeout: 5000 });
            const body = server.lastRequest!.body as JsonBody;
            assert.ok(!('timeout' in body), 'timeout leaked onto the wire');
        });

        test('an empty mime is not refused client-side — the spec has no minimum', async () => {
            // The backend decides (it answers 422 for an unsupported mime). Pinned
            // so that bringing a minLength back is a deliberate change.
            server.respondWith(loadFixture('resources/upload-url/success'));
            await sdk.api.resourceUploadUrl({ body: { type: 'voice', mime: '' } });
            assert.deepEqual(server.lastRequest!.body, { type: 'voice', mime: '' });
        });

        describe('input validation (before anything is sent)', () => {
            const rejects = async (input: Parameters<Emby['api']['resourceUploadUrl']>[0]) => {
                await assert.rejects(sdk.api.resourceUploadUrl(input), (e) => e instanceof ZodError);
                assert.equal(server.requests.length, 0, 'a rejected input still reached the network');
            };

            test('type outside the enum', async () => {
                await rejects({ body: { type: 'photo' as 'voice', mime: 'image/png' } });
            });

            test('mime missing', async () => {
                await rejects({ body: { type: 'voice' } as { type: 'voice'; mime: string } });
            });

            test('size below 1', async () => {
                await rejects({ body: { type: 'voice', mime: 'audio/ogg', size: 0 } });
            });

            test('fractional size', async () => {
                await rejects({ body: { type: 'voice', mime: 'audio/ogg', size: 1.5 } });
            });

            test('name over 255 chars', async () => {
                await rejects({ body: { type: 'voice', mime: 'audio/ogg', name: 'n'.repeat(256) } });
            });

            test('chat_id over 255 chars', async () => {
                await rejects({ body: { type: 'voice', mime: 'audio/ogg', chat_id: 'c'.repeat(256) } });
            });
        });

        describe('S3 is not configured', () => {
            test('422 rejects with the status and the backend message', async () => {
                server.respondWith(loadFixture('resources/upload-url/no-s3'));

                await assert.rejects(
                    sdk.api.resourceUploadUrl({ body: { type: 'voice', mime: 'audio/mpeg' } }),
                    (err: HttpErr) => {
                        assert.equal(err.status, 422);
                        assert.equal(err.body?.status, false);
                        assert.equal(err.body?.message, 'S3 credentials are not configured');
                        // `message` is the stringified body (see requestApi), so the
                        // reason is readable even from a bare `console.error(err)`.
                        assert.match(err.message, /S3 credentials are not configured/);
                        return true;
                    },
                );
            });

            test('the refusal is not retried, even with retries turned on', async () => {
                const retrying = makeSdk(server.baseUrl, { options: { retries: 2, retryDelay: 1 } });
                server.respondWith(loadFixture('resources/upload-url/no-s3'));

                await assert.rejects(
                    retrying.api.resourceUploadUrl({ body: { type: 'voice', mime: 'audio/mpeg' } }),
                    (err: HttpErr) => err.status === 422,
                );
                assert.equal(server.requests.length, 1);
                assert.equal(server.pendingResponses, 0);
            });
        });

        test('404 when chat_id belongs to no chat', async () => {
            server.respondWith(loadFixture('resources/upload-url/unknown-chat'));

            await assert.rejects(
                sdk.api.resourceUploadUrl({ body: { type: 'voice', mime: 'audio/mpeg', chat_id: 'nope' } }),
                (err: HttpErr) => {
                    assert.equal(err.status, 404);
                    assert.equal(err.body?.message, 'Chat not found');
                    return true;
                },
            );
            assert.equal(server.requests.length, 1);
        });
    });

    describe('api.resourceVerify()', () => {
        test('POST /resources/{id}/verify with no payload; a 202 resolves with the status', async () => {
            const fixture = loadFixture<{ body: Record<string, unknown> }>('resources/verify/accepted');
            server.respondWith(fixture);

            const r = await sdk.api.resourceVerify({ path: { resource_id: 'res-abc123' } });

            const req = server.lastRequest!;
            assert.equal(req.method, 'POST');
            assert.equal(req.path, '/api/v1/resources/res-abc123/verify');
            // requestApi writes `{}` for a POST without a body — same as sendTyping.
            assert.equal(req.rawBody, '{}');
            assert.deepEqual(r, fixture.body);
            assert.equal(r.resource?.status, 'verifying');
            assert.equal(r.resource?.attachment_id, null);
        });

        test('a 200 (already processed) resolves the same way — safe to call twice', async () => {
            server.respondWith(loadFixture('resources/verify/already-ready'));
            const r = await sdk.api.resourceVerify({ path: { resource_id: 'res-abc123' } });
            assert.equal(r.resource?.status, 'ready');
            assert.equal(r.resource?.attachment_id, 'att-abc123');
        });

        test('per-call request options stay out of the body', async () => {
            server.respondWith(loadFixture('resources/verify/accepted'));
            await sdk.api.resourceVerify({ path: { resource_id: 'res-abc123' }, timeout: 5000 });
            assert.equal(server.lastRequest!.rawBody, '{}');
        });

        test('422 (not uploaded yet) rejects with the status and the message', async () => {
            server.respondWith(loadFixture('resources/verify/not-uploaded'));
            await assert.rejects(sdk.api.resourceVerify({ path: { resource_id: 'res-abc123' } }), (err: HttpErr) => {
                assert.equal(err.status, 422);
                assert.equal(err.body?.status, false);
                assert.equal(err.body?.message, 'File is not uploaded yet');
                return true;
            });
        });

        test('404 for an unknown resource', async () => {
            server.respondWith(loadFixture('resources/not-found'));
            await assert.rejects(sdk.api.resourceVerify({ path: { resource_id: 'nope' } }), (err: HttpErr) => {
                assert.equal(err.status, 404);
                assert.equal(err.body?.message, 'Resource not found');
                return true;
            });
        });

        test('a 5xx is not retried — it is a POST', async () => {
            const retrying = makeSdk(server.baseUrl, { options: { retries: 2, retryDelay: 1 } });
            server.respondWith({ status: 503, body: { status: false } });
            await assert.rejects(
                retrying.api.resourceVerify({ path: { resource_id: 'res-abc123' } }),
                (err: HttpErr) => err.status === 503,
            );
            assert.equal(server.requests.length, 1);
        });

        test('resource_id is required', async () => {
            await assert.rejects(
                sdk.api.resourceVerify({ path: {} } as Parameters<Emby['api']['resourceVerify']>[0]),
                (e) => e instanceof ZodError,
            );
            assert.equal(server.requests.length, 0);
        });
    });

    describe('api.resourceShow()', () => {
        test('GET /resources/{id} while it is still processing', async () => {
            const fixture = loadFixture<{ body: Record<string, unknown> }>('resources/show/processing');
            server.respondWith(fixture);

            const r = await sdk.api.resourceShow({ path: { resource_id: 'res-abc123' } });

            const req = server.lastRequest!;
            assert.equal(req.method, 'GET');
            assert.equal(req.path, '/api/v1/resources/res-abc123');
            assert.deepEqual(r, fixture.body);
            assert.equal(r.resource?.status, 'processing');
        });

        test('ready carries the attachment_id to send', async () => {
            server.respondWith(loadFixture('resources/show/ready'));
            const r = await sdk.api.resourceShow({ path: { resource_id: 'res-abc123' } });
            assert.equal(r.resource?.status, 'ready');
            assert.equal(r.resource?.attachment_id, 'att-abc123');
        });

        test('failed carries the reason and no attachment', async () => {
            server.respondWith(loadFixture('resources/show/failed'));
            const r = await sdk.api.resourceShow({ path: { resource_id: 'res-abc123' } });
            assert.equal(r.resource?.status, 'failed');
            assert.equal(r.resource?.attachment_id, null);
            assert.equal(r.resource?.error, 'Uploaded file is not a supported audio format');
        });

        test('404 for an unknown resource', async () => {
            server.respondWith(loadFixture('resources/not-found'));
            await assert.rejects(sdk.api.resourceShow({ path: { resource_id: 'nope' } }), (err: HttpErr) => {
                assert.equal(err.status, 404);
                assert.equal(err.body?.message, 'Resource not found');
                return true;
            });
        });

        test('a 5xx is retried — it is a GET', async () => {
            const retrying = makeSdk(server.baseUrl, { options: { retries: 2, retryDelay: 1 } });
            server.respondWith({ status: 503, body: { status: false } });
            server.respondWith(loadFixture('resources/show/ready'));
            const r = await retrying.api.resourceShow({ path: { resource_id: 'res-abc123' } });
            assert.equal(r.resource?.status, 'ready');
            assert.equal(server.requests.length, 2);
        });

        test('per-call request options stay out of the query string', async () => {
            server.respondWith(loadFixture('resources/show/ready'));
            await sdk.api.resourceShow({ path: { resource_id: 'res-abc123' }, timeout: 5000 });
            assert.equal(server.lastRequest!.path, '/api/v1/resources/res-abc123');
        });
    });
});
