# @emby-chat/node-sdk

Server-side Node SDK for [GetChat](https://getchat.dev) (the product was originally called "Emby" — the npm package and `Emby` class still use that name).

Two responsibilities:

1. **Sign chat URLs** for embedding the chat UI in an iframe / WebView (`url`, `urlByChatId`).
2. **Wrap the GetChat REST API** with two parallel surfaces:
   - **Hand-written high-level methods** (`sendMessage`, `getChats`, `addParticipantsToChat`, etc.) — lenient, backwards-compatible, accept loose input shapes.
   - **Auto-generated `.api.*` methods** — one per `operationId` in `openapi.yml`, strict Zod-validated input, openapi-fetch-style `{ path, query, body }` shape.

Both surfaces ultimately go through the same `requestApi` transport. As of 1.13 the high-level methods are thin adapters over `.api.*`.

The package publishes **dual CJS + ESM** from `dist/`. TypeScript types ship.

---

## Installation

```bash
npm install @emby-chat/node-sdk
# or
yarn add @emby-chat/node-sdk
```

## Configuration

ESM / TypeScript:
```ts
import { Emby } from '@emby-chat/node-sdk';

const emby = new Emby({
    id: 'your client id',
    secret: 'your client secret',
    api_token: 'your api token',
    base_url: 'https://app.getchat.dev',
});
```

CommonJS:
```js
const { Emby } = require('@emby-chat/node-sdk');

const emby = new Emby({
    id: 'your client id',
    secret: 'your client secret',
    api_token: 'your api token',
    base_url: 'https://app.getchat.dev',
});
```

Reliability defaults (timeout, retries) are set via `options` — see [Reliability](#reliability).

---

## URL signing

### `url(options)` — HMAC-SHA256 signed URL

Used to mint a per-user chat URL embedding owner / chat / participants / rights into the query, signed with `clientSecret`.

```js
emby.url({
    chat: {
        id: 'some_unique_string',
        title: 'The name of the chat',
    },
    user: {
        id: '10001',
        name: 'Howard Lovecraft',
        picture: 'https://via.placeholder.com/400',
        rights: {
            kick_users: 'on',
            edit_messages: 'any:extra',
            delete_messages: 'my',
            send_messages: true,
            pin_messages: 'for_everyone',
            send_read_state: true,
        },
    },
    participants: [
        { id: 'p1', name: 'Alice' },
    ],
    extra: {
        skin: 'default',
        skin_options: {
            display_header: true,
            hide_day_delimiter: true,
            message_max_length: 150,
        },
    },
});
```

JSDoc shape:
```js
/**
 * @param {Object}   options
 * @param {Object|string|null} [options.chat]            Chat details (or string id, or null for no chat).
 * @param {Object}   options.user                         The user the URL is being generated for. REQUIRED.
 * @param {string}   options.user.id                      Stable user id (used in signature).
 * @param {string}   [options.user.name]
 * @param {string}   [options.user.email]
 * @param {string}   [options.user.picture]
 * @param {string}   [options.user.link]
 * @param {Object}   [options.user.rights]                Per-right map (see "User rights" below).
 * @param {Object[]} [options.participants=[]]            Recipients added to the conversation.
 * @param {string}   options.participants[].id
 * @param {string}   [options.participants[].name]
 * @param {boolean}  [options.participants[].is_bot=false]
 * @param {Object}   [options.extra={}]                   Pass-through query keys (e.g. skin_options).
 * @returns {string}                                      Signed chat URL.
 */
```

### `urlByChatId(chat, user, participants?, extra?)` — MD5 signed URL (legacy)

Older signing scheme kept for backward compatibility. Signs with MD5 of `[clientSecret, nonce, …]`. Does **not** include `user.rights` in the signature itself (rights still pass through into the URL query).

```js
// Auth user
emby.urlByChatId('chatId10', { id: '10', name: 'User Name' });

// Auth user with avatar
emby.urlByChatId('chatId10', { id: '10', name: 'User Name', picture: 'https://avatar.url/me.jpg' });

// Anonymous (guest) user
emby.urlByChatId('chatId10', { name: 'Custom Guest Name', session: 'YOUR_SESSION_ID' });

// With skin / language options
emby.urlByChatId('chatId10', { id: '10', name: 'User Name' }, [], {
    skin: 'default',
    skin_options: {
        hide_deleted_message: true,
        lang: 'pt',
    },
});

// With per-user rights
emby.urlByChatId(
    'chatId10',
    {
        id: '10',
        name: 'User Name',
        rights: {
            edit_messages: 'my:extra',
        },
    },
    [],
    {
        skin: 'default',
        skin_options: { hide_deleted_message: true },
    },
);
```

### User rights

Defined in `src/libs/rights.scheme.ts`. Boolean rights accept truthy strings (`'on'`, `'yes'`, `'1'`, `'true'`) and are normalized to `'1'` / `'0'`. Enum rights accept the listed values; values may carry a `:`-separated suffix (e.g. `'my:extra'`) — the suffix is preserved in the URL but only the head is validated.

```jsonc
{
    // booleans
    "send_messages":     { "type": "boolean" },
    "react_messages":    { "type": "boolean" },
    "can_press_buttons": { "type": "boolean" },
    "send_typing":       { "type": "boolean" },
    "track_presence":    { "type": "boolean" },
    "send_photos":       { "type": "boolean" },
    "send_voices":       { "type": "boolean" },
    "send_audio":        { "type": "boolean" },
    "send_documents":    { "type": "boolean" },
    "send_location":     { "type": "boolean" },
    "create_pool":       { "type": "boolean" },
    "participate_pool":  { "type": "boolean" },
    "kick_users":        { "type": "boolean" },
    "track_read_state":  { "type": "boolean" },
    "send_read_state":   { "type": "boolean" },
    "leave_chats":       { "type": "boolean" },

    // enums (suffix after `:` allowed, e.g. "my:extra")
    "edit_messages":     { "type": "enum", "values": ["none", "my", "any"] },
    "delete_messages":   { "type": "enum", "values": ["none", "my", "any"] },
    "pin_messages":      { "type": "enum", "values": ["none", "for_me", "for_everyone"] }
}
```

### Skin options (iframe display)

```jsonc
{
    "display_header":       { "type": "boolean", "default": true  },
    "display_network_pane": { "type": "boolean", "default": true  },
    "hide_day_delimiter":   { "type": "boolean", "default": false },
    "hide_deleted_message": { "type": "boolean", "default": false },
    "message_max_length":   { "type": "integer", "default": 0     },
    "lang":                 { "type": "string",  "enum": ["en", "pt", "ru"], "default": "en" }
}
```

---

## High-level chat methods

All return `Promise`. Errors reject with `Error & { status: number; body: unknown }` — `body` carries the parsed JSON response from the backend.

### `getChats(query?)`
```ts
emby.getChats({ page: 1, limit: 50, type: 'group', with_owners: true })
    .then((r) => console.log(r.chats));
```
Lenient input: `with_owners` accepts `true | 'yes' | 'on' | 1`; coerced to spec `0|1` integer wire. Pagination is clamped to `[1, 1000]`.

### `getChatInfo(chatId)`
```ts
const info = await emby.getChatInfo('chat_id');
```
Throws `"chat id isn't passed"` for non-strings.

### `getMessagesFromChat(chatId, query?, page?, limit?)`
```ts
await emby.getMessagesFromChat('chat_id', { with_users: true, isDeleted: false }, 1, 100);
```
Accepts both spec `with_users` (snake_case) and legacy `withUsers` (camelCase) field names; the wire is always `with_users=1` (spec). `isDeleted` / `isEdited` accept smart-booleans (`'yes'`/`'on'`), coerced to integer wire.

### `sendMessage(chat, user, participants, message, extra?, buttons?)`
```ts
emby.sendMessage(
    'chat_id',                              // string or { id, title?, type?, metadata? }
    { id: 'user_id', name: 'User Name' },  // sender (required)
    [],                                     // participants for new chats; ignored on existing chats
    'Hello world',                          // string or { text, recipient_id? }
    { source: 'cli', is_service: true },    // optional extra (string | number | boolean values)
    [{ label: 'OK', action: 'ok', type: 'local' }], // optional buttons
).then((r) => console.log('message ids:', r.message_ids));
```

JSDoc shape:
```js
/**
 * @param {Object|string} chat                  Chat object or chat id string.
 * @param {string}        chat.id               Required when chat is an object.
 * @param {string}        [chat.title]          Used when creating a new chat.
 * @param {string}        [chat.type]           private | group | supergroup | channel.
 * @param {Object}        [chat.metadata]
 * @param {Object}        user                  Sender. REQUIRED.
 * @param {string}        user.id
 * @param {string}        [user.name]
 * @param {string}        [user.email]
 * @param {string}        [user.picture]
 * @param {string}        [user.link]
 * @param {Object[]}      [participants]        For new-chat creation only; ignored when chat already exists.
 * @param {string}        participants[].id
 * @param {string}        [participants[].name]
 * @param {boolean}       [participants[].is_bot=false]
 * @param {string|Object} message               String text, or { text, recipient_id? }.
 * @param {Object}        [extra={}]            Extra fields merged into the message body; values may be string, number or boolean.
 * @param {Object[]}      [buttons=[]]          Inline action buttons (max 4).
 * @returns {Promise<{ status: boolean, message_ids: string[] }>}
 */
```

### `updateMessage(chatId, messageId, updateData, options?)`
```ts
await emby.updateMessage('chat_id', 'message_id', {
    text: 'edited text',
    extra: { tag: 'pinned' },
});

// Soft-delete via update
await emby.updateMessage('chat_id', 'message_id', { isDeleted: true });
```

JSDoc shape:
```js
/**
 * @param {string}   chatId                          REQUIRED.
 * @param {string}   messageId                       REQUIRED.
 * @param {Object}   updateData
 * @param {string}   [updateData.text]
 * @param {boolean}  [updateData.isDeleted=false]    Soft-delete the message (wire is `is_deleted: true`).
 * @param {Object}   [updateData.extra={}]           Extra string-map. Merge by default; replace via options.
 * @param {Object[]} [updateData.buttons=[]]
 * @param {Object}   [options]
 * @param {boolean}  [options.replaceExtra=false]    `extra` mode: `merge` (default) or `replace`.
 * @param {boolean}  [options.returnMessage=false]   When true, response includes the updated message body.
 */
```

### `deleteMessage(chatId, messageId)`
```ts
await emby.deleteMessage('chat_id', 'message_id');
```
Convenience wrapper for `updateMessage` with `{ isDeleted: true }`. Wire body is `{ message: { is_deleted: true } }` (boolean per spec, was `'1'` string before 1.13).

### `sendTyping(chatId, userId)`
```ts
await emby.sendTyping('chat_id', 'user_id');
```
**BREAKING in 1.13**: now sends `PUT /chats/{chat_id}/typing/{user_id}` (no body), per the OpenAPI spec. The previous shape (`PUT /chats/{chat_id}/typing` + body `{ user }`) silently failed against the real backend.

### `addParticipantsToChat(chatId, participants)`
```ts
await emby.addParticipantsToChat('chat_id', [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob', email: 'bob@example.com', is_bot: false },
]);
```

### Chat CRUD wrappers

#### `createChat(chat, participants?)`
```ts
// Group / supergroup / channel: participants optional
await emby.createChat({
    id: 'c1',
    title: 'Project room',
    type: 'group',
    metadata: { dep: 'eng' },
    owner: { id: 'u1', name: 'Owner' },
});

// Private chat — backend requires participants on creation
await emby.createChat(
    { id: 'dm1', title: 'DM', type: 'private', owner: { id: 'u1', name: 'Owner' } },
    [{ id: 'u2', name: 'Other Party' }],
);
```

#### `updateChat(chatId, updates)`
```ts
await emby.updateChat('chat_id', {
    title: 'Renamed',
    metadata: { color: 'blue' },
});
```

#### `deleteChat(chatId)`
```ts
await emby.deleteChat('chat_id');
```

#### `getChatParticipants(chatId, query?)`
```ts
const r = await emby.getChatParticipants('chat_id', { page: 1, limit: 100 });
console.log(r.participants);
```

#### `removeParticipantFromChat(chatId, userId)`
```ts
await emby.removeParticipantFromChat('chat_id', 'user_id');
```
Removes a single participant. To remove many, loop on the caller side.

#### `getParticipantRights(chatId, userId)`
```ts
const r = await emby.getParticipantRights('chat_id', 'user_id');
console.log(r.rights); // per-chat overrides; rights not listed fall back to the signed-link values
```

#### `updateParticipantRights(chatId, userId, rights)`
```ts
await emby.updateParticipantRights('chat_id', 'user_id', {
    send_messages: false,      // mute this participant in this chat
    pin_messages: 'for_everyone',
    edit_messages: null,       // null clears the override — falls back to the signed-link value
});
```
Overrides a participant's rights for one chat. At least one right is required; booleans accept `true`/`false`/`null`, and `edit_messages`/`delete_messages` are `none|my|any`, `pin_messages` is `none|for_me|for_everyone`.

#### `deleteParticipantRights(chatId, userId)`
```ts
await emby.deleteParticipantRights('chat_id', 'user_id');
```
Clears **all** of the participant's per-chat overrides at once — they fall back entirely to their signed-link rights.

### User CRUD wrappers

#### `createUser(user)`
```ts
await emby.createUser({
    id: 'u1',
    name: 'New User',
    email: 'user@example.com',
    picture: 'https://avatar.url/u1.jpg',
    metadata: { team: 'eng' },
});
```

#### `getUser(userId)`
```ts
const r = await emby.getUser('user_id');
console.log(r.user);
```

#### `updateUser(userId, updates)`
```ts
await emby.updateUser('user_id', { name: 'Updated Name', email: 'new@example.com' });
```

#### `deleteUser(userId)`
```ts
await emby.deleteUser('user_id');
```

#### `getUserChats(userId, query?)`
```ts
const r = await emby.getUserChats('user_id', {
    page: 1,
    limit: 50,
    order: 'desc',
    read: false,                      // unread only
    metadata: { dep: 'cs' },          // filter by chat metadata
});
console.log(r.chats);
```

---

## Auto-generated `.api.*`

Every `operationId` in `openapi.yml` is exposed as a typed, Zod-validated method on `sdk.api.*`. Useful when you want strict spec-conforming inputs, or for endpoints not covered by the hand-written wrappers (chat creation, user CRUD, tenant config, FCM tokens, S3 / Firebase / push settings, `tenant.clearData`, etc).

Input shape follows the openapi-fetch convention — `{ path, query, body }` per operation:

```ts
// Create user
await emby.api.userCreate({
    body: { user: { id: 'u1', name: 'New User' } },
});

// Create a private chat with participants
await emby.api.chatCreate({
    body: {
        chat: { id: 'c1', title: 'DM', type: 'private', owner: { id: 'u1', name: 'New User' } },
        participants: [{ id: 'u2', name: 'Other Party' }],
    },
});

// Send a message
await emby.api.chatSendMessage({
    path: { chat_id: 'c1' },
    body: {
        user: { id: 'u1', name: 'New User' },     // top-level (required)
        messages: [{ text: 'hello' }],
    },
});

// List user's chats
const r = await emby.api.userChats({
    path: { user_id: 'u1' },
    query: { limit: 50, order: 'desc' },
});
```

Bad input throws `ZodError` synchronously (before any HTTP call). To inspect the surface:

```ts
console.log(Object.keys(emby.api).sort());
// chatAddParticipants, chatCreate, chatDelete, chatDeleteParticipants, chatList,
// chatMessages, chatParticipants, chatSendMessage, chatSendTyping, chatSetS3Credentials,
// chatSetWebhook, chatShow, chatUpdate, chatUpdateMessage, tenantClearData,
// tenantSetFirebaseConfigForJs, tenantSetFirebaseFcmVapid, tenantSetFirebaseServiceAccount,
// tenantSetPushNotificationsSettings, tenantSetS3Credentials, tenantSetWebhookSettings,
// userAddFcmToken, userChats, userCreate, userDelete, userShow, userUpdate
```

---

## Reliability

Every request has a **timeout** and is **retried** on transient failures. Defaults are set once via `options`; any call can override them.

### Defaults

```ts
const emby = new Emby({
    api_token: '…',
    base_url: '…',
    options: {
        timeout: 30_000, // per-attempt timeout in ms (0 disables). Default 30000.
        retries: 2,      // retry attempts after the first failure. Default 2.
        retryDelay: 200, // base backoff in ms (exponential + jitter). Default 200.
    },
});
```

Invalid values throw at construction (they are Zod-validated).

- **Timeout** — applied **per attempt**. A request that outruns `timeout` aborts and rejects with a `TimeoutError` (`err.name === 'TimeoutError'`, `err.code === 'ETIMEDOUT'`). A timed-out `GET`/`DELETE` is retried like any other transient failure, so a stuck backend can take up to about `(retries + 1) × timeout` (plus backoff) before the call finally gives up — pass a `signal` if you need one hard deadline across the whole call. A timed-out `POST`/`PUT` is **not** retried (the write may already have landed).
- **Retries** — `GET`/`DELETE` retry on network errors, `5xx` and `429`. `POST`/`PUT` retry **only** on `429` (a `Retry-After` header is honored) and on connection errors that never reached the server — so a write is never silently duplicated. Backoff grows exponentially with jitter.

### Per-call overrides & cancellation

`.api.*` methods accept `signal`, `timeout`, `retries` and `retryDelay` alongside the input:

```ts
const ac = new AbortController();

const p = emby.api.chatShow({
    path: { chat_id: 'c1' },
    signal: ac.signal, // cancel this request
    timeout: 5_000,    // override the instance timeout, just for this call
});

ac.abort(); // p rejects with an AbortError; a cancelled request is never retried
```

These control fields are stripped before the request is sent — they never reach the wire. The numeric ones (`timeout`/`retries`/`retryDelay`) share the same validation as the constructor options, so a bad value (e.g. `retries` above the cap) throws.

---

## TypeScript

Types ship in the package; consumers get full autocomplete and type-checking out of the box:

```ts
import { Emby, type ChatResource, type GetChatsResponse } from '@emby-chat/node-sdk';

const sdk = new Emby({ /* … */ });
const r = await sdk.getChats<GetChatsResponse>({ limit: 10 });
const first: ChatResource | undefined = Object.values(r.chats)[0];
```

For `.api.*` methods the input/output types are inferred from the generated Zod schemas — no extra annotation needed.

---

## Error handling

```ts
try {
    await emby.sendMessage('chat_id', user, [], 'hello');
} catch (e) {
    if (e instanceof Error) {
        console.error(e.message);                                     // backend body as string
        console.error('status:', (e as Error & { status?: number }).status);
        console.error('body:', (e as Error & { body?: unknown }).body); // parsed JSON when available
    }
}
```

Zod validation errors from `.api.*` methods throw `ZodError` (synchronous, before HTTP).

A request that times out rejects with a `TimeoutError`; one cancelled via `AbortSignal` rejects with an `AbortError`. Both are distinct from HTTP errors (which carry `.status`) — see [Reliability](#reliability).
