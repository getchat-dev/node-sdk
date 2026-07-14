import { z } from 'zod';

// Runtime validation for the constructor's `options` object. The hand-written
// public type lives on `EmbyRequestOptions` in index.ts; this schema enforces
// sane values at construction so a bad `timeout` fails fast (a clear ZodError)
// instead of silently misbehaving. Kept in sync with `EmbyRequestOptions`.
// Shared numeric bounds, reused by the constructor `options` and the per-call
// overrides so a value like `retries: 15` is rejected the same way wherever it is
// set. `timeout`/`retryDelay`: `.int().nonnegative()` rejects negatives, fractions,
// NaN and non-numbers. `retries` is capped so a typo like `retries: 10000` fails
// validation instead of hammering the backend.
const timeoutSchema = z.number().int().nonnegative();
const retriesSchema = z.number().int().min(0).max(10);
const retryDelaySchema = z.number().int().nonnegative();

export const requestOptionsSchema = z.strictObject({
    // Per-attempt timeout in ms. 0 disables it.
    timeout: timeoutSchema.default(30_000),
    // Retry attempts after the first failure (0 disables).
    retries: retriesSchema.default(2),
    // Base backoff delay in ms (exponential with jitter between attempts).
    retryDelay: retryDelaySchema.default(200),
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

// Per-call numeric overrides share the instance bounds; all optional (undefined =
// fall back to the instance default). `signal` is not a number and is handled
// separately, so it is validated/passed through outside this schema.
export const controlOverridesSchema = z.strictObject({
    timeout: timeoutSchema.optional(),
    retries: retriesSchema.optional(),
    retryDelay: retryDelaySchema.optional(),
});

export type ControlOverrides = z.infer<typeof controlOverridesSchema>;

/**
 * Validate the per-call `timeout`/`retries`/`retryDelay` overrides against the same
 * bounds as the constructor options. Throws a ZodError on a bad value so a per-call
 * typo fails as loudly as an instance one (they used to slip through unchecked).
 */
export function resolveControlOverrides(control: RequestControlOptions | undefined): ControlOverrides {
    if (!control) return {};
    // Only forward keys that were actually set, so the result is a clean {} when
    // nothing is overridden (an absent key means "use the instance default").
    const input: Record<string, unknown> = {};
    if (control.timeout !== undefined) input.timeout = control.timeout;
    if (control.retries !== undefined) input.retries = control.retries;
    if (control.retryDelay !== undefined) input.retryDelay = control.retryDelay;
    return controlOverridesSchema.parse(input);
}
