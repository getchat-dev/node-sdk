import { Emby, type EmbyConfig } from '../../src/index';

export const DEFAULTS: Readonly<EmbyConfig> = Object.freeze({
    id: 'test-client-id',
    secret: 'test-client-secret',
    api_token: 'test-api-token',
});

export function makeSdk(baseUrl: string, overrides: Partial<EmbyConfig> = {}): Emby {
    const { options, ...rest } = overrides;
    return new Emby({
        ...DEFAULTS,
        base_url: baseUrl,
        api_url: baseUrl,
        ...rest,
        // Retries off by default so per-method tests see a single request; retry
        // behavior is covered on its own in request-retry.test.ts. Tests can opt in
        // via `overrides.options`.
        options: { retries: 0, ...options },
    });
}
