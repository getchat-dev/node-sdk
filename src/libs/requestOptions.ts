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
