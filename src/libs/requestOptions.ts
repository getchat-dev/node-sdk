import { z } from 'zod';

// Runtime validation for the constructor's `options` object. The hand-written
// public type lives on `EmbyRequestOptions` in index.ts; this schema enforces
// sane values at construction so a bad `timeout` fails fast (a clear ZodError)
// instead of silently misbehaving. Kept in sync with `EmbyRequestOptions`.
export const requestOptionsSchema = z.strictObject({
    // Per-attempt timeout in ms. 0 disables it. `.int().nonnegative()` rejects
    // negatives, fractions, NaN and non-numbers.
    timeout: z.number().int().nonnegative().default(30_000),
    // Retry attempts after the first failure (0 disables). Capped so a typo like
    // `retries: 10000` fails validation instead of hammering the backend.
    retries: z.number().int().min(0).max(10).default(2),
    // Base backoff delay in ms (exponential with jitter between attempts).
    retryDelay: z.number().int().nonnegative().default(200),
});

export type ResolvedRequestOptions = z.infer<typeof requestOptionsSchema>;

/** Validate + fill defaults for the constructor `options`. Throws on bad input. */
export function resolveRequestOptions(options: unknown): ResolvedRequestOptions {
    return requestOptionsSchema.parse(options ?? {});
}

/** Thrown when a request exceeds its configured `timeout` (ms). */
export class TimeoutError extends Error {
    readonly code = 'ETIMEDOUT';
    constructor(
        readonly timeoutMs: number,
        method: string,
    ) {
        super(`Request to '${method}' timed out after ${timeoutMs}ms`);
        this.name = 'TimeoutError';
    }
}

/**
 * Per-call transport controls, mixed into every generated `.api.*` input so a
 * single request can carry a cancellation signal and override the instance
 * timeout/retry settings. Stripped from the wire payload before sending.
 */
export interface RequestControlOptions {
    /** Abort the request (and any pending retry backoff) when this signal fires. */
    signal?: AbortSignal;
    /** Override the instance `timeout` (ms) for this call. */
    timeout?: number;
    /** Override the instance `retries` for this call. */
    retries?: number;
    /** Override the instance `retryDelay` (ms) for this call. */
    retryDelay?: number;
}

const CONTROL_KEYS = ['signal', 'timeout', 'retries', 'retryDelay'] as const;

/** Extract the per-call control options from a generated `.api.*` input object. */
export function pickRequestControl(input: unknown): RequestControlOptions {
    if (input === null || typeof input !== 'object') return {};
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of CONTROL_KEYS) {
        if (src[key] !== undefined) out[key] = src[key];
    }
    return out as RequestControlOptions;
}
