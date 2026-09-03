/**
 * Do the keys in `TEST_S3_*` work at all?
 *
 * This suite writes a small file into the bucket and deletes it again, talking to
 * S3 directly — no tenant, no backend, none of the SDK.
 *
 * That is the whole point. When the voice suite says an upload was refused, this
 * one tells you whether the bucket was ever set up right. Otherwise you are left
 * guessing between a wrong key, a wrong region, the address style, and a bucket
 * that won't take the public-read setting the backend asks for.
 *
 * It tidies up: the last test deletes both files, and the teardown removes
 * anything a failed run left behind.
 */

import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { HAS_TEST_S3, NO_S3_REASON, testS3Target, uid } from './_helpers.js';
import { DEFAULT_REGION, objectUrl, s3ErrorCode, s3Request } from './_s3.js';

describe('live: the TEST_S3 credentials themselves', { skip: HAS_TEST_S3 ? false : NO_S3_REASON }, () => {
    const target = testS3Target();
    const style = target.pathStyle ? 'path' : 'virtual-hosted';
    const region = target.region || `${DEFAULT_REGION} (default — set TEST_S3_REGION if wrong)`;

    const plainKey = `getchat-sdk-preflight/${uid('probe')}.txt`;
    const aclKey = `getchat-sdk-preflight/${uid('probe-acl')}.txt`;
    const payload = Buffer.from(`getchat sdk preflight ${new Date().toISOString()}\n`);

    /** What went wrong, in the words someone editing `.env` needs to read. */
    const explain = (what: string, answer: { status: number; text: string }): string =>
        `${what} failed: HTTP ${answer.status} ${s3ErrorCode(answer.text) || answer.text.slice(0, 200)}\n` +
        `  bucket:   ${target.bucket}\n` +
        `  endpoint: ${target.endpointUrl} (${style} style — flip TEST_S3_PATH_STYLE if that is wrong)\n` +
        `  region:   ${region}`;

    after(async () => {
        // A failed test may have left a file behind. Try to remove it; if that
        // fails too, there is nothing more to do here.
        for (const key of [plainKey, aclKey]) {
            try {
                await s3Request(target, 'DELETE', key);
            } catch {
                /* nothing to do about it here */
            }
        }
    });

    test('1. the bucket takes a small file', async (t) => {
        const put = await s3Request(target, 'PUT', plainKey, {
            body: payload,
            headers: { 'content-type': 'text/plain' },
        });
        assert.ok(put.ok, explain(`PUT ${objectUrl(target, plainKey)}`, put));
        t.diagnostic(`wrote s3://${target.bucket}/${plainKey}`);
    });

    test('2. the file reads back byte for byte', async () => {
        const got = await s3Request(target, 'GET', plainKey);
        assert.ok(got.ok, explain(`GET ${objectUrl(target, plainKey)}`, got));
        assert.equal(
            got.bytes.toString('utf8'),
            payload.toString('utf8'),
            'the bucket returned something other than what was written',
        );
    });

    test('3. the bucket accepts the public-read ACL the backend signs into its URLs', async (t) => {
        const put = await s3Request(target, 'PUT', aclKey, {
            body: payload,
            headers: { 'content-type': 'text/plain', 'x-amz-acl': 'public-read' },
        });
        assert.ok(
            put.ok,
            `${explain(`PUT with x-amz-acl: public-read ${objectUrl(target, aclKey)}`, put)}\n` +
                '  the upload URL from POST /files/upload-url sends this header too, so a real\n' +
                '  upload would fail the same way. A bucket with ACLs turned off (ownership set\n' +
                '  to "bucket owner enforced") cannot hold voice files as things stand',
        );
        t.diagnostic('public-read ACL accepted');
    });

    test('4. both files can be removed again', async () => {
        for (const key of [plainKey, aclKey]) {
            const del = await s3Request(target, 'DELETE', key);
            assert.ok(del.ok, explain(`DELETE ${objectUrl(target, key)}`, del));
        }

        // Most stores answer 204 for deleting something that was never there, so
        // the only proof is that the file is gone afterwards. A 403 counts as gone
        // as well: AWS answers that instead of 404 when the key may read objects
        // but not list the bucket — and we read this very file a moment ago, so it
        // is the file that is missing, not the permission.
        const gone = await s3Request(target, 'GET', plainKey);
        assert.ok(
            gone.status === 404 || gone.status === 403,
            `the file is still readable after DELETE (HTTP ${gone.status})`,
        );
    });
});
