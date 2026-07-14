import { z } from 'zod';

// Runtime validation for the constructor's `options` object. The hand-written
// public type lives on `EmbyRequestOptions` in index.ts; this schema enforces
// sane values at construction so a bad `timeout` fails fast (a clear ZodError)
// instead of silently misbehaving. Kept in sync with `EmbyRequestOptions`.
export const requestOptionsSchema = z.strictObject({
    // Per-attempt timeout in ms. 0 disables it. `.int().nonnegative()` rejects
    // negatives, fractions, NaN and non-numbers.
    timeout: z.number().int().nonnegative().default(30_000),
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
