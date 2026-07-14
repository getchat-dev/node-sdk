# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Public npm package `@emby-chat/node-sdk` — server-side TypeScript SDK for [GetChat](https://getchat.dev) (the product was originally called "Emby"; the class and env vars still use that name). Two responsibilities:

1. Generate signed chat URLs for embedding the chat UI in an iframe / WebView.
2. Wrap the GetChat REST API using Bearer `api_token` auth — both hand-written high-level methods (`sendMessage`, `getChats`, etc.) **which now delegate through** `.api.*` (auto-generated, one per `operationId` in `openapi.yml`).

Anything edited under `src/` is public surface area — version is bumped in `package.json` and published to npm. The package publishes **dual CJS + ESM** from `dist/`; `src/` is TypeScript and not shipped.

## Commands

- `npm test` — runs node's built-in test runner on TS sources via `tsx` (318 tests: 5 unit + 16 integration files). No compilation, tests import from `src/` directly.
- `npm run test:live` — opt-in E2E against a real tenant (needs `.env` with `EMBY_API_TOKEN` + `EMBY_BASE_URL`; 50 tests across happy-path / wire-format regressions / edge cases). Suites skip themselves if creds missing. Runs serially via `--test-concurrency=1` because each `before/after` calls `tenant.clearData({ sync: true })` and parallel suites would race-wipe each other. **Never point at production.** See `test/live/README.md`.
- `npm run typecheck` — `tsc --noEmit` across src + test.
- `npm run build` — cleans `dist/`, compiles `tsconfig.cjs.json` → `dist/cjs`, `tsconfig.esm.json` → `dist/esm`, then writes `{"type":"commonjs"}` / `{"type":"module"}` stub `package.json` inside each subdir so Node resolves module kind correctly.
- `npm run coverage:ci` — runs tests with `--experimental-test-coverage` and gates at 90% (see `scripts/coverage-gate.js`; threshold is 90%, not 100%, because TS emit introduces unavoidable compiler-prelude "uncovered" lines).
- `npm run generate` — regenerates `src/generated/{schemas,operations}.ts` from `openapi.yml`, then Biome-formats them (the script chains `&& biome format --write src/generated` — the raw codegen emits double-quoted keys that Biome normalizes to the project's single-quote style; scoped to `src/generated` so it never touches unrelated WIP files). Commit the output.
- `npm run check` / `check:fix` — Biome lint+format.

Smoke-verifying a change without a real backend: run the relevant test file (`node --test --import tsx 'test/integration/<name>.test.ts'`) or start the mock server via `test/helpers/mockServer.ts`.

`.env` (copy from `.env.example`): `EMBY_ID`, `EMBY_SECRET`, `EMBY_API_TOKEN`, `EMBY_BASE_URL`. Add `NODE_TLS_REJECT_UNAUTHORIZED=0` if your dev backend uses a self-signed cert.

## Dependency policy

**Runtime deps are minimal.** Only `zod` is allowed in `dependencies` — it powers Zod-validated inputs on the auto-generated `.api.*` methods (and therefore on every hand-written wrapper that delegates into them). Rationale: the SDK is server-side, so bundle size is not a consumer concern, and validation at the SDK boundary pays for its weight. Do **not** add other runtime deps without explicit discussion — the preference for a lean dep tree still stands (no axios/lodash/node-fetch/etc.; Node built-ins like `crypto`, `http`, `https`, `url`, `querystring` cover the HTTP/signing path). `devDependencies` (biome, tsx, typescript, js-yaml, faker, etc.) are unconstrained — they never ship.

## Layout

```
src/
├── index.ts              — Emby class (public API)
├── types.ts              — hand-written TS types (public surface)
├── libs/                 — internal helpers (imported as `_`)
│   ├── helpers.ts
│   ├── signing.ts
│   ├── processUserRights.ts
│   ├── rights.scheme.ts
│   ├── requestOptions.ts — options schema/resolver, TimeoutError, RequestControlOptions
│   └── retry.ts          — retry policy (idempotency, backoff, Retry-After), abortable sleep
└── generated/            — regenerated from openapi.yml via `npm run generate`
    ├── schemas.ts        — Zod schemas + z.infer types for components.schemas
    └── operations.ts     — createOperations(transport) factory, one fn per operationId

test/
├── helpers/              — mockServer, sdkFactory, loadFixture, seededRandom
├── unit/*.test.ts        — helpers, signing, processUserRights
├── integration/*.test.ts — per-method tests against in-process mock server
├── types/*.test-d.ts     — compile-time type assertions, enforced by `npm run typecheck`,
│                           NOT run by `node --test`. `response-types` pins the response-type
│                           defaults (all 30 ops + wrappers); `input-types` freezes the public
│                           wrapper signatures and the `.api.*` input contract (+ `<T>` override,
│                           `Avatar` oneOf, `requestApi` staying `unknown`)
├── fixtures/             — JSON response fixtures
└── live/                 — opt-in E2E against real backend (happy-path, wire-format, edge-cases)

scripts/
├── generate.ts           — OpenAPI → TS codegen (js-yaml; devDep only)
└── coverage-gate.js      — LCOV threshold gate (plain JS)

dist/cjs/, dist/esm/      — build output (gitignored)
```

## Architecture

The `Emby` class in `src/index.ts` is the public API. It composes three concerns: URL signing (hand-written, `url()` + `urlByChatId()`), a transport layer (`requestApi`, hand-written), and a bag of auto-generated operation methods exposed under `sdk.api.*`. Every hand-written high-level method is a **thin adapter** that coerces lenient legacy inputs into spec-strict types and then calls into the matching `.api.*` method — so there is one transport path and Zod validates every request. Types for consumers live in `src/types.ts` (not auto-generated to preserve public type stability).

### Two URL builders, two different signature schemes

`url()` and `urlByChatId()` look almost identical but **sign differently** — do not unify them without coordinating with the GetChat backend, which validates each scheme separately:

- `url()` — HMAC-SHA256 keyed by `clientSecret`. Signature input begins with `[clientId, nonce, ...]` and includes user `rights` in the canonical fields list.
- `urlByChatId()` — MD5 of `[clientSecret, nonce, ...]` joined by `,`. Does **not** include `rights` in the signature input. Older scheme; kept for backward compatibility.

Both run user/chat/participant payloads through `normalizeData()` (whitelist + per-field `process`/`default`), then feed the resulting fields to `addToSignature()` in a **fixed canonical order** (the `filterKeys` array passed to `addToSignature`). When a value is a plain object, `packObjectForSignature()` flattens it to `key.subkey=value` strings sorted by `_.sort()` (numeric-first, then byte-wise string compare). Changing field order, the sort comparator, or the flattening format will break signature verification on the backend.

The query string itself is built with `flatten()` (PHP-style: `user[id]=10`, `user[rights][send_messages]=1`) → `querystring.stringify`. `flatten()` and `addToSignature()` use different conventions and are **not** interchangeable.

### REST client

`requestApi(method, params, type='get', version='v1', query?, headers?, control?)` is the single HTTP entry point — uses Node's built-in `http`/`https`, no third-party client.

- For **GET / DELETE**: `params` is serialized via `flatten()` + `querystring.stringify` into the URL. Optional `query` is merged on top — handy when a generated wrapper has both path params and URL query.
- For **POST / PUT**: `params` becomes the JSON body. Optional `query` is appended as URL query string (needed e.g. for `tenant.clearData?sync=true`).

All requests carry `Authorization: Bearer ${apiToken}`. Non-2xx/3xx responses reject with an `Error & { status: number; body: unknown }` — `message` is the stringified body (or raw text), `body` is the parsed JSON when available.

**Reliability** (1.15) — each attempt runs under a timeout and failures are retried per the method's idempotency. Defaults live on the instance (`config.options`, Zod-validated by `resolveRequestOptions` in `libs/requestOptions.ts`) and are overridable per call via the 7th `control` arg:

- **timeout** (default 30000ms; 0 disables) — a per-attempt `AbortController` + `setTimeout` (Node 16 has no `AbortSignal.timeout`); on expiry rejects `TimeoutError`. Because `TimeoutError.code === 'ETIMEDOUT'`, `shouldRetry` treats it as a transport error: a timed-out GET/DELETE is retried, a timed-out POST/PUT is not — so total wall-clock for a hung read can reach ~`(retries+1) × timeout` (+ backoff).
- **retries** (default 2) + **retryDelay** (200ms base) — `runWithRetry` loops attempts; `shouldRetry` (`libs/retry.ts`) allows GET/DELETE on network/5xx/429 but POST/PUT only on 429 + pre-send connection errors (so a write is never duplicated). Exponential backoff + jitter, honoring `Retry-After`.
- **signal** (per-call only) — merged with the timeout into one controller; a caller cancel rejects with `signal.reason`/`AbortError`, is never retried, and aborts an in-progress backoff (`sleep` is abortable).

The per-call fields (`signal`/`timeout`/`retries`/`retryDelay`) ride every `.api.*` input via `RequestControlOptions`; `pickRequestControl` pulls them out and `resolveControlOverrides` validates the numeric ones against the same bounds as the instance options (so a per-call `retries: 15` throws too, not only an instance one) before the Zod parse strips them from the wire payload.

`baseUrl` has trailing slashes stripped in the constructor (`replace(/\/+$/g, '')`); `apiUrl` defaults to `baseUrl` if not provided separately.

### Hand-written high-level methods (public API surface, delegating wrappers)

`getChats`, `getChatInfo`, `getMessagesFromChat`, `sendMessage`, `updateMessage`, `deleteMessage`, `sendTyping`, `addParticipantsToChat`, plus the chat/user CRUD wrappers (`createChat`, `updateChat`, `deleteChat`, `getChatParticipants`, `removeParticipantFromChat`, `createUser`, `getUser`, `updateUser`, `deleteUser`, `getUserChats`) — historically each contained business logic beyond plain OpenAPI passthrough. **As of 1.13 they all delegate into `.api.*`** through small adapter logic that:

- coerces lenient inputs (`with_owners: 'yes' | true | 1` → spec `0|1` integer; `isDeleted/isEdited/withUsers` smart-bool → integer; `withUsers` legacy field name accepted alongside spec `with_users`);
- normalizes chat/participant payloads (`normalizeChat`, `normalizeParticipant`);
- clamps pagination (`Math.max(page,1)`, `Math.min(limit,1000)`);
- splits chat id out of `sendMessage`/`updateMessage`/`deleteMessage` arguments into the `path` slot;
- preserves the original error messages (`"chat id isn't passed"`, `"message text is required"`, etc.) so callers' regex matches keep working.

The public signatures in `src/index.ts` are stable consumer API and **must not be changed** without a version bump. The wire format they produce is now spec-aligned (e.g. `is_deleted: true` boolean, was `'1'` string before 1.13; `with_users=1` snake_case wire, was buggy `withUsers=1` before — backend silently ignored it). Backend is lenient and accepts both forms in most places, but wherever live tests revealed a divergence, the spec was patched and the adapter brought into line.

Each wrapper defaults its return generic to the matching operation's `XResponse` type (e.g. `getChatInfo<T = ChatShowResponse>`), so callers get a typed response without passing `<T>`; an explicit `<T>` still overrides. `requestApi` itself stays `<T = unknown>` (it's the raw transport).

