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
