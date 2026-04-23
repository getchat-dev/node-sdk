import { Emby, type EmbyConfig } from '../../src/index';

export const DEFAULTS: Readonly<EmbyConfig> = Object.freeze({
    id: 'test-client-id',
    secret: 'test-client-secret',
    api_token: 'test-api-token',
});

export function makeSdk(baseUrl: string, overrides: Partial<EmbyConfig> = {}): Emby {
    return new Emby({
        ...DEFAULTS,
        base_url: baseUrl,
        api_url: baseUrl,
        ...overrides,
    });
}
