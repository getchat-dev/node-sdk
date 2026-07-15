#!/usr/bin/env tsx
/**
 * Generator: reads openapi.yml and emits
 *   src/generated/schemas.ts    — Zod schemas + TS types for every components.schemas entry
 *   src/generated/operations.ts — createOperations(transport) factory with typed methods per operationId
 *
 * Run via `npm run generate`. Commit the output.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const OPENAPI_PATH = path.join(ROOT, 'openapi.yml');
const OUT_DIR = path.join(ROOT, 'src', 'generated');

// ────────────────────────────────────────────────────────────────────────────
// Types (loose — openapi.yml spec)
// ────────────────────────────────────────────────────────────────────────────
type Ref = { $ref: string };
// biome-ignore lint/suspicious/noExplicitAny: OpenAPI schemas are recursive / heterogeneous
type Schema = any;

interface Parameter {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    required?: boolean;
    description?: string;
    schema: Schema;
    style?: string;
}

interface Operation {
    operationId?: string;
    summary?: string;
    parameters?: (Parameter | Ref)[];
    requestBody?: { required?: boolean; content: Record<string, { schema: Schema }> };
    responses: Record<string, { description: string; content?: Record<string, { schema: Schema }> }>;
}

interface PathItem {
    parameters?: (Parameter | Ref)[];
    get?: Operation;
    post?: Operation;
    put?: Operation;
    delete?: Operation;
}

interface Spec {
    paths: Record<string, PathItem>;
    components?: {
        schemas?: Record<string, Schema>;
        parameters?: Record<string, Parameter>;
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Load spec
// ────────────────────────────────────────────────────────────────────────────
const spec = yaml.load(fs.readFileSync(OPENAPI_PATH, 'utf8')) as Spec;

// ────────────────────────────────────────────────────────────────────────────
// $ref resolution
// ────────────────────────────────────────────────────────────────────────────
function resolveRef<T>(ref: string): T {
    const parts = ref.replace(/^#\//, '').split('/');
    // biome-ignore lint/suspicious/noExplicitAny: traversal over arbitrary spec shape
    let cur: any = spec;
    for (const p of parts) cur = cur[p];
    return cur as T;
}

function derefParam(p: Parameter | Ref): Parameter {
    if ('$ref' in p) return derefParam(resolveRef<Parameter | Ref>(p.$ref));
    return p;
}

// Schema refs — return the ref name (don't inline; we emit Zod constants by name).
function schemaRefName(s: Schema): string | null {
    if (
        typeof s === 'object' &&
        s !== null &&
        typeof s.$ref === 'string' &&
        s.$ref.startsWith('#/components/schemas/')
    ) {
        return s.$ref.split('/').pop() as string;
    }
    return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Zod emitter
// ────────────────────────────────────────────────────────────────────────────
function indent(n: number): string {
    return '    '.repeat(n);
}

function emitZod(schema: Schema, depth = 0): string {
    const ref = schemaRefName(schema);
    if (ref) return `${ref}Schema`;

    if (!schema || typeof schema !== 'object') return 'z.unknown()';

    // oneOf / anyOf — Zod union. (We don't model `oneOf` strictness vs `anyOf` overlap;
    // Zod's `union` matches the first successful branch, which is fine for our shapes.)
    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
        return `z.union([${schema.oneOf.map((s: Schema) => emitZod(s, depth)).join(', ')}])`;
    }
    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
        return `z.union([${schema.anyOf.map((s: Schema) => emitZod(s, depth)).join(', ')}])`;
    }

    // allOf — intersection. A single-member allOf (the common "$ref + description"
    // pattern used to attach docs to a reference) collapses to that member; multiple
    // members nest via z.intersection.
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        const members = schema.allOf.map((s: Schema) => emitZod(s, depth));
        return members.length === 1
            ? members[0]
            : members.reduce((a: string, b: string) => `z.intersection(${a}, ${b})`);
    }

    if (Array.isArray(schema.enum)) {
        // z.enum() requires string literals; non-string enums become a literal union.
        const allStrings = schema.enum.every((e: unknown) => typeof e === 'string');
        if (allStrings) {
            return `z.enum([${schema.enum.map((e: string) => JSON.stringify(e)).join(', ')}])`;
        }
        return `z.union([${schema.enum.map((e: unknown) => `z.literal(${JSON.stringify(e)})`).join(', ')}])`;
    }

    if (schema.type === 'string') {
        let out: string;
        if (schema.format === 'email') out = 'z.email()';
        else if (schema.format === 'uri') out = 'z.url()';
        else if (schema.format === 'date-time') out = 'z.iso.datetime({ offset: true })';
        else out = 'z.string()';
        if (typeof schema.maxLength === 'number') out += `.max(${schema.maxLength})`;
        if (typeof schema.minLength === 'number') out += `.min(${schema.minLength})`;
        return out;
    }

    if (schema.type === 'integer') {
        let out = 'z.number().int()';
        if (typeof schema.minimum === 'number') out += `.min(${schema.minimum})`;
        if (typeof schema.maximum === 'number') out += `.max(${schema.maximum})`;
        return out;
    }

    if (schema.type === 'number') {
        let out = 'z.number()';
        if (typeof schema.minimum === 'number') out += `.min(${schema.minimum})`;
        if (typeof schema.maximum === 'number') out += `.max(${schema.maximum})`;
        return out;
    }

    if (schema.type === 'boolean') return 'z.boolean()';

    if (schema.type === 'array') {
        let out = `z.array(${emitZod(schema.items, depth)})`;
        if (typeof schema.maxItems === 'number') out += `.max(${schema.maxItems})`;
        if (typeof schema.minItems === 'number') out += `.min(${schema.minItems})`;
        return out;
    }

    const hasProps = schema.properties && Object.keys(schema.properties).length > 0;

    // OpenAPI min/maxProperties → Zod refinements (Zod 4 has no built-in for these)
    const withPropCount = (expr: string): string => {
        let out = expr;
        if (typeof schema.minProperties === 'number') {
            const min = schema.minProperties;
            const noun = min === 1 ? 'property' : 'properties';
            out += `.refine((v) => Object.keys(v as object).length >= ${min}, { message: 'at least ${min} ${noun} required' })`;
        }
        if (typeof schema.maxProperties === 'number') {
            const max = schema.maxProperties;
            out += `.refine((v) => Object.keys(v as object).length <= ${max}, { message: 'maximum ${max} properties allowed' })`;
        }
        return out;
    };

    // Pure record (no defined properties, only additionalProperties)
    if (!hasProps && schema.additionalProperties) {
        const valueSchema =
            schema.additionalProperties === true ? 'z.unknown()' : emitZod(schema.additionalProperties, depth);
        return withPropCount(`z.record(z.string(), ${valueSchema})`);
    }

    if (schema.type === 'object' || hasProps) {
        const required = new Set<string>(schema.required ?? []);
        const pad = indent(depth + 1);
        const entries: string[] = [];
        for (const [name, sub] of Object.entries(schema.properties ?? {})) {
            let expr = emitZod(sub, depth + 1);
            if ((sub as Schema).nullable) expr += '.nullable()';
            if (!required.has(name)) expr += '.optional()';
            entries.push(`${pad}${JSON.stringify(name)}: ${expr}`);
        }
        let obj = `z.object({\n${entries.join(',\n')}\n${indent(depth)}})`;
        if (schema.additionalProperties) {
            const valueSchema =
                schema.additionalProperties === true ? 'z.unknown()' : emitZod(schema.additionalProperties, depth);
            obj += `.catchall(${valueSchema})`;
        }
        return withPropCount(obj);
    }

    return 'z.unknown()';
}

// ────────────────────────────────────────────────────────────────────────────
// TS type emitter — for response shapes. Responses are pass-through (never
// Zod-parsed at runtime), so we emit plain TS types, not schemas. Component
// `$ref`s resolve to `S.<Name>` (operations.ts imports schemas.ts as `S`).
// ────────────────────────────────────────────────────────────────────────────
function emitType(schema: Schema): string {
    const ref = schemaRefName(schema);
    if (ref) return `S.${ref}`;

    if (!schema || typeof schema !== 'object') return 'unknown';

    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
        return schema.oneOf.map((s: Schema) => emitType(s)).join(' | ');
    }
    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
        return schema.anyOf.map((s: Schema) => emitType(s)).join(' | ');
    }
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        return schema.allOf.map((s: Schema) => emitType(s)).join(' & ');
    }
    if (Array.isArray(schema.enum)) {
        return schema.enum.map((e: unknown) => JSON.stringify(e)).join(' | ');
    }
    if (schema.type === 'string') return 'string';
    if (schema.type === 'integer' || schema.type === 'number') return 'number';
    if (schema.type === 'boolean') return 'boolean';
    if (schema.type === 'array') return `Array<${emitType(schema.items)}>`;

    const hasProps = schema.properties && Object.keys(schema.properties).length > 0;

    if (!hasProps && schema.additionalProperties) {
        const value = schema.additionalProperties === true ? 'unknown' : emitType(schema.additionalProperties);
        return `Record<string, ${value}>`;
    }

    if (schema.type === 'object' || hasProps) {
        const required = new Set<string>(schema.required ?? []);
        const props = Object.entries(schema.properties ?? {}).map(([name, sub]) => {
            let t = emitType(sub as Schema);
            if ((sub as Schema).nullable) t += ' | null';
            return `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${t}`;
        });
        let out = `{ ${props.join('; ')} }`;
        if (schema.additionalProperties) {
            const value = schema.additionalProperties === true ? 'unknown' : emitType(schema.additionalProperties);
            out += ` & Record<string, ${value}>`;
        }
        return out;
    }

    return 'unknown';
}

// ────────────────────────────────────────────────────────────────────────────
// Topological sort of component schemas (schemas reference each other by name)
// ────────────────────────────────────────────────────────────────────────────
function collectSchemaRefs(schema: Schema): Set<string> {
    const refs = new Set<string>();
    function walk(v: unknown) {
        if (!v || typeof v !== 'object') return;
        const o = v as Schema;
        if (typeof o.$ref === 'string' && o.$ref.startsWith('#/components/schemas/')) {
            refs.add(o.$ref.split('/').pop() as string);
            return; // refs don't need deep walk
        }
        for (const val of Object.values(o)) walk(val);
    }
    walk(schema);
    return refs;
}

function topoSort(schemas: Record<string, Schema>): string[] {
    const deps = new Map<string, Set<string>>();
    for (const [name, def] of Object.entries(schemas)) {
        deps.set(name, collectSchemaRefs(def));
    }
    const ordered: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    function visit(name: string) {
        if (visited.has(name)) return;
        if (visiting.has(name)) return; // cycle — z.lazy would handle, but we don't have cycles
        visiting.add(name);
        for (const dep of deps.get(name) ?? []) {
            if (schemas[dep]) visit(dep);
        }
        visiting.delete(name);
        visited.add(name);
        ordered.push(name);
    }
    for (const name of Object.keys(schemas)) visit(name);
    return ordered;
}

// ────────────────────────────────────────────────────────────────────────────
// Emit schemas.ts
// ────────────────────────────────────────────────────────────────────────────
function emitSchemasFile(): string {
    const schemas = spec.components?.schemas ?? {};
    const ordered = topoSort(schemas);

    const parts: string[] = [];
    parts.push('// Generated from openapi.yml — do not edit manually.');
    parts.push('// Regenerate with `npm run generate`.');
    parts.push('');
    parts.push("import { z } from 'zod';");
    parts.push('');

    for (const name of ordered) {
        const def = schemas[name];
        parts.push(`export const ${name}Schema = ${emitZod(def, 0)};`);
        parts.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
        parts.push('');
    }

    return parts.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Collect operations (merge path-level + op-level parameters, deref)
// ────────────────────────────────────────────────────────────────────────────
interface CollectedOp {
    name: string; // camelCase method name
    typeName: string; // PascalCase for type names
    method: 'get' | 'post' | 'put' | 'delete';
    pathTemplate: string; // without leading slash, e.g. "chats/{chat_id}/messages"
    summary?: string;
    pathParams: Parameter[];
    queryParams: Parameter[];
    headerParams: Parameter[];
    bodySchema: Schema | undefined;
    responseSchema: Schema | undefined;
    requestBodyRequired: boolean;
}

function camelCase(operationId: string): string {
    return operationId.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase());
}

function pascalCase(methodName: string): string {
    return methodName[0].toUpperCase() + methodName.slice(1);
}

function collectOperations(): CollectedOp[] {
    const ops: CollectedOp[] = [];
    for (const [pathTemplate, pathItem] of Object.entries(spec.paths)) {
        const pathLevelParams = (pathItem.parameters ?? []).map(derefParam);
        for (const method of ['get', 'post', 'put', 'delete'] as const) {
            const op = pathItem[method];
            if (!op?.operationId) continue;
            const allParams = [...pathLevelParams, ...(op.parameters ?? []).map(derefParam)];
            const pathParams = allParams.filter((p) => p.in === 'path');
            const queryParams = allParams.filter((p) => p.in === 'query');
            const headerParams = allParams.filter((p) => p.in === 'header');
            const bodySchema = op.requestBody?.content?.['application/json']?.schema;
            const responseSchema =
                op.responses['200']?.content?.['application/json']?.schema ??
                op.responses['201']?.content?.['application/json']?.schema;

            const name = camelCase(op.operationId);
            ops.push({
                name,
                typeName: pascalCase(name),
                method,
                pathTemplate: pathTemplate.replace(/^\//, ''),
                summary: op.summary,
                pathParams,
                queryParams,
                headerParams,
                bodySchema,
                responseSchema,
                requestBodyRequired: op.requestBody?.required === true,
            });
        }
    }
    return ops;
}

// ────────────────────────────────────────────────────────────────────────────
// Emit operations.ts
// ────────────────────────────────────────────────────────────────────────────
function emitOperationsFile(operations: CollectedOp[]): string {
    const parts: string[] = [];
    parts.push('// Generated from openapi.yml — do not edit manually.');
    parts.push('// Regenerate with `npm run generate`.');
    parts.push('');
    parts.push("import { z } from 'zod';");
    parts.push("import { pickRequestControl, type RequestControlOptions } from '../libs/requestOptions.js';");
    parts.push("import * as S from './schemas.js';");
    parts.push('');

    // Transport interface
    parts.push("export type HttpMethod = 'get' | 'post' | 'put' | 'delete';");
    parts.push('');
    parts.push('export interface Transport {');
    parts.push('    requestApi<T = unknown>(');
    parts.push('        method: string,');
    parts.push('        params?: Record<string, unknown>,');
    parts.push('        type?: HttpMethod,');
    parts.push('        version?: string,');
    parts.push('        query?: Record<string, unknown>,');
    parts.push('        headers?: Record<string, unknown>,');
    parts.push('        control?: RequestControlOptions,');
    parts.push('    ): Promise<T>;');
    parts.push('}');
    parts.push('');

    // Emit input schemas per operation. emitZod returns bare `UserSchema` refs;
    // we prefix them to `S.UserSchema` exactly once at the end via a negative-lookbehind regex.
    for (const op of operations) {
        const partsInput: string[] = [];
        if (op.pathParams.length > 0) {
            const props = op.pathParams
                .map((p) => `        ${JSON.stringify(p.name)}: ${emitZod(p.schema, 2)}`)
                .join(',\n');
            partsInput.push(`    path: z.object({\n${props}\n    })`);
        }
        if (op.queryParams.length > 0) {
            const props = op.queryParams
                .map((p) => {
                    let e = emitZod(p.schema, 2);
                    if (!p.required) e += '.optional()';
                    return `        ${JSON.stringify(p.name)}: ${e}`;
                })
                .join(',\n');
            partsInput.push(`    query: z.object({\n${props}\n    }).optional()`);
        }
        if (op.headerParams.length > 0) {
            const props = op.headerParams
                .map((p) => {
                    let e = emitZod(p.schema, 2);
                    if (!p.required) e += '.optional()';
                    return `        ${JSON.stringify(p.name)}: ${e}`;
                })
                .join(',\n');
            partsInput.push(`    header: z.object({\n${props}\n    }).optional()`);
        }
        if (op.bodySchema) {
            const bodyZod = emitZod(op.bodySchema, 1);
            const field = op.requestBodyRequired ? `    body: ${bodyZod}` : `    body: ${bodyZod}.optional()`;
            partsInput.push(field);
        }

        const hasRequiredSlot = op.pathParams.length > 0 || op.requestBodyRequired;
        let schemaExpr: string;
        if (partsInput.length === 0) {
            schemaExpr = 'z.object({}).optional()';
        } else if (hasRequiredSlot) {
            schemaExpr = `z.object({\n${partsInput.join(',\n')}\n})`;
        } else {
            schemaExpr = `z.object({\n${partsInput.join(',\n')}\n}).optional()`;
        }

        // Prefix each raw `UserSchema` with `S.` — negative lookbehind skips already-prefixed refs.
        schemaExpr = schemaExpr.replace(/(?<![\w.])([A-Z]\w*)Schema\b/g, 'S.$1Schema');

        parts.push(`const ${op.name}Input = ${schemaExpr};`);
        parts.push(`export type ${op.typeName}Input = z.infer<typeof ${op.name}Input> & RequestControlOptions;`);
        // Response type from the 200/201 JSON schema (pass-through, not validated).
        const responseType = op.responseSchema ? emitType(op.responseSchema) : 'unknown';
        parts.push(`export type ${op.typeName}Response = ${responseType};`);
        parts.push('');
    }

    // createOperations()
    parts.push('export function createOperations(transport: Transport) {');
    parts.push('    return {');
    for (const op of operations) {
        const hasRequiredSlot = op.pathParams.length > 0 || op.requestBodyRequired;
        const inputParam = hasRequiredSlot ? `input: ${op.typeName}Input` : `input?: ${op.typeName}Input`;

        parts.push('');
        if (op.summary) parts.push(`        /** ${op.summary} */`);
        parts.push(`        ${op.name}: async <T = ${op.typeName}Response>(${inputParam}): Promise<T> => {`);
        parts.push(`            const parsed = ${op.name}Input.parse(input);`);
        parts.push('            const control = pickRequestControl(input);');

        // Build URL. NOTE: we intentionally do NOT encodeURIComponent here — requestApi does
        // encodeURI() on the full URL. Matches the behavior of the hand-written methods
        // (e.g. getChatInfo uses `chats/${id}` raw).
        let urlExpr: string;
        if (op.pathParams.length > 0) {
            const filled = op.pathTemplate.replace(/\{([^}]+)\}/g, (_, name: string) => {
                // Dot access when the param name is a plain identifier (keeps Biome's useLiteralKeys happy),
                // bracket access otherwise.
                const access = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
                return `\${String((parsed as { path: Record<string, unknown> }).path${access})}`;
            });
            urlExpr = `\`${filled}\``;
        } else {
            urlExpr = JSON.stringify(op.pathTemplate);
        }
        parts.push(`            const url = ${urlExpr};`);

        // Assemble the requestApi call. parsed may be `undefined` when the whole input is
        // optional, so each slot is read behind a `{ slot?: ... } | undefined` shape-cast.
        // Arg order: (url, params, method, version, query, headers, control). For GET/DELETE
        // the query rides `params` (serialized into the URL); for POST/PUT `params` is the
        // JSON body and query/headers ride the trailing slots; `control` is always last.
        const isBodyMethod = op.method === 'post' || op.method === 'put';
        const hasBody = isBodyMethod && op.bodySchema;
        const hasQuery = op.queryParams.length > 0;
        const hasHeader = op.headerParams.length > 0;

        let paramsArg = 'undefined';
        if (hasBody) {
            parts.push(`            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;`);
            paramsArg = 'body';
        }
        let queryArg = 'undefined';
        if (hasQuery) {
            parts.push(`            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;`);
            if (isBodyMethod) queryArg = 'query';
            else paramsArg = 'query';
        }
        let headerArg = 'undefined';
        if (hasHeader) {
            parts.push(
                `            const header = (parsed as { header?: Record<string, unknown> } | undefined)?.header;`,
            );
            headerArg = 'header';
        }

        // `control` (per-call options) is always the trailing arg, so the earlier
        // slots are emitted explicitly (no trailing-undefined trimming).
        const callArgs = ['url', paramsArg, `'${op.method}'`, 'undefined', queryArg, headerArg, 'control'];
        parts.push(`            return transport.requestApi<T>(${callArgs.join(', ')});`);

        parts.push('        },');
    }
    parts.push('    };');
    parts.push('}');
    parts.push('');
    parts.push('export type Operations = ReturnType<typeof createOperations>;');
    parts.push('');

    return parts.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
function main() {
    const operations = collectOperations();
    const schemasCode = emitSchemasFile();
    const operationsCode = emitOperationsFile(operations);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'schemas.ts'), schemasCode);
    fs.writeFileSync(path.join(OUT_DIR, 'operations.ts'), operationsCode);

    const schemaCount = Object.keys(spec.components?.schemas ?? {}).length;
    console.log(`✓ emitted ${schemaCount} schemas and ${operations.length} operations`);
    console.log(`  → ${path.relative(ROOT, path.join(OUT_DIR, 'schemas.ts'))}`);
    console.log(`  → ${path.relative(ROOT, path.join(OUT_DIR, 'operations.ts'))}`);
}

main();
