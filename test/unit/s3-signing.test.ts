/**
 * The live suite that checks `TEST_S3_*` signs its own requests (AWS Signature
 * V4, `test/live/_s3.ts`). Nobody runs that suite without real keys, so a mistake
 * in the signing would only ever surface as "403 SignatureDoesNotMatch" — the
 * very confusion the suite is there to clear up.
 *
 * So the signing is checked here instead, against the example AWS publishes for
 * "GET Object" with a Range header: fixed keys, a fixed date, a known signature.
 * No bucket needed, and it runs with the ordinary tests.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normalizeEndpoint, objectUrl, type S3Target, signedRequestHeaders } from '../live/_s3';

// From AWS's signature-v4 examples — the credentials are theirs, not ours.
const EXAMPLE: S3Target = {
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    endpointUrl: 'https://s3.amazonaws.com',
    bucket: 'examplebucket',
    region: 'us-east-1',
};

describe('S3 request signing (live-suite helper)', () => {
    test('reproduces the signature AWS publishes for GET Object with a Range', () => {
        const url = new URL(objectUrl(EXAMPLE, 'test.txt'));
        assert.equal(url.href, 'https://examplebucket.s3.amazonaws.com/test.txt');

        const headers = signedRequestHeaders(EXAMPLE, 'GET', url, {
            headers: { range: 'bytes=0-9' },
            amzDate: '20130524T000000Z',
        });

        assert.equal(
            headers.authorization,
            'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
                'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
                'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
        );
        // The hash of the body travels as a header of its own. With no body, it is
        // the hash of an empty string.
        assert.equal(
            headers['x-amz-content-sha256'],
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        );
        assert.equal(headers['x-amz-date'], '20130524T000000Z');
        assert.ok(!('host' in headers), 'host must be left to the runtime, not sent by hand');
    });

    test('an endpoint copied without its scheme still resolves', () => {
        // Storage consoles print a bare host as often as a URL; a missing scheme
        // used to throw "Invalid URL" and read as a broken credential.
        assert.equal(normalizeEndpoint('s3.example.com'), 'https://s3.example.com');
        assert.equal(normalizeEndpoint('https://s3.example.com/'), 'https://s3.example.com');
        assert.equal(normalizeEndpoint(' http://localhost:9000 '), 'http://localhost:9000');
        assert.equal(
            objectUrl({ ...EXAMPLE, endpointUrl: 's3.example.com' }, 'k.txt'),
            'https://examplebucket.s3.example.com/k.txt',
        );
    });

    test('path style puts the bucket in the path instead of the host', () => {
        const url = new URL(
            objectUrl({ ...EXAMPLE, endpointUrl: 'https://s3.example.com', pathStyle: true }, 'a b/c.txt'),
        );
        assert.equal(url.href, 'https://s3.example.com/examplebucket/a%20b/c.txt');
    });
});
