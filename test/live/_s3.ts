/**
 * A small S3 client with one job: showing that the keys in `TEST_S3_*` really
 * work. It talks to the bucket directly, with nothing in between, so when it
 * fails the problem is the key, the region, the address style or the bucket —
 * not the SDK and not the tenant.
 *
 * Requests are signed by hand (AWS Signature V4) with `node:crypto`. It comes to
 * about fifty lines; the AWS SDK would be a far bigger dependency than the one
 * upload and one delete it would sign for us.
 *
 * Used by `s3-credentials.test.ts`, which is the check itself, and by
 * `voice-messages.test.ts`, which deletes the files it uploads. The signing is
 * checked in `test/unit/s3-signing.test.ts` — that one needs no bucket and runs
 * with the ordinary tests.
 */

import * as crypto from 'node:crypto';

/** Signing always asks for a region, even where the storage has none. */
export const DEFAULT_REGION = 'us-east-1';

export interface S3Target {
    accessKey: string;
    secretKey: string;
    /** The base address, e.g. `https://s3.example.com`. The bucket is not part of it. */
    endpointUrl: string;
    bucket: string;
    /** Optional — [`DEFAULT_REGION`] stands in when nothing is set. */
    region?: string;
    /** `true` puts the bucket in the path (`endpoint/bucket/key`), otherwise in the host, as AWS does. */
    pathStyle?: boolean;
}

export interface S3Answer {
    status: number;
    ok: boolean;
    /** The body as text — S3 says why it refused in XML. */
    text: string;
    bytes: Buffer;
}

const sha256hex = (data: string | Buffer): string => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string): Buffer =>
    crypto.createHmac('sha256', key).update(data, 'utf8').digest();

/** S3 wants `!'()*` escaped too, and `encodeURIComponent` leaves them alone. */
const encodeSegment = (s: string): string =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * `s3.example.com` → `https://s3.example.com`. People copy the address out of a
 * storage console, which often prints just the host, and a missing `https://`
 * should not look like a broken key.
 */
export function normalizeEndpoint(raw: string): string {
    const trimmed = String(raw).trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** The address of one object, written the way this target wants it. */
export function objectUrl(target: S3Target, key: string): string {
    const base = new URL(normalizeEndpoint(target.endpointUrl));
    const path = key.split('/').map(encodeSegment).join('/');
    if (target.pathStyle) {
        const prefix = base.pathname.replace(/\/+$/, '');
        return `${base.origin}${prefix}/${encodeSegment(target.bucket)}/${path}`;
    }
    return `${base.protocol}//${target.bucket}.${base.host}/${path}`;
}

/**
 * The headers for a signed request — all of them but `host`, which the runtime
 * adds itself. We still sign `host`, taking it from the URL so both agree.
 *
 * It sits apart from the request for one reason: nothing here goes out to the
 * network, so the signing can be checked against AWS's published example without
 * a bucket. See `test/unit/s3-signing.test.ts`.
 */
export function signedRequestHeaders(
    target: S3Target,
    method: string,
    url: URL,
    options: { body?: Buffer; headers?: Record<string, string>; amzDate?: string } = {},
): Record<string, string> {
    const region = target.region || DEFAULT_REGION;
    const body = options.body ?? Buffer.alloc(0);
    const payloadHash = sha256hex(body);

    const amzDate = options.amzDate ?? new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260903T101112Z
    const dateStamp = amzDate.slice(0, 8);

    const headers: Record<string, string> = {
        host: url.host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    };

    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim()}\n`).join('');
    const signedHeaders = names.join(';');
    const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

    const signingKey = ['s3', 'aws4_request'].reduce(
        (k, part) => hmac(k, part),
        hmac(hmac(`AWS4${target.secretKey}`, dateStamp), region),
    );
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const sent: Record<string, string> = {};
    for (const name of names) {
        if (name !== 'host') sent[name] = headers[name];
    }
    sent.authorization =
        `AWS4-HMAC-SHA256 Credential=${target.accessKey}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return sent;
}

/**
 * One signed request to the bucket. It hands back the answer instead of throwing,
 * because a 403 with S3's own words in it is exactly what we came to read.
 */
export async function s3Request(
    target: S3Target,
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    options: { body?: Buffer; headers?: Record<string, string> } = {},
): Promise<S3Answer> {
    const url = new URL(objectUrl(target, key));
    const body = options.body ?? Buffer.alloc(0);
    const res = await fetch(url, {
        method,
        headers: signedRequestHeaders(target, method, url, { body, headers: options.headers }),
        body: method === 'PUT' ? new Uint8Array(body) : undefined,
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ok: res.ok, text: bytes.toString('utf8'), bytes };
}

/** The `<Code>` out of S3's XML refusal — the one line worth reading. */
export function s3ErrorCode(text: string): string {
    return /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? '';
}
