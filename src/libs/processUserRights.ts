import { type RightKey, rightsScheme } from './rights.scheme.js';

export type InputRights = Record<string, unknown>;
export type NormalizedRights = Record<string, string>;

export default function processUserRights(rights: InputRights = {}): NormalizedRights | null {
    const keys = Object.keys(rights);
    if (!keys.length) return null;

    const data: NormalizedRights = {};

    keys.forEach((key) => {
        const value = rights[key];
        const parsedValue: unknown[] = typeof value === 'string' ? value.split(':') : [value];

        const spec = rightsScheme[key as RightKey] as
            | { type: 'boolean' }
            | { type: 'enum'; values: readonly string[] }
            | undefined;

        if (!spec || !parsedValue.length) return;

        if (spec.type === 'boolean') {
            const head = String(parsedValue[0]).toLowerCase();
            data[key] = ['1', 'on', 'true', 'yes'].indexOf(head) > -1 ? '1' : '0';
        } else if (spec.type === 'enum' && spec.values.indexOf(parsedValue[0] as string) > -1) {
            data[key] = value as string;
        }
    });

    return Object.keys(data).length ? data : null;
}
