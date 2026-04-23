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
            const processed = spec!.process!(source[key]);
            if (processed !== undefined) {
                result[key] = _trim(processed);
            }
        } else if (_.isNoValue(source[key])) {
            if (_.getValue(filter, [key, 'default'], undefined) !== undefined) {
                result[key] = _trim(spec!.default);
            }
        } else {
            result[key] = _trim(source[key]);
        }
    });

    return result;
};

export const normalizeChat = (chat: unknown): Record<string, unknown> =>
    normalizeData(chat, ['id', 'title', 'socket_port', 'create', 'type', 'metadata']);

export const normalizeParticipant = (participant: unknown): Record<string, unknown> =>
    normalizeData(participant, {
        id: null,
        name: null,
        email: null,
        link: null,
        picture: null,
        is_bot: { default: false },
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
