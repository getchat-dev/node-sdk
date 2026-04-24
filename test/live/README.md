# Live tests

End-to-end tests that hit a **real** GetChat backend. Purpose: empirically settle
disagreements between `openapi.yml` and the hand-written SDK methods, and verify
observable behavior (auto-join, idempotency, boundary enforcement) that mock tests
can't reach.

## ⚠️ Safety

**Never run against production.** The suites do aggressive cleanup — each `before`
and `after` calls `tenant.clearData({ sync: true })`, which wipes the tenant's
entire chat/user/message state. Use a dedicated staging/dev tenant.

## Prerequisites

1. A non-prod tenant with `tenant.clearData` enabled server-side (the operation
   can be disabled per-tenant; if it's off, the suite will fail in `before`).
2. A `.env` file in the repo root with:
   ```
   EMBY_ID=...
   EMBY_SECRET=...
   EMBY_API_TOKEN=...
   EMBY_BASE_URL=https://your-staging-host.example
   ```
3. Node 22+ (for `--env-file-if-exists`).

### Self-signed certificates (dev backends)

If your staging/dev backend uses a self-signed TLS cert you'll see
`SELF_SIGNED_CERT_IN_CHAIN`. Add this line to `.env` (local dev only, never CI):

```
NODE_TLS_REJECT_UNAUTHORIZED=0
```

`--env-file` sets it in `process.env` before Node's TLS handshake runs.

If any of `EMBY_API_TOKEN` / `EMBY_BASE_URL` is missing, the suites skip
themselves — `npm run test:live` will still exit 0 but report "tests: 0" for
live suites.

## Running

```bash
npm run test:live
```

Runs just the live suites; does not run unit/integration (those are covered by
`npm test`). To run a single file:

```bash
node --test --env-file=.env --import tsx test/live/happy-path.test.ts
```

## What's here

| File | What it exercises |
|---|---|
| `_helpers.ts` | env loading, unique IDs, `clearTenant`, skip-if-no-creds gate |
| `happy-path.test.ts` | the 10-step lifecycle: user→chats (all 4 types)→participants→messages (authored / stranger / recipient_id) →edit→delete→remove participant→user.chats |
| `wire-format.test.ts` | A/B probes for 5 openapi↔code disputes (with_owners, with_users/withUsers, isDeleted/isEdited, typing endpoint shape, is_deleted true vs '1') |
| `edge-cases.test.ts` | adversarial inputs: duplicates, 404s, length/maxItems/maxProperties boundaries, unicode/emoji/path-traversal, auth failures, pagination, idempotency |

## Interpreting results

Most tests `t.diagnostic(...)` their findings — look at `node:test` output, not
just pass/fail counts. A passing suite still carries useful information:

- **Happy-path PASS**: `.api.*` methods are fully compatible with the backend.
- **Wire-format both-pass**: backend accepts both formats; spec can stay as-is
  (we just pick one as canonical and delegate hand-written methods to `.api.*`).
- **Wire-format one-fail**: the failing format is NOT accepted; update either
  openapi.yml or the hand-written method to match reality.

## Safety recap

- Every suite clears the tenant in `before` AND `after`, even on test failure.
- All resource IDs are unique (`${prefix}-${timestamp}-${hex(4)}`) — no collisions
  between parallel runs or with pre-existing prod data.
- If cleanup fails (e.g. `tenant.clearData` disabled), warnings print but tests
  proceed — state may leak; rerun against a fresh tenant.