If you add a new high-level method, the same pattern applies: a thin coercing wrapper around `this.api.<operationId>(...)`, defaulting `T` to the operation's `XResponse`. Don't reach for `requestApi` directly unless you have a reason the spec can't express.

### Auto-generated `.api.*` methods

`scripts/generate.ts` (~350 LOC) parses `openapi.yml` (via `js-yaml`, devDep) and emits:

- `src/generated/schemas.ts` — one `XSchema` + `type X = z.infer<typeof XSchema>` per `components.schemas.X`. Topologically sorted so `$ref` chains resolve. Components currently shipped: `User`, `UserResource`, `ParticipantResource`, `ParticipantInput`, `ChatResource`, `MessageResource`, `Avatar` (URL-string OR `{kind, color, initials}` placeholder via `oneOf`), `Button` (shared by sendMessage/updateMessage).
- `src/generated/operations.ts` — `createOperations(transport) → { chatList, chatCreate, chatShow, … }`, **30 methods** (29 chat/user/tenant + `tenantClearData`). Each parses its input with Zod, fills path params into the URL template, and dispatches through `transport.requestApi`.

Input shape follows the `openapi-fetch` convention:

```ts
sdk.api.chatSendMessage({
    path: { chat_id: 'c1' },
    body: {
        user: { id: 'u1', name: 'Author' }, // required (top-level, NOT chat.owner)
        messages: [{ text: 'hi' }],
    },
});
```

