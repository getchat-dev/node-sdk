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
4. Optional, for the voice-upload suite — a **scratch** S3 bucket the tests may
   write into:
   ```
   TEST_S3_ACCESS_KEY=...
   TEST_S3_SECRET_KEY=...
   TEST_S3_ENDPOINT_URL=https://s3.example.com
   TEST_S3_BUCKET=getchat-sdk-tests
   # optional: TEST_S3_REGION, TEST_S3_PATH_STYLE, TEST_S3_PUBLIC_URL, TEST_S3_CDN_URL
   ```
   The suite hands these to the tenant (`PUT /s3-credentials`) and then requires
   the whole upload path to work. Two things to know before you fill them in:

   - **The bucket is written to.** The suite deletes every file it uploads (that
     is its last test, and the teardown mops up after a failure), but a crash
     between the two can still leave one behind — and `tenant.clearData` wipes
     chats and messages, never the bucket. Use a throwaway bucket.
   - **Credentials can't be taken back.** The endpoint requires all four fields,
     so they can be replaced but not removed. The "S3 is not set up" refusal is
     therefore only observable on a tenant nobody has configured yet — which is
     why that check runs first in the suite.

   Without these the voice suite still runs: it asserts the refusal and skips the
   parts that need a bucket.

   `s3-credentials.test.ts` is the preflight for exactly these four values — it
   writes and deletes a file in the bucket itself, needs no tenant, and says which
   of key / region / addressing style / bucket ACLs is the problem. Run it first
   when an upload fails. The signing it uses is pinned against AWS's own worked
   example in `test/unit/s3-signing.test.ts`, so a failure there is about the
   bucket, never about the test.

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
| `participant-rights.test.ts` | PUT/GET/DELETE rights round-trip: set → read → flip → null-clear → delete-all, plus mute enforcement on the send API |
| `s3-credentials.test.ts` | preflight for `TEST_S3_*`: writes, reads and deletes a small file in the bucket directly (no backend), so a wrong key, region, addressing style or an ACL-less bucket is named before anything else blames the API |
| `voice-messages.test.ts` | the resource pipeline: presign → real `PUT` to S3 → verify → poll until `ready` → send by `attachment_id` → read the attachment back; the 422 when the tenant has no S3, the format check on verify, reuse of an attachment across chats, and the backend refusing `voice_url` + `attachment_id` together. Needs `TEST_S3_*` for everything past the no-S3 check. |
| `rights-entry-points.test.ts` | rights arriving via `createChat` / `addParticipantsToChat` / `sendMessage` participants: cross-contamination, `{}`/null rights, conflicting duplicates, owner self-mute, re-add upsert-or-ignore, sender self-mute, `chat.create` contract |

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
