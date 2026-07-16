import * as _ from './helpers.js';

export const strRandom = _.randomString;

export const flatten = (obj: Record<string, unknown>, prefix = '', postfix = ''): Record<string, unknown> => {
    const data: Record<string, unknown> = {};

    Object.keys(obj).forEach((item) => {
        const value = obj[item];
        if (typeof value === 'object' && value !== null) {
            const values = flatten(value as Record<string, unknown>, '[', ']');
            if (Object.keys(values).length) {
                Object.keys(values).forEach((sub) => {
                    data[`${prefix}${item}${postfix}${sub}`] = values[sub];
                });
            }
        } else {
            data[`${prefix}${item}${postfix}`] = value;
        }
    });

    return data;
};

const _trim = (value: unknown): unknown => (_.isString(value) ? value.trim() : value);

export type NormalizeFilterSpec = {
    default?: unknown;
    process?: (value: unknown) => unknown;
} | null;

export type NormalizeFilter = readonly string[] | Record<string, NormalizeFilterSpec>;

export const normalizeData = (data: unknown, filter: NormalizeFilter = []): Record<string, unknown> => {
    if (!_.isPlainObject(data)) {
        throw new Error('first parameter have to be a plain object type');
    }

    const source = { ...data } as Record<string, unknown>;

    let filterFields: readonly string[] = [];
    if (_.isFilledPlainObject(filter)) {
        filterFields = Object.keys(filter);
    } else if (_.isFilledArray(filter)) {
        filterFields = filter as readonly string[];
    }

    if (!filterFields.length) return source;

    const result: Record<string, unknown> = {};
    const filterObj = filter as Record<string, NormalizeFilterSpec>;

    filterFields.forEach((key) => {
        const spec = filterObj?.[key];

        if (_.isFunction(_.getValue(filter, [key, 'process']))) {
            const processed = spec?.process?.(source[key]);
            if (processed !== undefined) {
                result[key] = _trim(processed);
            }
        } else if (_.isNoValue(source[key])) {
            if (_.getValue(filter, [key, 'default'], undefined) !== undefined) {
                result[key] = _trim(spec?.default);
            }
        } else {
            result[key] = _trim(source[key]);
        }
    });

    return result;
};

export const normalizeChat = (chat: unknown): Record<string, unknown> => {
    const result = normalizeData(chat, ['id', 'title', 'socket_port', 'create', 'type', 'metadata']);
    // Coerce `create` to integer 0/1 BEFORE signing. Backend's `$beforeSanitizers`
    // with `'chat.create' => 'boolean'` does NOT run prior to `authorize()` — real-
    // world logs show PHP sees `chat.create = "1"` (string from query) during
    // `verifyLegacyMd5`, and pushes that `"1"` into the signature. Matching wire
    // and signature requires JS to send integer 1/0 (wire) and string "1"/"0" via
    // String(1) (signature) on its side.
    if ('create' in result && _.isBoolean(result.create)) {
        result.create = result.create ? 1 : 0;
    }
    return result;
};

/**
 * Builds a signature fragment matching the backend's `appendInfoLegacy` helper
 * used by `Signature::verifyLegacyMd5` (the MD5 scheme of `urlByChatId`):
 *   - `Arr::only($data, $fields)` — pick fields from whitelist
 *   - `ksort` — alphabetical key order (PHP default string comparison)
 *   - skip null/undefined values
 *   - booleans → literal 'true' / 'false' strings (PHP: `$value ? 'true' : 'false'`)
 *   - other scalars pushed as-is (PHP stringifies implicitly via `implode(',', …)`)
 *
 * Contrast with `addToSignature` which follows the given field ORDER (used by
 * the newer HMAC-SHA256 path `verifyHmacSha256` via `appendFieldsFixed`).
 */
export const appendLegacy = (
    signature: readonly unknown[],
    data: Record<string, unknown>,
    fields: readonly string[],
): unknown[] => {
    const result = Array.prototype.slice.call(signature);
    const filtered: Record<string, unknown> = {};
    for (const f of fields) {
        if (f in data && !_.isNoValue(data[f])) {
            filtered[f] = data[f];
        }
    }
    const sortedKeys = Object.keys(filtered).sort();
    for (const k of sortedKeys) {
        const v = filtered[k];
        result.push(typeof v === 'boolean' ? (v ? 'true' : 'false') : v);
    }
    return result;
};

/**
 * Recursively coerce booleans to 1/0 integers in a value tree. Used right before
 * URL emission: `querystring.stringify(true)` produces `'true'` which Laravel's
 * `boolean` validator rejects — accepted forms are only `1`, `0`, `"1"`, `"0"`,
 * `true`, `false`. Applied AFTER signature is computed so the signature itself
 * keeps booleans (matching PHP `appendInfoLegacy` / `packField` string form).
 */
export const coerceBooleansForWire = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(coerceBooleansForWire);
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = coerceBooleansForWire(v);
        }
        return out;
    }
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
};

export const normalizeParticipant = (participant: unknown): Record<string, unknown> =>
    normalizeData(participant, {
        id: null,
        name: null,
        email: null,
        link: null,
        picture: null,
        is_bot: { default: false },
        // Per-chat right overrides (REST-only field; the URL-signing flows use their
        // own inline whitelists and never pick this up). Passed through as-is — the
        // generated ParticipantRights Zod schema validates the shape downstream.
        rights: null,
    });

export const packObjectForSignature = (obj: Record<string, unknown>, key = ''): string[] => {
    const packed: string[] = [];
    _.sort(Object.keys(obj)).forEach((k) => {
        packed.push(`${key ? `${key}.` : ''}${k}=${obj[k]}`);
    });
    return packed;
};

export const addToSignature = (
    signature: readonly unknown[],
    data: Record<string, unknown>,
    filterKeys?: readonly string[],
): unknown[] => {
    const result = Array.prototype.slice.call(signature);

    let keys = Object.keys(data);
    if (!keys.length) return result;

    if (_.isFilledArray(filterKeys)) {
        keys = (filterKeys as readonly string[]).filter((key) => keys.indexOf(key) > -1);
    } else {
        keys = _.sort(keys);
    }

    keys.forEach((key) => {
        switch (_.getType(data[key])) {
            case _.TYPES.SCALAR:
                result.push(data[key]);
                break;
            case _.TYPES.OBJECT:
                packObjectForSignature(data[key] as Record<string, unknown>, key).forEach((element) => {
                    result.push(element);
                });
                break;
        }
    });

    return result;
};