Header params (e.g. `Prefer`) ride a `header:` slot alongside `path`/`query`/`body`. Per-call reliability controls (`signal`/`timeout`/`retries`/`retryDelay`) also ride the input object (typed via `RequestControlOptions`); `pickRequestControl` extracts them and they're stripped from the wire payload. See **REST client → Reliability**.

Each method is typed `async <T = XResponse>(...): Promise<T>` — the default `T` is a generated `XResponse` type derived from the operation's `200`/`201` JSON schema (e.g. `ChatListResponse`), so callers get a typed envelope (`{ status, data, pagination, … }`) without passing `<T>`. Responses are **not** Zod-validated at runtime (the SDK is pass-through); `XResponse` is a plain TS type emitted by `emitType`, not a schema. Pass an explicit `<T>` to override.

`Emby` wires it up in its constructor: `this.api = createOperations(this)`. `this` satisfies the `Transport` interface (a 7-arg `requestApi(method, params, type, version, query, headers, control)`).

**Generator quirks worth knowing:**

- Zod 4's `z.enum` only accepts string literals, so non-string enums (e.g. `[0, 1]`) emit `z.union([z.literal(0), z.literal(1)])`.
- Zod 4 has no built-in `min`/`maxProperties`, so OpenAPI `minProperties: N` / `maxProperties: N` become `.refine((v) => Object.keys(v).length >= N, ...)` / `<= N`.
- `oneOf` / `anyOf` → `z.union([...])`. `Avatar` and other discriminated-ish unions ride this path; we don't model strictness, the first matching branch wins.
- `allOf` → intersection: a single-member `allOf` (the `$ref` + description pattern) collapses to that member; multiple members nest via `z.intersection`.
- Path-param substitution **does not** call `encodeURIComponent` — `requestApi` runs `encodeURI()` on the full URL, and double-encoding would produce `%252F` instead of `%2F`. This matches the behavior of the hand-written methods.
- For `PUT`/`POST` operations that also have URL query params, the generator passes the parsed `query` as the 5th arg to `requestApi`; header params (`in: header`) as the 6th; per-call control options (`pickRequestControl(input)`) always as the 7th.

