/**
 * Live-test shared utilities.
 *
 * Tests load `.env` via `--env-file=.env` in the npm script; if `EMBY_API_TOKEN`
 * or `EMBY_BASE_URL` is missing, suites skip themselves.
 *
 * Every test that creates resources must register them with the tracker so the
 * `after()` hook can best-effort clean them up. For full tenant reset between
 * suites we use `api.tenantClearData({ query: { sync: true } })` — the `sync`
 * flag makes the backend wait until the wipe completes before responding.
 */
import * as crypto from 'node:crypto';
import { after, before } from 'node:test';
import { Emby } from '../../src/index.js';
import { normalizeEndpoint, type S3Target } from './_s3.js';

export const LIVE_ENV = {
    id: process.env.EMBY_ID,
    secret: process.env.EMBY_SECRET,
    apiToken: process.env.EMBY_API_TOKEN,
    baseUrl: process.env.EMBY_BASE_URL,
};

export const HAS_LIVE_CREDS = !!(LIVE_ENV.apiToken && LIVE_ENV.baseUrl);

export const SKIP_REASON = HAS_LIVE_CREDS
    ? false
    : 'no EMBY_API_TOKEN / EMBY_BASE_URL in env; create .env with live creds to run';

/** Build an SDK pointed at the configured live backend. */
export function makeLiveSdk(): Emby {
    return new Emby({
        id: LIVE_ENV.id,
        secret: LIVE_ENV.secret,
        api_token: LIVE_ENV.apiToken,
        base_url: LIVE_ENV.baseUrl,
    });
}

/**
 * The bucket the voice tests are allowed to write into.
 *
 * Not `EMBY_*` on purpose: those four configure the SDK, while these exist only
 * for the tests and the SDK never reads them. The names match the fields of
 * `tenant.setS3Credentials` one for one, so nothing has to be translated.
 *
 * Without them the upload suite can only check that the backend refuses to hand
 * out a URL; with them it runs the whole way against a real bucket.
 */
export const TEST_S3 = {
    accessKey: process.env.TEST_S3_ACCESS_KEY,
    secretKey: process.env.TEST_S3_SECRET_KEY,
    endpointUrl: process.env.TEST_S3_ENDPOINT_URL,
    bucket: process.env.TEST_S3_BUCKET,
    region: process.env.TEST_S3_REGION,
    pathStyle: process.env.TEST_S3_PATH_STYLE,
    publicUrl: process.env.TEST_S3_PUBLIC_URL,
    cdnUrl: process.env.TEST_S3_CDN_URL,
};

export const HAS_TEST_S3 = !!(TEST_S3.accessKey && TEST_S3.secretKey && TEST_S3.endpointUrl && TEST_S3.bucket);

export const NO_S3_REASON = 'no TEST_S3_* in env; add bucket keys to .env to run the upload against a real bucket';

/**
 * Point the tenant at the test bucket.
 *
 * There is no way back: the endpoint wants all four fields, so keys can be
 * replaced but not removed. A test that wants to see the "no S3 here" refusal has
 * to look before calling this.
 */
export async function configureTenantS3(sdk: Emby): Promise<void> {
    if (!HAS_TEST_S3) throw new Error(`configureTenantS3: ${NO_S3_REASON}`);
    const truthy = (v: string | undefined): boolean => ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
    await sdk.api.tenantSetS3Credentials({
        body: {
            access_key: TEST_S3.accessKey as string,
            secret_key: TEST_S3.secretKey as string,
            endpoint_url: normalizeEndpoint(TEST_S3.endpointUrl as string),
            bucket: TEST_S3.bucket as string,
            ...(TEST_S3.region ? { region: TEST_S3.region } : {}),
            ...(TEST_S3.pathStyle ? { s3_path_style: truthy(TEST_S3.pathStyle) } : {}),
            ...(TEST_S3.publicUrl ? { public_url: TEST_S3.publicUrl } : {}),
            ...(TEST_S3.cdnUrl ? { cdn_url: TEST_S3.cdnUrl } : {}),
        },
    });
}

/** The same bucket as an `S3Target`, for talking to S3 without the backend. */
export function testS3Target(): S3Target {
    if (!HAS_TEST_S3) throw new Error(`testS3Target: ${NO_S3_REASON}`);
    return {
        accessKey: TEST_S3.accessKey as string,
        secretKey: TEST_S3.secretKey as string,
        endpointUrl: TEST_S3.endpointUrl as string,
        bucket: TEST_S3.bucket as string,
        region: TEST_S3.region,
        pathStyle: ['1', 'true', 'yes', 'on'].includes(String(TEST_S3.pathStyle).toLowerCase()),
    };
}

/** Unique short suffix — 8 hex chars — to avoid collisions with prior runs. */
export function uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

/** Readable request error for diagnostic output. */
export function describeError(err: unknown): string {
    if (err instanceof Error) {
        const status = (err as Error & { status?: number }).status;
        return status ? `HTTP ${status}: ${err.message}` : err.message;
    }
    return String(err);
}

/** Whole-tenant reset via the openapi `tenant.clearData` operation. Waits for completion. */
export async function clearTenant(sdk: Emby): Promise<void> {
    await sdk.api.tenantClearData({ query: { sync: true } });
}

/**
 * Suite-level reset + cleanup pattern. Call `setupSuite()` at the top of a describe
 * block; it wires `before` to clear the tenant and `after` to clear it again so
 * the next suite starts from a blank slate and leftovers don't leak.
 */
export function setupSuite(sdk: Emby) {
    before(async () => {
        try {
            await clearTenant(sdk);
        } catch (e) {
            console.warn(`[live] setup: clearTenant failed — ${describeError(e)}`);
        }
    });
    after(async () => {
        try {
            await clearTenant(sdk);
        } catch (e) {
            console.warn(`[live] teardown: clearTenant failed — ${describeError(e)}`);
        }
    });
}
