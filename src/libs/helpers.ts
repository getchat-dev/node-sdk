export type PathSegments = string | readonly string[];

export const TYPES = Object.freeze({
    SCALAR: 1,
    EMPTY: 2,
    ARRAY: 3,
    OBJECT: 4,
    UNKNOWN: 5,
} as const);

export type TypeValue = (typeof TYPES)[keyof typeof TYPES];

export const isNoValue = (value: unknown): value is null | undefined => value === undefined || value === null;

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isNumeric = (value: unknown): value is number => typeof value === 'number';

export const isBoolean = (value: unknown, smart = false): boolean =>
    typeof value === 'boolean' ||
    (smart && ['yes', 'on', 'true', '1', 'no', 'off', 'false', '0'].indexOf(String(value).toLowerCase()) > -1);

export const isTRUE = (value: unknown): boolean =>
    value === true || ['yes', 'on', 'true', '1'].indexOf(String(value).toLowerCase()) > -1;

export const isScalar = (value: unknown): boolean => ['object', 'undefined'].indexOf(typeof value) === -1;

export const isFunction = (value: unknown): value is (...args: unknown[]) => unknown => typeof value === 'function';

export const isArray = Array.isArray;

export const isFilledArray = (value: unknown): value is unknown[] => isArray(value) && value.length > 0;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Object.prototype.toString.call(value) === '[object Object]';

export const isFilledPlainObject = (value: unknown): value is Record<string, unknown> =>
    isPlainObject(value) && Object.keys(value).length > 0;

export const getType = (value: unknown): TypeValue => {
    if (isScalar(value)) return TYPES.SCALAR;
    if (isNoValue(value)) return TYPES.EMPTY;
    if (isArray(value)) return TYPES.ARRAY;
    if (isPlainObject(value)) return TYPES.OBJECT;
    return TYPES.UNKNOWN;
};

const resolvePath = (path: unknown): readonly string[] => {
    if (isString(path)) return path.split('.');
    if (isFilledArray(path)) return path as readonly string[];
    return [];
};

export const isExists = (object: unknown, path?: PathSegments | null): boolean => {
    const parts = resolvePath(path);
    let cursor: unknown = object;

    for (const part of parts) {
        if (isScalar(cursor) || cursor == null) return false;
        const next = (cursor as Record<string, unknown>)[part];
        if (typeof next === 'undefined') return false;
        cursor = next;
    }

    return true;
};

export const getValue = (object: unknown, path?: PathSegments | null, defValue?: unknown): unknown => {
    const parts = resolvePath(path);
    let cursor: unknown = object;

    for (const part of parts) {
        if (isScalar(cursor) || isNoValue(cursor)) return defValue;
        const next = (cursor as Record<string, unknown>)[part];
        if (typeof next === 'undefined') return defValue;
        cursor = next;
    }

    return cursor;
};

export const onlyProps = (object: unknown, onlyList: readonly string[]): Record<string, unknown> | null => {
    if (!(isFilledPlainObject(object) && isFilledArray(onlyList))) return null;

    const result: Record<string, unknown> = {};
    Object.keys(object).forEach((prop) => {
        if (onlyList.indexOf(prop) > -1) {
            result[prop] = (object as Record<string, unknown>)[prop];
        }
    });
    return result;
};

export const randomString = (len = 10): string => {
    let text = '';
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < len; i++) {
        text += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return text;
};

export const sort = (keys: string[]): string[] =>
    keys.sort((a, b) => {
        const aNum = Number(a);
        const bNum = Number(b);
        const aIsNum = !Number.isNaN(aNum) && a.trim() !== '';
        const bIsNum = !Number.isNaN(bNum) && b.trim() !== '';

        if (aIsNum && bIsNum) return aNum - bNum;
        if (aIsNum && !bIsNum) return -1;
        if (!aIsNum && bIsNum) return 1;
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    });