### `openapi.yml` and the live-test feedback loop

The spec is treated as authoritative documentation of the **real backend wire format**, not a wish list. Several places where it disagreed with the backend were uncovered by `test/live/wire-format.test.ts` and patched in-spec (not in code). Settled findings:

- `with_owners` / `with_users` / `isDeleted` / `isEdited` query params: backend wants integer `0` / `1` wire (not boolean). Spec is now `type: integer, enum: [0, 1]`.
- `with_users` is the **spec-correct** parameter name (snake_case). Hand-written code used to send `withUsers=1` which the backend silently ignored.
- `chat.sendMessage` body: backend wants `user` at top-level (required) plus optional `chat`/`participants`/`messages`. The pre-1.13 spec said `chat.owner`, which was wrong; corrected.
- `chat.sendTyping` endpoint: spec was correct (`PUT /chats/{id}/typing/{user_id}`, no body). The hand-written `sendTyping` used to send `PUT /chats/{id}/typing` with `{user}` body — silently no-op'd. Fixed in 1.13 to delegate; this is the one **breaking change** the unification introduced.
- `tenant.clearData` `sync` param was declared `in: path` (spec bug); patched to `in: query`.
- `chat.create` for `type: private` requires `participants` (empirical; not enforced in spec).
- `chatDeleteParticipants` returns `200` but does not actually remove the user (backend quirk; documented as `t.diagnostic` in live tests rather than failed assertion).

