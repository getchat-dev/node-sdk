/**
 * Voice messages against the real backend — the half of the flow the mock tests
 * can only describe.
 *
 * With `TEST_S3_*` in `.env` (see `_helpers.ts`) the suite points the tenant at
 * that bucket and then requires the whole resource pipeline to work: ask for an
 * upload URL, put the file in S3, verify it, poll until it is ready, send the
 * `attachment_id`, read the message back. Without those keys it can only check
 * that the backend refuses to hand out a URL, and it says as much.
 *
 * Questions only a live run can answer:
 *
 *   1. Without S3, is the refusal really a 422 `{status: false, message}`, and not
 *      a 200 carrying `status: false`, the way `chatSetWebhook` reports failure?
 *   2. Does verify hold the bytes to the declared format, and refuse a file that
 *      was never uploaded?
 *   3. Does a ready resource really come back as an `ogg/opus` attachment on the
 *      message, and can the same `attachment_id` be sent more than once?
 *   4. Does the backend refuse `voice_url` and `attachment_id` together? The spec
 *      says so in words only, so the SDK lets the pair through and this is where
 *      the rule is checked.
 *
 * See also `s3-credentials.test.ts`, which checks the bucket on its own. Run that
 * first when an upload here is refused, or the backend gets blamed for something
 * the bucket did.
 */

import assert from 'node:assert/strict';
import { after, before, describe, type TestContext, test } from 'node:test';
import * as zlib from 'node:zlib';
import {
    clearTenant,
    configureTenantS3,
    describeError,
    HAS_TEST_S3,
    makeLiveSdk,
    NO_S3_REASON,
    SKIP_REASON,
    TEST_S3,
    testS3Target,
    uid,
} from './_helpers.js';
import { s3Request } from './_s3.js';

type AnyResp = Record<string, unknown>;
type HttpErr = Error & { status?: number; body?: { status?: boolean; message?: string } };

// What a WAV file says it holds inside.
const WAV_PCM = 1;
const WAV_IMA_ADPCM = 0x11;

/**
 * A real, if dull, audio file: 200 ms of silence, 16-bit mono PCM. Written out
 * here instead of being kept as a file next to the tests, because the backend
 * reads the first bytes to see what it got — so this has to be a real WAV, and a
 * WAV header is short enough to build.
 */
function silentWav(ms = 200, formatTag = WAV_PCM): Buffer {
    const rate = 8000;
    const dataSize = Math.round((rate * ms) / 1000) * 2;
    const buf = Buffer.alloc(44 + dataSize); // samples stay zero — silence
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16); // PCM header length
    buf.writeUInt16LE(formatTag, 20); // anything but PCM is a different codec in the same container
    buf.writeUInt16LE(1, 22); // channels: mono
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28); // bytes per second
    buf.writeUInt16LE(2, 32); // bytes per sample frame
    buf.writeUInt16LE(16, 34); // bits per sample
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    return buf;
}

/** Real MPEG audio as far as the first bytes go: an ID3 tag and some frames. */
function tinyMp3(frames = 20): Buffer {
    const id3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]); // "ID3", v2.3, no tags
    const frame = Buffer.alloc(417); // MPEG1 Layer 3, 128 kbps, 44.1 kHz
    frame[0] = 0xff;
    frame[1] = 0xfb;
    frame[2] = 0x90;
    frame[3] = 0x64;
    return Buffer.concat([id3, ...Array.from({ length: frames }, () => frame)]);
}

/** A real 1x1 PNG — the "somebody uploaded a picture" case, not just random bytes. */
function tinyPng(): Buffer {
    const table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (buf: Buffer): number => {
        let c = 0xffffffff;
        for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer): Buffer => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(data.length, 0);
        head.write(type, 4);
        const tail = Buffer.alloc(4);
        tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), data])), 0);
        return Buffer.concat([head, data, tail]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0); // width
    ihdr.writeUInt32BE(1, 4); // height
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // truecolour
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

