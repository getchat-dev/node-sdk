import type { IncomingHttpHeaders } from 'node:http';

/** A failed attempt carries `status` (HTTP) or `code` (transport), plus response headers. */
export interface RequestErrorLike {
    status?: number;
    code?: string;
    headers?: IncomingHttpHeaders;
}

// 5xx worth retrying (transient). 429 is handled separately — it is safe for any
// method, these are only for idempotent reads.
const RETRYABLE_5XX = new Set([500, 502, 503, 504]);

// Transport errors that prove the request never reached the server, so even a
// non-idempotent write is safe to replay.
const PRE_SEND_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

/** Backoff waits are capped here so a huge `Retry-After` can't stall a call forever. */
export const MAX_BACKOFF_MS = 30_000;

export function isIdempotent(method: string): boolean {
    const m = method.toLowerCase();
    return m === 'get' || m === 'delete';
}

/**
 * Decide whether a failed attempt for `method` may be retried.
 * - 429: retried for any method (rate limit — the request was rejected, not run).
 * - 5xx: retried only for idempotent reads (a write may have taken effect).
 * - transport errors: retried for reads; for writes only when the request
 *   provably never left (connection refused / DNS), never mid-flight.
 */
export function shouldRetry(method: string, error: unknown): boolean {
    const e = (error ?? {}) as RequestErrorLike;
    if (typeof e.status === 'number') {
        if (e.status === 429) return true;
        if (RETRYABLE_5XX.has(e.status)) return isIdempotent(method);
        return false;
    }
    if (typeof e.code === 'string') {
        return isIdempotent(method) || PRE_SEND_CODES.has(e.code);
    }
    return false; // parse errors, bugs — don't retry
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfter(value: string | string[] | undefined): number | undefined {
    if (value === undefined) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) return undefined;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const when = Date.parse(raw);
    if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
    return undefined;
}

/**
 * Delay before the next attempt: honor `Retry-After` when present, otherwise
 * exponential backoff with full jitter (`base·2^n` plus up to the same again).
 * `rand` is injectable for deterministic tests.
 */
export function backoffDelay(
    attempt: number,
    baseMs: number,
    retryAfterMs?: number,
    rand: () => number = Math.random,
): number {
    if (retryAfterMs !== undefined) return Math.min(retryAfterMs, MAX_BACKOFF_MS);
    const exp = baseMs * 2 ** attempt;
    const jittered = exp + rand() * exp;
    return Math.min(jittered, MAX_BACKOFF_MS);
}

function abortError(signal?: AbortSignal): unknown {
    // AbortSignal.reason exists on Node 17+; fall back to a named Error on Node 16.
    const reason = signal?.reason;
    if (reason !== undefined) return reason;
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    return e;
}

/** Sleep for `ms`, rejecting early with the abort reason if `signal` fires. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError(signal));
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError(signal));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