When you change `openapi.yml`, run `npm run generate` then `npm test` then `npm run test:live` (if you have creds) — the latter re-validates against the real backend and catches drift.

### Input normalization conventions

`src/libs/helpers.ts` (imported as `_`) is the type-checking vocabulary used everywhere: `_.isPlainObject`, `_.isFilledArray`, `_.isFilledPlainObject`, `_.isString`, `_.isNumeric`, `_.isBoolean(value, smart=true)` (accepts `'on'`/`'yes'`/`'1'` etc.), `_.isTRUE`, `_.isNoValue`, `_.getValue(obj, path, def)`, `_.onlyProps`, `_.sort`, `_.getType` + `_.TYPES`. Prefer these over inline `typeof` checks.

`src/libs/processUserRights.ts` + `src/libs/rights.scheme.ts` validate the `user.rights` map. Boolean rights are coerced to `'1'`/`'0'` strings (this stays string for URL-signature compatibility); enum rights (`edit_messages`, `delete_messages`, `pin_messages`) only pass through if the first colon-separated segment matches the schema (e.g. `'my:extra'` → `'my'` is the validated part, the full string is preserved). Adding a new right requires updating `rights.scheme.ts` (no more `.json` — the schema is a typed `const satisfies` object).

## Workflows

### Adding a new API method

1. Edit `openapi.yml` — add the path + operation with a unique `operationId` (e.g. `chat.archive` → `chatArchive`).
2. `npm run generate` — regenerates `src/generated/*` (and Biome-formats them; the script chains `biome format --write src/generated`).
3. `npm test` — ensure existing tests still pass; the new method appears as `sdk.api.chatArchive(...)` with full types.
4. Optionally add an integration test under `test/integration/generated-api.test.ts`. If you want a lenient public signature on the `Emby` class, add a thin coercing wrapper that delegates to `this.api.chatArchive(...)`.
5. If you have live creds, also run `npm run test:live` to confirm the backend really accepts what the spec says.
6. Commit `openapi.yml` + `src/generated/*.ts` together.

### Changing runtime behavior

Edit `src/index.ts` or `src/libs/*.ts`. Run `npm test` — must stay green. `npm run build` must succeed. For a release, bump version in `package.json`; `prepublishOnly` runs the build.

### Patching the spec against backend reality

If a live test reveals openapi.yml diverges from what the backend actually accepts:

1. Update `openapi.yml` (the spec follows the backend, not the other way around).
2. `npm run generate`.
3. If a hand-written wrapper carried compensating coercion, simplify it now that the generator does the right thing.
4. `npm test` + `npm run test:live` — both must stay green.

## Conventions

- TypeScript only. Source in `src/`, tests in `test/` (also TS). No new `.js` files under `src/`.
- Public-surface changes (anything in `src/index.ts` exported, `src/types.ts`, or `.api.*` shape via `openapi.yml`) require a version bump.
- Dual publish: `dist/cjs/` is the `main`, `dist/esm/` is the `import` target. The `exports` map must list `types` first in each condition block — otherwise TS consumers can resolve `.js` before `.d.ts` and lose types.
- Internal relative imports use `.js` extensions (e.g. `import * as _ from './libs/helpers.js'`) because Node ESM requires them; TS resolves them to `.ts` at build time.
- JSDoc on public methods is still expected alongside the TS types — it appears in IDE hovers and complements `README.md`.
- README examples and method signatures must stay in sync.

## Working style

- **Answers, explanations, and commit/PR descriptions: short and plain.** Say the point in everyday words — no officialese, no jargon that isn't earning its place. A sentence usually beats a dense term or a big table.
- **Commit messages: Conventional Commits, terse.** No `Co-Authored-By` or authorship trailer. Add a body only when the subject line genuinely can't carry the point; when you do, write it for the person *using* the SDK — what changes for them — not a list of files or internals.