describe('live: voice messages', { skip: SKIP_REASON }, () => {
    const sdk = makeLiveSdk();

    const authorId = uid('voice-author');
    const author = { id: authorId, name: 'Voice Author' };
    const chatId = uid('voice-chat');
    const otherChatId = uid('voice-chat-2');
    const bytes = silentWav();

    let slot: AnyResp | null = null;
    let s3Refusal = '';
    let readyAttachmentId = '';

    /**
     * Every test past the setup needs an upload to work. Without `TEST_S3_*` there
     * may be no bucket at all, and skipping is honest. With one, a missing upload
     * URL is a failure, not a reason to stop.
     */
    const uploadsWork = (t: TestContext): boolean => {
        if (slot) return true;
        assert.ok(!HAS_TEST_S3, `the tenant was pointed at TEST_S3_BUCKET but no upload URL was issued: ${s3Refusal}`);
        t.skip(`${NO_S3_REASON} (backend said: ${s3Refusal})`);
        return false;
    };

    // Every file this suite uploaded, so it can delete them afterwards.
    // `clearTenant` removes the messages; the files in the bucket are ours to
    // clean up, and the upload URL is the only place their name shows up.
    const written: string[] = [];
    const rememberKey = (uploadUrl: string): void => {
        const path = new URL(uploadUrl).pathname.replace(/^\/+/, '');
        const prefix = `${TEST_S3.bucket}/`; // path-style URLs carry the bucket
        written.push(decodeURIComponent(path.startsWith(prefix) ? path.slice(prefix.length) : path));
    };

    /** Upload the bytes to where the backend said, and keep the key for cleanup. */
    const putToS3 = async (issued: AnyResp, payload: Buffer): Promise<void> => {
        const res = await fetch(String(issued.upload_url), {
            method: String(issued.method),
            headers: issued.headers as Record<string, string>,
            body: new Uint8Array(payload),
        });
        if (!res.ok) {
            // If S3 turns the upload away, the bucket is at fault, not the SDK.
            assert.fail(
                `S3 refused the upload: ${res.status} ${(await res.text()).slice(0, 200)}\n` +
                    '  the credentials suite (s3-credentials.test.ts) checks the bucket on its own',
            );
        }
        rememberKey(String(issued.upload_url));
    };

    /** Presign + upload, so a test that needs its own resource has one. Returns the resource id. */
    const freshUpload = async (mime = 'audio/wav', payload: Buffer = bytes): Promise<string> => {
        const r = await sdk.api.resourceUploadUrl<AnyResp>({ body: { type: 'voice', mime, size: payload.length } });
        await putToS3(r, payload);
        return String(r.resource_id);
    };

    type Resource = { id?: string; status?: string; attachment_id?: string | null; error?: string | null };

    /**
     * Poll until the resource is `ready` or `failed`. Verify and show both send
     * `Retry-After` while the resource is in progress, but the SDK hands back the
     * body only, so the pace here is fixed.
     */
    const waitForResource = async (resourceId: string, timeoutMs = 60_000): Promise<Resource> => {
        const deadline = Date.now() + timeoutMs;
        let last: Resource | undefined;
        while (Date.now() < deadline) {
            const r = await sdk.api.resourceShow({ path: { resource_id: resourceId } });
            last = r.resource as Resource;
            if (last?.status === 'ready' || last?.status === 'failed') return last;
            await new Promise((done) => setTimeout(done, 1000));
        }
        return assert.fail(`resource ${resourceId} is still ${last?.status} after ${timeoutMs} ms`);
    };

    before(async () => {
        try {
            await clearTenant(sdk);
        } catch (e) {
            console.warn(`[live] before clearTenant: ${describeError(e)}`);
        }
        await sdk.api.userCreate({ body: { user: { id: authorId, name: author.name } } });
        for (const [id, title] of [
            [chatId, 'Voice'],
            [otherChatId, 'Voice 2'],
        ]) {
            await sdk.api.chatCreate({ body: { chat: { id, title, type: 'group', owner: author } } });
        }
    });

    after(async () => {
        // Only what the last test didn't get to: it empties `written` when it runs.
        // We can delete only when we know the bucket's keys — a tenant pointed
        // somewhere else keeps its own files.
        if (HAS_TEST_S3) {
            const target = testS3Target();
            for (const key of written) {
                try {
                    const del = await s3Request(target, 'DELETE', key);
                    if (!del.ok) console.warn(`[live] leftover s3://${target.bucket}/${key}: HTTP ${del.status}`);
                } catch (e) {
                    console.warn(`[live] leftover s3://${target.bucket}/${key}: ${describeError(e)}`);
                }
            }
        }
        try {
            await clearTenant(sdk);
        } catch (e) {
            console.warn(`[live] after clearTenant: ${describeError(e)}`);
        }
    });

    test('1. an upload URL is issued, or S3 is reported missing with a 422', async (t) => {
        // Runs before the tenant is pointed anywhere, on purpose: keys can be
        // replaced but never removed, so this is the only chance to see the refusal,
        // and only on a tenant nobody has set up yet.
        //
        // The call is kept apart from the checks for a similar reason: with the
        // asserts inside the try, a failed check would land in the catch and be
        // reported as a wrong status instead of as itself.
        let answer: AnyResp | null = null;
        let failure: HttpErr | null = null;
        try {
            answer = await sdk.api.resourceUploadUrl<AnyResp>({
                body: { type: 'voice', mime: 'audio/wav', name: 'live-note.wav', size: bytes.length },
            });
        } catch (e) {
            failure = e as HttpErr;
        }

        if (failure) {
            assert.equal(failure.status, 422, `expected a 422 when S3 is missing, got ${describeError(failure)}`);
            assert.equal(failure.body?.status, false, 'a 422 without `status: false` in the body');
            assert.equal(typeof failure.body?.message, 'string', 'a 422 without a message saying what to fix');
            s3Refusal = String(failure.body?.message);
            t.diagnostic(`no S3 on this tenant yet: ${s3Refusal}`);
            return;
        }

        const r = answer as AnyResp;
        assertCompleteSlot(r);
        slot = r;
        t.diagnostic(`S3 already configured; resource_id=${r.resource_id}, max_size=${r.max_size}`);
    });

    /** A 200 has to be a complete answer. Half of one would send us uploading to nowhere. */
    function assertCompleteSlot(r: AnyResp): void {
        assert.equal(r.status, true, 'upload-url answered 200 with a falsy status');
        assert.ok(typeof r.resource_id === 'string' && r.resource_id.length > 0, 'no resource_id');
        assert.match(String(r.upload_url), /^https?:\/\//, 'upload_url is not a URL');
        assert.equal(String(r.method).toUpperCase(), 'PUT');
        assert.ok(r.headers && typeof r.headers === 'object', 'no headers to upload with');
        // The spec says the upload is private until verified.
        assert.equal((r.headers as Record<string, string>)['x-amz-acl'], 'private', 'the upload is not private');
        assert.ok(typeof r.max_size === 'number' && r.max_size > 0, 'no max_size');
        // A voice has a duration limit, so it has to be announced.
        assert.ok(typeof r.max_duration === 'number' && r.max_duration > 0, 'no max_duration for a voice');
        assert.ok(
            !Number.isNaN(Date.parse(String(r.url_expires_at))),
            `url_expires_at is not a date: ${String(r.url_expires_at)}`,
        );
        assert.ok(!Number.isNaN(Date.parse(String(r.expires_at))), `expires_at is not a date: ${String(r.expires_at)}`);
        assert.ok(bytes.length <= (r.max_size as number), 'the test file is over this tenant limit');
    }

    test('2. the tenant is pointed at the test bucket', async (t) => {
        if (!HAS_TEST_S3) {
            t.skip(NO_S3_REASON);
            return;
        }

        await configureTenantS3(sdk);

        // Whatever the tenant used before, it now writes where the tests are
        // allowed to write — and a URL has to come back.
        const r = await sdk.api.resourceUploadUrl<AnyResp>({
            body: { type: 'voice', mime: 'audio/wav', name: 'live-note.wav', size: bytes.length },
        });
        assertCompleteSlot(r);
        slot = r;
        t.diagnostic(`bucket configured; max_size=${r.max_size}, max_duration=${r.max_duration}`);
    });

    test('3. a mime the API does not take is refused before anything is uploaded', async (t) => {
        if (!uploadsWork(t)) return;

        // The mime we name is the only thing checked at this point — there are no
        // bytes yet. An image type and a made-up one are both turned away.
        for (const mime of ['image/png', 'audio/banana']) {
            await assert.rejects(sdk.api.resourceUploadUrl({ body: { type: 'voice', mime, size: 1024 } }), (e) => {
                const err = e as HttpErr;
                assert.equal(err.status, 422, `expected a 422 for ${mime}, got ${describeError(e)}`);
                t.diagnostic(`${mime} → ${err.body?.message ?? err.message}`);
                return true;
            });
        }
    });

    test('4. verify before the upload is refused', async (t) => {
        if (!uploadsWork(t)) return;

        // A fresh slot with nothing put behind it.
        const r = await sdk.api.resourceUploadUrl<AnyResp>({
            body: { type: 'voice', mime: 'audio/wav', size: bytes.length },
        });
        await assert.rejects(sdk.api.resourceVerify({ path: { resource_id: String(r.resource_id) } }), (e) => {
            const err = e as HttpErr;
            assert.equal(err.status, 422, `expected a 422 for a missing upload, got ${describeError(e)}`);
            t.diagnostic(`refused with: ${err.body?.message ?? err.message}`);
            return true;
        });
    });

    test('5. the file goes through the pipeline and comes back as an attachment', async (t) => {
        if (!uploadsWork(t)) return;
        const issued = slot as AnyResp;
        const resourceId = String(issued.resource_id);

        await putToS3(issued, bytes);

        const started = await sdk.api.resourceVerify({ path: { resource_id: resourceId } });
        assert.equal(started.status, true);
        assert.equal(started.resource?.id, resourceId);
        assert.ok(
            ['verifying', 'processing', 'ready'].includes(String(started.resource?.status)),
            `unexpected status right after verify: ${started.resource?.status}`,
        );

        // Verifying again must not start anything a second time — it answers with
        // where the resource is, whatever that is by now.
        const again = await sdk.api.resourceVerify({ path: { resource_id: resourceId } });
        assert.equal(again.resource?.id, resourceId);
        assert.notEqual(again.resource?.status, 'pending', 'a second verify put the resource back to pending');

        const done = await waitForResource(resourceId);
        assert.equal(done.status, 'ready', `the resource failed: ${done.error}`);
        assert.ok(done.attachment_id, 'a ready resource without an attachment_id');
        readyAttachmentId = String(done.attachment_id);

        const sent = await sdk.sendMessage<AnyResp>(chatId, author, [], {
            attachment_id: readyAttachmentId,
            text: 'live voice',
        });
        const ids = sent.message_ids as string[];
        assert.ok(Array.isArray(ids) && ids.length === 1, `expected one message id, got ${JSON.stringify(ids)}`);

        const list = await sdk.getMessagesFromChat<AnyResp>(chatId);
        const messages = list.messages as Record<string, AnyResp>;
        const posted = messages?.[ids[0]];
        assert.ok(posted, 'the voice message is not in the chat');
        assert.equal(posted.text, 'live voice', 'the caption did not survive');
        t.diagnostic(`message as stored: ${JSON.stringify(posted)}`);

        // The spec now puts the file on the message. A pipeline voice is always
        // served as ogg, and its original stays private.
        const attachments = posted.attachments as AnyResp[] | undefined;
        assert.ok(Array.isArray(attachments) && attachments.length === 1, 'the message carries no attachment');
        const [att] = attachments;
        assert.equal(att.mime, 'audio/ogg', 'a pipeline voice is not served as ogg');
        assert.match(String(att.url), /^https?:\/\//, 'the attachment has no URL to play');
        assert.equal(att.is_voice, true, 'the attachment is not marked as a voice');
        const variants = att.variants as Record<string, AnyResp> | undefined;
        assert.ok(variants?.playable, 'no playable variant');
        assert.equal(variants.playable.url, att.url, 'the flat url is not the playable variant');
        assert.ok(variants.original, 'no original variant');
        assert.ok(!('url' in variants.original), 'the original has a public url — it should stay private');
    });

    test('6. the same attachment can be sent again, to another chat too', async (t) => {
        if (!uploadsWork(t)) return;
        assert.ok(readyAttachmentId, 'nothing got through the pipeline, so there is nothing to resend');

        // The spec says an attachment is reusable within one bucket.
        for (const target of [chatId, otherChatId]) {
            const sent = await sdk.sendMessage<AnyResp>(target, author, [], { attachment_id: readyAttachmentId });
            const ids = sent.message_ids as string[];
            assert.ok(Array.isArray(ids) && ids.length === 1, `resend to ${target} gave ${JSON.stringify(ids)}`);
        }
    });

    test('7. an image uploaded as a voice is refused on verify', async (t) => {
        if (!uploadsWork(t)) return;

        // S3 takes whatever it is given: the upload URL doesn't look at the bytes.
        // Verify reads the start of the file, and that is where a picture is
        // caught. A real PNG, not random bytes — being a proper file doesn't help.
        const resourceId = await freshUpload('audio/wav', tinyPng());
        await assert.rejects(sdk.api.resourceVerify({ path: { resource_id: resourceId } }), (e) => {
            const err = e as HttpErr;
            assert.equal(err.status, 422, `expected a 422 for a PNG sent as a voice, got ${describeError(e)}`);
            t.diagnostic(`image refused with: ${err.body?.message ?? err.message}`);
            return true;
        });
    });

    test('8. audio in a format other than the declared one is refused on verify', async (t) => {
        if (!uploadsWork(t)) return;

        // A real recording, just not the one that was announced: the file is held
        // to the mime named when the URL was issued.
        const resourceId = await freshUpload('audio/wav', tinyMp3());
        await assert.rejects(sdk.api.resourceVerify({ path: { resource_id: resourceId } }), (e) => {
            const err = e as HttpErr;
            assert.equal(err.status, 422, `expected a 422 for an mp3 declared as wav, got ${describeError(e)}`);
            t.diagnostic(`wrong format refused with: ${err.body?.message ?? err.message}`);
            return true;
        });
    });

    test('9. a wav with an unusual codec settles as ready or failed, never stuck', async (t) => {
        if (!uploadsWork(t)) return;

        // Verify only checks the container, so this one is accepted; decoding is
        // the pipeline's job and its verdict now shows up in the status instead of
        // being settled out of sight. Either verdict is fine — hanging is not.
        const resourceId = await freshUpload('audio/wav', silentWav(200, WAV_IMA_ADPCM));
        await sdk.api.resourceVerify({ path: { resource_id: resourceId } });
        const done = await waitForResource(resourceId);
        if (done.status === 'failed') {
            assert.ok(done.error, 'failed without saying why');
            assert.equal(done.attachment_id ?? null, null, 'a failed resource still hands out an attachment');
        } else {
            assert.ok(done.attachment_id, 'ready without an attachment_id');
        }
        t.diagnostic(`IMA ADPCM wav → ${done.status}${done.error ? `: ${done.error}` : ''}`);
    });

    test('10. an unknown resource is a 404 on verify and on status', async () => {
        const nope = uid('never');
        for (const call of [
            () => sdk.api.resourceVerify({ path: { resource_id: nope } }),
            () => sdk.api.resourceShow({ path: { resource_id: nope } }),
        ]) {
            await assert.rejects(call(), (e) => {
                assert.equal((e as HttpErr).status, 404, `expected a 404, got ${describeError(e)}`);
                return true;
            });
        }
    });

    test('11. an attachment_id the pipeline never produced is refused on send', async (t) => {
        if (!slot) {
            t.diagnostic('no bucket here: the refusal may be about missing S3, not about the id');
        }
        await assert.rejects(sdk.sendMessage(chatId, author, [], { attachment_id: uid('never') }), (e) => {
            const err = e as HttpErr;
            assert.equal(err.status, 422, `expected a 422, got ${describeError(e)}`);
            t.diagnostic(`refused with: ${err.body?.message ?? err.message}`);
            return true;
        });
    });

    test('12. the backend refuses a message carrying both voice_url and attachment_id', async () => {
        // The SDK no longer stops this pair itself (the spec forbids it in words
        // only), so this is where the rule is checked. The backend refuses the
        // pair while checking input, before it looks the id up, so the wording
        // names the pair even for an id that doesn't exist — a refusal for the
        // unknown id alone would fail the match below.
        const attachmentId = readyAttachmentId || uid('never');

        let answer: unknown;
        try {
            answer = await sdk.sendMessage(chatId, author, [], {
                text: 'both at once',
                voice_url: 'https://example.com/note.mp3',
                attachment_id: attachmentId,
            });
        } catch (e) {
            const err = e as HttpErr;
            assert.equal(err.status, 422, `expected a 422, got ${describeError(e)}`);
            // Seen live 2026-09-24: "The messages.0.attachment_id field prohibits
            // messages.0.voice_url from being present."
            assert.match(
                String(err.body?.message),
                /attachment_id field prohibits .*voice_url/,
                `refused, but not for the pair: ${err.body?.message}`,
            );
            return;
        }

        assert.fail(
            `the backend accepted voice_url and attachment_id together (${JSON.stringify(answer)}) — ` +
                'the spec calls them mutually exclusive, so either the spec or the backend has moved',
        );
    });

    test('13. the files this run wrote are taken back out of the bucket', async (t) => {
        if (!HAS_TEST_S3) {
            t.skip(NO_S3_REASON);
            return;
        }

        // Done here, not only in the teardown, so it shows up in the output and is
        // actually checked. A delete that fails quietly would leave the bucket
        // filling up run after run. Only the uploads are known by key; what the
        // pipeline derives from them (the ogg, the preview) lives elsewhere.
        const target = testS3Target();
        const keys = written.splice(0, written.length);
        for (const key of keys) {
            const del = await s3Request(target, 'DELETE', key);
            assert.ok(
                del.ok,
                `DELETE s3://${target.bucket}/${key} failed: HTTP ${del.status} ${del.text.slice(0, 200)}`,
            );
            // A 403 also means gone: a key that may read objects but not list the
            // bucket gets that instead of 404 for something that isn't there.
            const gone = await s3Request(target, 'GET', key);
            assert.ok(
                gone.status === 404 || gone.status === 403,
                `s3://${target.bucket}/${key} is still readable after DELETE (HTTP ${gone.status})`,
            );
        }
        t.diagnostic(`removed ${keys.length} file(s) from s3://${target.bucket}`);
    });
});
