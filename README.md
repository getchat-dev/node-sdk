# @emby-chat/node-sdk

Server-side Node SDK for [GetChat](https://getchat.dev). It does two things:

1. Builds **signed chat links** so you can drop the chat UI into an iframe or a WebView.
2. Talks to the **GetChat REST API** with your API token.

Node 16 or newer, types included, ships as both CommonJS and ESM. The only thing
it installs alongside itself is [zod](https://zod.dev), which checks what you send
before it leaves your server — no HTTP client, no lodash, nothing else.

> The product is called GetChat. It used to be called Emby, and the package name,
> the [`Emby`](#setup) class and the `EMBY_*` variables still say so — renaming
> them would break everyone who already uses the SDK.

There are two ways to call the API, and both go through the same code underneath:

- **[Ready-made methods](#rest-api)** — `sendMessage`, `getChats`, `createChat` and
  friends. They forgive loose input (a chat id as a plain string, `'yes'` instead
  of `true`) and their signatures don't change between versions. Anything that
  comes back in pages also has a [walker](#walking-a-whole-list) that reads every
  page for you.
- **[Generated methods](#the-generated-api-methods)** — one per endpoint, built from
  `openapi.yml`. Strict about input, and they cover everything, including what the
  ready-made methods don't reach.

## Install

```bash
npm install @emby-chat/node-sdk
```

## Setup

Create one [`Emby`](#embyconfig) object and keep it around — it holds no
connections and is safe to share.

```ts
import { Emby } from '@emby-chat/node-sdk';

const emby = new Emby({
    id: 'your-client-id',
    secret: 'your-client-secret',
    api_token: 'your-api-token',
    base_url: 'https://app.getchat.dev',
});
```

CommonJS works the same way:

```js
const { Emby } = require('@emby-chat/node-sdk');
```

- Nothing is required up front. If you only sign links, you never need
  `api_token`; if you only call the API, you never need `id` and `secret`. You
  find out when you use it: [`url`](#url) throws without `id` or `secret`, and the
  server answers 401 or 403 without a token.
- `base_url` is where the chat UI lives — every signed link starts with it.
  `api_url` is where the API lives; it falls back to `base_url`, so set it only
  when the API sits on another host.
- Trailing slashes in `base_url` are cleaned up for you. Every API path is built
  as `{api_url}/api/v1/{path}`.
- `options` sets how long a request may take and how often it is repeated — see
  [Timeouts and retries](#timeouts-and-retries).

All the fields are listed under [`EmbyConfig`](#embyconfig).

## Signed chat links

### `url`

The current way to build a link. You pass one object —
[`UrlOptions`](#urloptions) — with the [person](#urluseroptions) the link is for
(required), usually the [chat](#chatinput) to open, anyone
[else taking part](#urlrecipient), and any
[extra settings](#extra-settings-and-skin-options). The link is signed with your
client secret (HMAC-SHA256), so nobody can edit it on the way to the browser.

```ts
const link = emby.url({
    chat: {
        id: 'support-42',
        title: 'Support',
        create: true,
    },
    user: {
        id: 'u-1',
        name: 'Howard Lovecraft',
        picture: 'https://example.com/u-1.jpg',
        rights: {
            send_messages: true,
            edit_messages: 'my',
            delete_messages: 'my',
            pin_messages: 'for_everyone',
            kick_users: true,
        },
    },
    participants: [{ id: 'u-2', name: 'Alice' }],
    extra: {
        skin: 'default',
        skin_options: { display_header: true, lang: 'ru' },
    },
});
```

- A person with **no `id`** is a guest. The SDK puts a random 40-character
  `session` in the link (or keeps the one you pass) so the same browser is
  recognised on the next page load. A link with neither `id` nor `session` is
  rejected.
- Other people in a signed link need a `name` — that is stricter than the API
  asks for, which is what [`UrlRecipient`](#urlrecipient) is for.
- Everything under `extra` is added **after** signing, so it is **not protected**.
  Use it for looks, never for permissions.
- Only known fields make it into the link: `id`, `title`, `socket_port`, `create`
  and `metadata` from the [chat](#chatinput), and `id`, `name`, `email`,
  `picture`, `rights` and `session` from the person. Anything else is dropped.

### `urlByChatId`

An older builder, kept so old integrations keep working. It signs the same data
in a different way (MD5), and the server checks the two kinds of link separately —
so they are not interchangeable. Use [`url`](#url) for anything new.

```ts
// chat id and a person
emby.urlByChatId('support-42', { id: 'u-1', name: 'Alice' });

// a guest
emby.urlByChatId('support-42', { name: 'Guest', session: 'YOUR_SESSION_ID' });

// with other participants and extra settings
emby.urlByChatId(
    { id: 'support-42', title: 'Support' },
    { id: 'u-1', name: 'Alice', rights: { edit_messages: 'my' } },
    [{ id: 'u-2', name: 'Bob' }],
    { skin: 'default', skin_options: { hide_deleted_message: true } },
);
```

The arguments are `urlByChatId(chat, user, participants?, extra?)`. The chat is
required here — its id is part of what gets signed — and without it you get
`chat id isn't passed`. Rights still end up in the link, but here they are not
signed.

### Rights in a link

What the person may do inside the chat. The full list is under
[`UserRights`](#userrights). There are two kinds:

- **Switches** end up in the link as `'1'` or `'0'`. The type says `boolean`; the
  code also takes `'1'`, `'on'`, `'yes'`, `'true'` and their opposites, which is
  handy from plain JavaScript.
- **Choices** — `edit_messages`, `delete_messages`, `pin_messages` — take one of
  the listed values, optionally with extra parts after a colon: `'my:extra'`.
  Only the part before the first colon is checked; the whole string is signed,
  sent and read back by the chat UI. The one in use today is
  `edit_messages: 'my:extra'`, which lets the person edit a message's `extra` data
  instead of its text.

TypeScript doesn't know about the part after the colon, so tell it:

```ts
emby.url({
    user: {
        id: 'u-1',
        name: 'Alice',
        rights: { edit_messages: 'my:extra' as 'my' },
    },
});
```

An unknown right is dropped without a word, and so is a choice the server doesn't
recognise. Anything you leave out falls back to the server's defaults: sending
messages and voice, pressing buttons, seeing who is online, sending read receipts,
leaving chats, and editing or deleting one's own messages are **on**; the typing
indicator and read tracking are **off**; the rest stay unset.

Rights in a link and [rights set over the API](#rights-in-one-chat) are two
different things — see [`ParticipantRights`](#participantrights).

### Extra settings and skin options

Everything in `extra` goes into the link as it is (a nested object becomes
`key[sub]=value`). The chat UI reads two of those keys.

`skin` — one of `default`, `bubble`, `bounce`, `bouncemobile`, `alfa`,
`ebac_webinar`, `ebac_qwebinar`.

`skin_options` — how the embedded UI looks:

| Key | Type | Default | What it does |
| --- | --- | --- | --- |
| `display_header` | boolean | `true` | Show the header |
| `display_close_button` | boolean | `true` | Show the close button |
| `display_network_pane` | boolean | `true` | Show the connection status |
| `display_notification_prompt` | boolean | `false` | Ask the browser for notification permission |
| `hide_day_delimiter` | boolean | `false` | Hide the date lines between days |
| `hide_deleted_message` | boolean | `false` | Hide deleted messages instead of showing a stub |
| `message_max_length` | number | unset | Limit how much a person can type |
| `lang` | string | unset | Interface language: `en`, `es`, `fr`, `pt`, `ch`, `ru` |
| `emoji_render` | string | `native` | `native` or `image` |
| `jumbo_emoji` | boolean | `true` | Show a message made only of emoji in large size |

These are checked by the chat itself, not by this SDK — an unknown key is ignored
rather than reported.

## REST API

Every method returns a promise. An error answer from the server **rejects** it
with an `Error` that carries `status`, `body` and `headers` — see
[Errors](#errors). Input the API wouldn't accept throws right away, before
anything is sent.

You don't have to describe the answer: each method already knows what its endpoint
returns, so autocomplete works out of the box. See
[Reading answers](#reading-answers).

### Walking a whole list

Four things come back in pages: chats, a chat's messages, a chat's participants
and a user's chats. Each has a companion that walks the pages for you, so you
never have to count them yourself:

| Walker | Instead of |
| --- | --- |
| [`iterateChats(query?)`](#iteratechats) | [`getChats`](#getchats) |
| [`iterateMessagesFromChat(chatId, query?)`](#iteratemessagesfromchat) | [`getMessagesFromChat`](#getmessagesfromchat) |
| [`iterateChatParticipants(chatId, query?)`](#iteratechatparticipants) | [`getChatParticipants`](#getchatparticipants) |
| [`iterateUserChats(userId, query?)`](#iterateuserchats) | [`getUserChats`](#getuserchats) |

They take the same filters as the one-page method and hand back a
[`PageIterator`](#pageiterator), which you can read in three ways:

```ts
// one by one, across pages
for await (const chat of emby.iterateChats({ type: 'group' })) {
    console.log(chat.id, chat.title);
}

// everything at once
const all = await emby.iterateChats({ type: 'group' }).toArray();

// page by page, when you want the counts too
for await (const page of emby.iterateChats().pages()) {
    console.log(`page ${page.pagination.current}: ${page.items.length} of ${page.meta.total}`);
}
```

- Pages of 100 unless you set `limit`. A bigger number is brought down to what
  the endpoint serves — 1000, or 250 for a user's chats.
- Requests happen as you read. Leave the loop and the next page is never asked
  for; a failing page throws where you are reading.
- `signal`, `timeout`, `retries` and `retryDelay` go in the same object and apply
  to every page — see [Timeouts and retries](#timeouts-and-retries).
- Each of the three ways starts a fresh walk from the first page, so you can keep
  the walker around and read it more than once.
- The walk ends when the server says there is no next page. If it says nothing
  either way, an empty or short page ends it.
- A long list is answered a page at a time, so `toArray()` on one holds
  everything in memory. Loop over the items when the list may be big.
- A list that changes while you walk shifts the pages under you — the usual
  trade-off of page-by-page reading, not something the SDK can hide.

The items are the same objects the one-page methods return:
[`ChatResource`](#chatresource), [`MessageResource`](#messageresource),
[`ParticipantResource`](#participantresource). A [`Page`](#page) also keeps the
untouched answer in `raw`, which is where extras like the `users` list live.

### Chats

| Method | What it does | You get back |
| --- | --- | --- |
| [`getChats(query?)`](#getchats) | List chats, with filters and pages | `{ status, chats, chats_sort, users?, meta, pagination }` |
| [`iterateChats(query?)`](#iteratechats) | The same list, every page of it | [a walker](#walking-a-whole-list) over [`ChatResource`](#chatresource) |
| [`getChatInfo(chatId)`](#getchatinfo) | Read one chat | `{ status, chat }` |
| [`createChat(chat, participants?)`](#createchat) | Create a chat | `{ status, chat?, participants? }` |
| [`updateChat(chatId, updates)`](#updatechat) | Change the title, the metadata or the id | `{ status, chat? }` |
| [`deleteChat(chatId)`](#deletechat) | Delete a chat | `{ status }` |

Types used here: [`GetChatsQuery`](#getchatsquery), [`ChatCreate`](#chatcreate),
[`ChatUpdate`](#chatupdate), [`Participant`](#participant).

#### `getChats`

```ts
const r = await emby.getChats({ page: 1, limit: 50, type: 'group', with_owners: true });
for (const id of r.chats_sort) {
    console.log(id, r.chats[id].title);
}
```

- **Always pass `limit`.** Without it the method asks for `limit=1` and you get a
  single chat. `page` can't go below 1, `limit` can't go above 1000.
- `with_owners` takes `true`, `'yes'`, `'on'`, `1` and their opposites. It is
  **on its way out**: it adds a separate `users` list keyed by the chat service's
  own user ids, which don't match the `owner_id` inside the chats. The
  replacement, `with_owner`, puts the owner inside each chat — this method has no
  switch for it, so use [`emby.api.chatList`](#the-generated-api-methods) instead.
- Dates must look exactly like `2026-07-16T12:00:00` — no time zone, no
  milliseconds; anything else comes back as an error (422). And the server uses
  **only one** of `created_from` / `created_to`: if `created_from` is there,
  `created_to` is ignored.
- `chats` is an object of [`ChatResource`](#chatresource) keyed by chat id — but
  when nothing matched, the server sends an empty **array** `[]` instead. Walk
  `chats_sort` and you never have to think about it.

#### `iterateChats`

```ts
for await (const chat of emby.iterateChats({ type: 'group', metadata: { dep: 'cs' } })) {
    console.log(chat.id, chat.title);
}
```

The same filters as [`getChats`](#getchats), every page of the result, in
`chats_sort` order — see [Walking a whole list](#walking-a-whole-list). Pages of
100 here unless you set `limit`, not the single chat `getChats` defaults to.

#### `getChatInfo`

```ts
const { chat } = await emby.getChatInfo('support-42');
```

Anything that isn't a string throws `chat id isn't passed`. To get the owner or
the last message along with the chat, use
[`emby.api.chatShow`](#the-generated-api-methods) with
`query: { with_owner: '1', with_last_message: '1' }`.

#### `createChat`

```ts
await emby.createChat({
    id: 'support-42',
    title: 'Support',
    type: 'group',
    metadata: { dep: 'eng' },
    owner: { id: 'u-1', name: 'Owner' },
});

// A private chat needs its participants right away (two at most).
await emby.createChat(
    { id: 'dm-1', title: 'DM', type: 'private', owner: { id: 'u-1', name: 'Owner' } },
    [{ id: 'u-2', name: 'Other Party' }],
);
```

- **Always pass `owner`.** The type says it's optional, but a chat without one is
  an error (`Chat owner is required`), and an owner without an `id` creates a new
  stray user every time you call.
- The owner becomes the first participant and can carry their own
  [rights](#participantrights) for this chat.
- Up to 10 participants here. One with the owner's id is skipped.
- The new chat itself comes back only if the request asks for it, and this method
  doesn't. Either read it with [`getChatInfo`](#getchatinfo), or call
  [`emby.api.chatCreate`](#the-generated-api-methods) with
  `header: { Prefer: 'return=representation' }`.

#### `updateChat`

```ts
await emby.updateChat('support-42', { title: 'Renamed', metadata: { color: 'blue' } });
```

Send only what you want to change. A title longer than 255 characters is cut
short with an ellipsis rather than refused. As with `createChat`, the updated chat
comes back only when you ask for it with `Prefer: return=representation`.

#### `deleteChat`

```ts
await emby.deleteChat('support-42');
```

Answers as soon as the deletion is accepted. The server removes the participants
and drops the chat in the background, so it may take a moment to disappear.

### Messages

| Method | What it does | You get back |
| --- | --- | --- |
| [`getMessagesFromChat(chatId, query?, page?, limit?)`](#getmessagesfromchat) | List the messages of a chat | `{ status, messages, messages_sort, users?, meta, pagination }` |
| [`iterateMessagesFromChat(chatId, query?)`](#iteratemessagesfromchat) | The same list, every page of it | [a walker](#walking-a-whole-list) over [`MessageResource`](#messageresource) |
| [`sendMessage(chat, user, participants, message, extra?, buttons?)`](#sendmessage) | Post a message | `{ status, message_ids }` |
| [`updateMessage(chatId, messageId, update, options?)`](#updatemessage) | Edit the text, the `extra` data or the buttons | `{ status, is_updated, message? }` |
| [`deleteMessage(chatId, messageId)`](#deletemessage) | Delete a message | `{ status, is_updated }` |
| [`sendTyping(chatId, userId, time?)`](#sendtyping) | Show that someone is typing | `{ status }` |

Types used here: [`GetChatMessagesQuery`](#getchatmessagesquery),
[`ChatInput`](#chatinput), [`User`](#user), [`Participant`](#participant),
[`ExtraMap`](#extramap-and-stringmap), [`MessageButton`](#messagebutton),
[`UpdateMessageInput`](#updatemessageinput),
[`UpdateMessageOptions`](#updatemessageoptions).

#### `getMessagesFromChat`

```ts
const r = await emby.getMessagesFromChat('support-42', { with_users: true }, 1, 100);
for (const id of r.messages_sort) {
    console.log(r.messages[id].user_id, r.messages[id].text);
}
```

- `messages` is an object of [`MessageResource`](#messageresource) keyed by
  message id; `messages_sort` holds the ids in order.
- **Pages are the last two arguments**: `page` is third, `limit` is fourth, and
  both default to `1`. The `page` and `limit` inside the query object are accepted
  by the type but ignored — pass them as arguments or you get one message back.
- `with_users` adds a `users` list, keyed by the chat service's own user ids (so
  it doesn't line up with a message's `user_id`). The old spelling `withUsers`
  still works.
- `isDeleted` and `isEdited` narrow the list: `true` keeps only the deleted (or
  edited) ones, `false` keeps only the others, leaving them out keeps both.
- `extra` filters on a message's extra data, one value per key. `null` finds
  messages where the field is empty or missing; `0` or `false` finds everything
  that isn't `true`, including messages that never had the field at all.
- Sorting (`order: 'asc' | 'desc'`) is only available through
  [`emby.api.chatMessages`](#the-generated-api-methods).

#### `iterateMessagesFromChat`

```ts
for await (const m of emby.iterateMessagesFromChat('support-42', { with_users: true })) {
    console.log(m.user_id, m.text);
}
```

Every page of a chat's messages — see
[Walking a whole list](#walking-a-whole-list). Note that here the page size lives
in the query object (`{ limit: 200 }`), not in a positional argument, and that
messages arriving while you walk shift the pages under you.

#### `sendMessage`

```ts
const r = await emby.sendMessage(
    'support-42',                             // chat id, or a chat object
    { id: 'u-1', name: 'Alice' },             // who is writing — required, id and name
    [],                                       // participants — only if this call creates the chat
    'Hello world',                            // text, or { text, recipient_id }
    { source: 'crm', is_service: true },      // extra data — strings, numbers, booleans
    [{ type: 'local', label: 'OK', action: 'ok' }],
);
console.log(r.message_ids);
```

- The **author is required**, with both `id` and `name`. The server would take a
  nameless author for someone it already knows, but the SDK asks for the name
  anyway.
- Pass a [chat object](#chatinput) instead of a bare id when the chat may not
  exist yet: `{ id, create: true, title, type, metadata }` creates it on the spot.
  For a chat that already exists, `title` and `metadata` update it and `create` is
  ignored.
- `participants` are used **only** when this call creates the chat (a `private`
  chat needs them, two at most; other kinds allow up to 10). For an existing chat
  they are ignored — use [`addParticipantsToChat`](#addparticipantstochat).
- The text can't be empty here, or you get `message text is required`. A **voice
  message** (`voice_url` instead of text) has no ready-made method — send it with
  [`emby.api.chatSendMessage`](#the-generated-api-methods).
- Limits: 4096 characters of text, 100 keys of extra data, 20
  [buttons](#messagebutton). A `recipient_id`, if you set one, has to be a user
  who already exists.
- An author who is muted in this chat is refused (403). To post anyway you need
  `force: true`, which only
  [`emby.api.chatSendMessage`](#the-generated-api-methods) has.
- You get back only the **ids** of the new messages, not the messages themselves.

#### `updateMessage`

```ts
await emby.updateMessage('support-42', 'm-1', {
    text: 'edited text',
    extra: { tag: 'pinned' },
});

// Replace the extra data completely and ask for the message back:
const r = await emby.updateMessage(
    'support-42',
    'm-1',
    { extra: { tag: 'archived' } },
    { replaceExtra: true, returnMessage: true },
);
console.log(r.message);
```

Earlier versions of the text are kept — `versions` on the
[message](#messageresource) says how many. An empty or missing `text` leaves the
text alone; `isDeleted: true` clears it. `returnMessage` is the only way to get
the updated message body back.

#### `deleteMessage`

```ts
await emby.deleteMessage('support-42', 'm-1');
```

The message stays in the list, marked `is_deleted: true` with an empty text.
Giving it a new text with `updateMessage` brings it back.

#### `sendTyping`

```ts
await emby.sendTyping('support-42', 'u-1');       // the chat's own default, about 5s
await emby.sendTyping('support-42', 'u-1', 10);   // keep it up for 10 seconds
```

`time` is whole seconds, 1 to 60, and the SDK checks it before sending — anything
else throws (the server would have quietly ignored it).

### Participants

| Method | What it does | You get back |
| --- | --- | --- |
| [`getChatParticipants(chatId, query?)`](#getchatparticipants) | List who is in a chat | `{ status, participants, meta, pagination }` |
| [`iterateChatParticipants(chatId, query?)`](#iteratechatparticipants) | The same list, every page of it | [a walker](#walking-a-whole-list) over [`ParticipantResource`](#participantresource) |
| [`addParticipantsToChat(chatId, participants)`](#addparticipantstochat) | Add people | `{ status }` |
| [`removeParticipantFromChat(chatId, userId)`](#removeparticipantfromchat) | Remove one person | `{ status }` |

Types used here: [`PaginationQuery`](#paginationquery),
[`Participant`](#participant).

#### `getChatParticipants`

```ts
const r = await emby.getChatParticipants('support-42', { page: 1, limit: 100 });
console.log(r.participants.map((p) => p.name));
```

Without a query you get page 1 with 50 people; `limit` can't go above 1000. A
[`ParticipantResource`](#participantresource) has only names and contacts — no
metadata and no rights (read those with
[`getParticipantRights`](#getparticipantrights)).

#### `iterateChatParticipants`

```ts
const everyone = await emby.iterateChatParticipants('support-42').toArray();
```

Every page of a chat's participants — see
[Walking a whole list](#walking-a-whole-list).

#### `addParticipantsToChat`

```ts
await emby.addParticipantsToChat('support-42', [
    { id: 'u-2', name: 'Bob' },
    { id: 'u-3', name: 'Carol', email: 'carol@example.com', rights: { send_messages: false } },
]);
```

Up to 100 at a time. A person the service doesn't know yet is created, a known one
is updated. An empty array throws
`participants have to be an array of participant objects`. The
[rights](#participantrights) you pass apply to this chat only.

#### `removeParticipantFromChat`

```ts
await emby.removeParticipantFromChat('support-42', 'u-2');
```

Removes one person; loop on your side to remove several.

### Rights in one chat

These override what a person's signed link gave them, for this chat only. A value
you set **replaces** the one from the link — it can both give and take away — and
`null` removes the override again. Changes reach open chats immediately.

| Method | What it does | You get back |
| --- | --- | --- |
| [`getParticipantRights(chatId, userId)`](#getparticipantrights) | Read what is overridden | `{ status, rights }` |
| [`updateParticipantRights(chatId, userId, rights)`](#updateparticipantrights) | Set or clear overrides | `{ status, rights? }` |
| [`deleteParticipantRights(chatId, userId)`](#deleteparticipantrights) | Drop all overrides at once | `{ status }` |

Types used here: [`ParticipantRights`](#participantrights).

#### `getParticipantRights`

```ts
const { rights } = await emby.getParticipantRights('support-42', 'u-2');
```

A key that isn't there means the person keeps what the link gave them; `{}` means
nothing is overridden at all.

#### `updateParticipantRights`

```ts
await emby.updateParticipantRights('support-42', 'u-2', {
    send_messages: false,        // mute in this chat only
    pin_messages: 'for_everyone',
    edit_messages: null,         // drop the override — back to the link value
});
```

At least one right is required; an empty object throws. `send_messages: false`
mutes: the input box disappears, and both the socket and the API refuse anything
that person sends. They also can't edit or restore messages, but they can still
delete their own.

#### `deleteParticipantRights`

```ts
await emby.deleteParticipantRights('support-42', 'u-2');
```

Clears every override in one call, so the person is back to what their link says.

### Users

| Method | What it does | You get back |
| --- | --- | --- |
| [`createUser(user)`](#createuser) | Create a person | `{ status, user? }` |
| [`getUser(userId)`](#getuser) | Read a person | `{ status, user }` |
| [`updateUser(userId, updates)`](#updateuser) | Change their fields | `{ status, user? }` |
| [`deleteUser(userId)`](#deleteuser) | Delete a person | nothing documented |
| [`getUserChats(userId, query?)`](#getuserchats) | List the chats they are in | `{ chats, meta, pagination }` |
| [`iterateUserChats(userId, query?)`](#iterateuserchats) | The same list, every page of it | [a walker](#walking-a-whole-list) over [`ChatResource`](#chatresource) |

Types used here: [`User`](#user), [`GetUserChatsQuery`](#getuserchatsquery).

#### `createUser`

```ts
await emby.createUser({
    id: 'u-1',
    name: 'New User',
    email: 'user@example.com',
    picture: 'https://example.com/u-1.jpg',
    metadata: { team: 'eng' },
});
```

`id` and `name` are required, `metadata` holds up to 64 values here, and an id
that is already taken comes back as a conflict (409). The new person is sent back
only if you ask — use [`emby.api.userCreate`](#the-generated-api-methods) with
`header: { Prefer: 'return=representation' }`.

#### `getUser`

```ts
const { user } = await emby.getUser('u-1');
```

#### `updateUser`

```ts
await emby.updateUser('u-1', { name: 'Updated Name', email: 'new@example.com' });
```

Send only what you want to change.

#### `deleteUser`

```ts
await emby.deleteUser('u-1');
```

#### `getUserChats`

```ts
const r = await emby.getUserChats('u-1', {
    page: 1,
    limit: 50,
    order: 'desc',
    read: false,                       // unread only
    metadata: { dep: 'cs' },
    with_last_message: true,           // include each chat's newest message
});
console.log(r.chats.map((c) => c.title));
```

Without a query you get page 1 with 50 chats. Here the largest page is **250**,
not 1000. Filtering by chat kind, including the owner (`with_owner`) and including
the participants (`with_participants`) are only available through
[`emby.api.userChats`](#the-generated-api-methods).

Participants come along for private chats and for groups up to a limit (100
people by default). Above that the chat carries `participants_omitted` instead,
which says why; the limit is a setting for your workspace — see
`tenantSetParticipantsListingSettings` in
[the generated methods](#the-generated-api-methods). Supergroups and channels
never include their participants.

#### `iterateUserChats`

```ts
for await (const chat of emby.iterateUserChats('u-1', { order: 'desc' })) {
    console.log(chat.title);
}
```

Every chat a person is in — see [Walking a whole list](#walking-a-whole-list).
This endpoint serves at most 250 at a time, so a bigger `limit` is brought down
to that.

### Calling an endpoint by hand

`requestApi` is what everything else uses underneath. Reach for it only when
nothing else fits — otherwise prefer the
[generated methods](#the-generated-api-methods), which check what you send.

```ts
const r = await emby.requestApi<{ status: boolean }>(
    'chats/support-42/webhook',   // path after /api/{version}/
    { url: 'https://example.com/hook' }, // body for POST and PUT, query for GET and DELETE
    'put',                        // 'get' | 'post' | 'put' | 'delete'
    'v1',                         // API version
    { dry_run: 1 },               // query string
    { 'X-Request-Id': 'abc-123' },// extra headers
    { timeout: 5_000 },           // timeout, retries, cancellation
);
```

It returns `unknown` unless you say what to expect — it is the plain transport
and knows nothing about the answer.

## The generated `.api.*` methods

Every endpoint from `openapi.yml` sits on `emby.api` as its own method. The input
is one object with `path`, `query`, `body` and `header` parts, plus
[timeout and cancellation](#changing-it-for-one-call):

```ts
await emby.api.chatSendMessage({
    path: { chat_id: 'support-42' },
    body: {
        user: { id: 'u-1', name: 'Alice' },       // the author, at the top level
        messages: [{ voice_url: 'https://example.com/note.mp3' }],
    },
    timeout: 10_000,
});

await emby.api.chatCreate({
    header: { Prefer: 'return=representation' },  // ask for the new chat back
    query: { with_participants: true },
    body: {
        chat: { id: 'c-1', title: 'DM', type: 'private', owner: { id: 'u-1', name: 'Owner' } },
        participants: [{ id: 'u-2', name: 'Other Party' }],
    },
});
```

Input the API wouldn't accept throws right away, before any request goes out. The
answer isn't checked — the SDK passes it through as it came — but the types
describe what the endpoint promises.

All 31 endpoints, and the ready-made method for each:

| `emby.api.*` | Endpoint | Ready-made method |
| --- | --- | --- |
| `chatList` | `GET /chats` | [`getChats`](#getchats) |
| `chatCreate` | `POST /chats` | [`createChat`](#createchat) |
| `chatShow` | `GET /chats/{chat_id}` | [`getChatInfo`](#getchatinfo) |
| `chatUpdate` | `PUT /chats/{chat_id}` | [`updateChat`](#updatechat) |
| `chatDelete` | `DELETE /chats/{chat_id}` | [`deleteChat`](#deletechat) |
| `chatParticipants` | `GET /chats/{chat_id}/participants` | [`getChatParticipants`](#getchatparticipants) |
| `chatAddParticipants` | `POST /chats/{chat_id}/participants` | [`addParticipantsToChat`](#addparticipantstochat) |
| `chatDeleteParticipants` | `DELETE /chats/{chat_id}/participants/{user_id}` | [`removeParticipantFromChat`](#removeparticipantfromchat) |
| `chatGetParticipantRights` | `GET /chats/{chat_id}/participants/{user_id}/rights` | [`getParticipantRights`](#getparticipantrights) |
| `chatUpdateParticipantRights` | `PUT /chats/{chat_id}/participants/{user_id}/rights` | [`updateParticipantRights`](#updateparticipantrights) |
| `chatDeleteParticipantRights` | `DELETE /chats/{chat_id}/participants/{user_id}/rights` | [`deleteParticipantRights`](#deleteparticipantrights) |
| `chatMessages` | `GET /chats/{chat_id}/messages` | [`getMessagesFromChat`](#getmessagesfromchat) |
| `chatSendMessage` | `POST /chats/{chat_id}/messages` | [`sendMessage`](#sendmessage) |
| `chatUpdateMessage` | `PUT /chats/{chat_id}/messages/{message}` | [`updateMessage`](#updatemessage), [`deleteMessage`](#deletemessage) |
| `chatSendTyping` | `PUT /chats/{chat_id}/typing/{user_id}` | [`sendTyping`](#sendtyping) |
| `chatSetWebhook` | `PUT /chats/{chat_id}/webhook` | — |
| `chatSetS3Credentials` | `PUT /chats/{chat_id}/s3-credentials` | — |
| `userCreate` | `POST /users` | [`createUser`](#createuser) |
| `userShow` | `GET /users/{user_id}` | [`getUser`](#getuser) |
| `userUpdate` | `PUT /users/{user_id}` | [`updateUser`](#updateuser) |
| `userDelete` | `DELETE /users/{user_id}` | [`deleteUser`](#deleteuser) |
| `userChats` | `GET /users/{user_id}/chats` | [`getUserChats`](#getuserchats) |
| `userAddFcmToken` | `POST /users/{user_id}/fcm_tokens` | — |
| `tenantSetS3Credentials` | `PUT /s3-credentials` | — |
| `tenantSetWebhookSettings` | `PUT /webhook` | — |
| `tenantSetFirebaseConfigForJs` | `PUT /firebase/js_config` | — |
| `tenantSetFirebaseServiceAccount` | `PUT /firebase/svc_acc_credentials` | — |
| `tenantSetFirebaseFcmVapid` | `PUT /firebase/fcm_vapid` | — |
| `tenantSetPushNotificationsSettings` | `PUT /settings/push-notifications` | — |
| `tenantSetParticipantsListingSettings` | `PUT /settings/participants` | — |
| `tenantClearData` | `PUT /clear` | — |

Worth knowing about the ones with no ready-made method:

- `chatSetWebhook` wants at least one of `disabled` or `url`, and always answers
  with 200. `status: false` means either "nothing changed" or "it didn't work" —
  the second case adds a `message`.
- `tenantClearData` wipes your workspace. On its own it answers straight away and
  clears in the background; with `query: { sync: true }` it clears first and
  answers after. **Never aim it at production.**
- `tenantSetParticipantsListingSettings` decides whether big groups list their
  participants — see [`getUserChats`](#getuserchats).

## Input types

Everything below is exported from the package, so you can use it in your own
code.

| Type | What it is | Where it goes |
| --- | --- | --- |
| [`EmbyConfig`](#embyconfig) | What you pass to `new Emby(...)` | [Setup](#setup) |
| [`EmbyRequestOptions`](#embyrequestoptions) | Timeouts and retries for this client | `EmbyConfig.options` |
| [`UrlOptions`](#urloptions) | Everything a signed link needs | [`url`](#url) |
| [`UrlUserOptions`](#urluseroptions) | The person a link is for | `UrlOptions.user`, [`urlByChatId`](#urlbychatid) |
| [`UrlRecipient`](#urlrecipient) | Somebody else in a signed link | `UrlOptions.participants` |
| [`UserRights`](#userrights) | What a person may do, inside a link | `UrlUserOptions.rights` |
| [`ChatInput`](#chatinput) | A chat to open, create on the spot, or post to | [`url`](#url), [`urlByChatId`](#urlbychatid), [`sendMessage`](#sendmessage) |
| [`ChatCreate`](#chatcreate) | A chat to create over the API | [`createChat`](#createchat) |
| [`ChatUpdate`](#chatupdate) | What can be changed about a chat | [`updateChat`](#updatechat) |
| [`User`](#user) | A person, over the API | [`createUser`](#createuser), [`updateUser`](#updateuser), [`sendMessage`](#sendmessage) |
| [`Participant`](#participant) | Somebody taking part in a chat | [`createChat`](#createchat), [`addParticipantsToChat`](#addparticipantstochat), [`sendMessage`](#sendmessage) |
| [`ParticipantRights`](#participantrights) | Rights for one chat | [`updateParticipantRights`](#updateparticipantrights), `Participant.rights` |
| [`MessageButton`](#messagebutton) | A button under a message | [`sendMessage`](#sendmessage), [`updateMessage`](#updatemessage) |
| [`UpdateMessageInput`](#updatemessageinput) | What to change about a message | [`updateMessage`](#updatemessage) |
| [`UpdateMessageOptions`](#updatemessageoptions) | How to apply the change | [`updateMessage`](#updatemessage) |
| [`GetChatsQuery`](#getchatsquery) | Filters and pages for the chat list | [`getChats`](#getchats) |
| [`GetChatMessagesQuery`](#getchatmessagesquery) | Filters for the message list | [`getMessagesFromChat`](#getmessagesfromchat) |
| [`GetUserChatsQuery`](#getuserchatsquery) | Filters and pages for a person's chats | [`getUserChats`](#getuserchats) |
| [`PaginationQuery`](#paginationquery) | Just pages | [`getChatParticipants`](#getchatparticipants) |
| [`ExtraMap`](#extramap-and-stringmap) / [`StringMap`](#extramap-and-stringmap) | Simple key–value bags | almost everywhere |

### `EmbyConfig`

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | Client id — needed by [`url`](#url) and [`urlByChatId`](#urlbychatid) |
| `secret` | `string` | Client secret, the key links are signed with — never send it to a browser |
| `api_token` | `string` | API token, sent with every request |
| `base_url` | `string` | Where the chat UI lives; every signed link starts here |
| `api_url` | `string` | Where the API lives; falls back to `base_url` |
| `options` | [`EmbyRequestOptions`](#embyrequestoptions) | Timeouts and retries for this client |

### `EmbyRequestOptions`

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| `timeout` | `number` | `30000` | How long one attempt may take, in ms; `0` means no limit |
| `retries` | `number` | `2` | How many more attempts after the first one; 0 to 10 |
| `retryDelay` | `number` | `200` | How long to wait before the next attempt, in ms; it grows from there |

These are checked when you create the client — a negative timeout or
`retries: 15` throws on the spot. See
[Timeouts and retries](#timeouts-and-retries).

### `UrlOptions`

| Field | Type | What it is |
| --- | --- | --- |
| `chat` | [`ChatInput`](#chatinput) \| `string` \| `null` | The chat to open, or just its id; `null` opens the chat list |
| `user` | [`UrlUserOptions`](#urluseroptions) | Who the link is for — **required** |
| `participants` | [`UrlRecipient[]`](#urlrecipient) | Other people in the conversation |
| `extra` | `Record<string, unknown>` | [Extra settings](#extra-settings-and-skin-options) — **not protected by the signature** |

### `UrlUserOptions`

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | User id. Leave it out for a guest |
| `name` | `string` | Display name |
| `email` | `string` | Email |
| `picture` | `string` | Avatar URL |
| `session` | `string` | Guest token; made up for you when there is no `id` |
| `is_bot` | `boolean` | Marks this person as a bot |
| `rights` | [`UserRights`](#userrights) | What they may do |
| `link` / `metadata` | `string` / [`StringMap`](#extramap-and-stringmap) | Allowed by the type (it builds on [`User`](#user)) but dropped before signing — a link carries neither |

### `UrlRecipient`

Stricter than [`Participant`](#participant), because a signed link is checked more
carefully.

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | User id — required |
| `name` | `string` | Display name — **required** here |
| `is_bot` | `boolean` | Marks them as a bot; `false` by default |
| `email` / `link` / `picture` | `string` | The rest of their details. [`urlByChatId`](#urlbychatid) carries them; [`url`](#url) sends only `id`, `name` and `is_bot` |

### `UserRights`

Rights inside a [signed link](#rights-in-a-link). The type is strict — `boolean`
for the sixteen switches, a plain value for the three choices — while the code
takes more: `'1'`, `'on'`, `'yes'`, `'true'` and their opposites for the switches,
and a colon-separated tail on a choice. Either way TypeScript needs a cast.

| Right | Values |
| --- | --- |
| `send_messages` | boolean |
| `react_messages` | boolean |
| `can_press_buttons` | boolean |
| `send_typing` | boolean |
| `track_presence` | boolean |
| `send_photos` | boolean |
| `send_voices` | boolean |
| `send_audio` | boolean |
| `send_documents` | boolean |
| `send_location` | boolean |
| `create_pool` | boolean |
| `participate_pool` | boolean |
| `kick_users` | boolean |
| `track_read_state` | boolean |
| `send_read_state` | boolean |
| `leave_chats` | boolean |
| `edit_messages` | `none` \| `my` \| `any` (plus a tail, e.g. `my:extra`) |
| `delete_messages` | `none` \| `my` \| `any` (plus a tail) |
| `pin_messages` | `none` \| `for_me` \| `for_everyone` (plus a tail) |

### `ParticipantRights`

The same rights, but [set through the API for one chat](#rights-in-one-chat). The
names match; the values don't:

| | In a link — [`UserRights`](#userrights) | Over the API — `ParticipantRights` |
| --- | --- | --- |
| Switches | `true`, `'on'`, `'yes'`, `'1'`, … → `'1'` / `'0'` | real `true` / `false` |
| Choices | may carry a tail, only the head is checked | strictly `none` / `my` / `any` — a tail is refused |
| `null` | means nothing | removes the override, back to the link value |

`pin_messages` acts like `for_everyone` even when set to `for_me` — pins are
shared by the whole chat for now.

### `ChatInput`

The relaxed chat object taken by [`url`](#url), [`urlByChatId`](#urlbychatid) and
[`sendMessage`](#sendmessage). Each of them reads the part it understands.

| Field | Type | Where it counts |
| --- | --- | --- |
| `id` | `string` | Everywhere |
| `title` | `string` | Everywhere; required when a chat is created, cut off past 255 characters |
| `type` | [`ChatType`](#where-the-types-lag-behind-the-api) | API only — a signed link ignores it |
| `metadata` | [`StringMap`](#extramap-and-stringmap) | Everywhere; up to 100 simple values |
| `create` | `boolean` | Create the chat if it isn't there yet |
| `socket_port` | `string \| number` | Signed links only; 4 characters at most |

### `ChatCreate`

What [`createChat`](#createchat) wants.

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | The chat id you choose — required |
| `title` | `string` | Title — required |
| `type` | [`ChatType`](#where-the-types-lag-behind-the-api) | A `private` chat needs its participants right away |
| `metadata` | [`StringMap`](#extramap-and-stringmap) | Up to 100 simple values; a nested object becomes keys like `a.b` |
| `owner` | [`User`](#user) `& { rights? }` | The owner. Optional in the type, but a chat without one is refused |

### `ChatUpdate`

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | Change the chat id |
| `title` | `string` | New title |
| `metadata` | [`StringMap`](#extramap-and-stringmap) | Metadata to update; a nested object becomes keys like `a.b` |

### `User`

A person, as the API sees them.

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | The user id you choose — required |
| `name` | `string` | Display name — required |
| `email` | `string` | Email — has to look like one |
| `link` | `string` | Profile link — has to be a URL |
| `picture` | `string` | Avatar — has to be a URL |
| `metadata` | [`StringMap`](#extramap-and-stringmap) | Up to 64 values in [`createUser`](#createuser). Ignored when a person comes along with a message or a new chat |

### `Participant`

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | The user id you choose — required |
| `name` | `string` | Display name, up to 100 characters |
| `email` | `string` | Email, up to 100 characters |
| `link` | `string` | Profile link — has to be a URL |
| `picture` | `string` | Avatar — any string here, not checked as a URL |
| `is_bot` | `boolean` | Accepted, but not saved yet |
| `rights` | [`ParticipantRights`](#participantrights) | Rights for this chat, applied as the person is added |

### `MessageButton`

| Field | Type | What it is |
| --- | --- | --- |
| `type` | `'url' \| 'call' \| 'local' \| 'remote'` | What pressing it does — required |
| `label` | `string` | The text on the button, up to 100 characters — required |
| `action` | `string` | What to do, up to 255 characters; read according to `type` |
| `state` | `'default' \| 'loading' \| 'disabled'` | Whether it can be pressed |
| `style` | `'primary' \| 'positive' \| 'negative' \| 'neutral'` | Its colour |

Up to 20 buttons on a message.

### `UpdateMessageInput`

| Field | Type | What it is |
| --- | --- | --- |
| `text` | `string` | New text, up to 4096 characters. Empty or missing leaves it alone |
| `isDeleted` | `boolean` | Mark as deleted; clears the text |
| `extra` | [`ExtraMap`](#extramap-and-stringmap) | Extra data, merged or replaced — see the options |
| `buttons` | [`MessageButton[]`](#messagebutton) | Replaces the buttons |

### `UpdateMessageOptions`

| Field | Type | Default | What it is |
| --- | --- | --- | --- |
| `replaceExtra` | `boolean` | `false` | `false` merges into the extra data, `true` replaces all of it |
| `returnMessage` | `boolean` | `false` | Ask for the updated message back |

### `GetChatsQuery`

| Field | Type | What it does |
| --- | --- | --- |
| `page` / `limit` | `number` | Pages. **Pass `limit`** — otherwise it's 1. The most you can ask for is 1000 |
| `type` | [`ChatType`](#where-the-types-lag-behind-the-api) | Only chats of one kind |
| `owner` | `string` | Only chats of one owner |
| `created_from` / `created_to` | `string` | When the chat was created, as `2026-07-16T12:00:00`. Only one of the two is used |
| `last_message_from` / `last_message_to` | `string` | When the last message arrived, same format |
| `metadata` | [`StringMap`](#extramap-and-stringmap) | Match metadata; `null` finds chats where the key is missing |
| `with_owners` | `boolean` | On its way out — adds a separate `users` list |

### `GetChatMessagesQuery`

| Field | Type | What it does |
| --- | --- | --- |
| `with_users` | `boolean` | Add a `users` list next to the messages |
| `isDeleted` | `boolean` | Only deleted messages, or only the live ones |
| `isEdited` | `boolean` | Only edited messages, or only the untouched ones |
| `extra` | [`ExtraMap`](#extramap-and-stringmap) | Match the message's extra data |
| `page` / `limit` | `number` | **Ignored here** — pass them as the 3rd and 4th arguments of [`getMessagesFromChat`](#getmessagesfromchat) |

### `GetUserChatsQuery`

| Field | Type | What it does |
| --- | --- | --- |
| `page` / `limit` | `number` | Pages; page 1 with 50 by default, 250 at most |
| `order` | `'asc' \| 'desc'` | Sort order |
| `read` | `boolean` | Only read, or only unread, chats |
| `metadata` | [`StringMap`](#extramap-and-stringmap) | Match metadata |
| `with_last_message` | `boolean` | Include each chat's newest message |

### `PaginationQuery`

Just `page` and `limit`. Used by
[`getChatParticipants`](#getchatparticipants), which gives you page 1 with 50 if
you leave it out.

### `ExtraMap` and `StringMap`

`ExtraMap` is `Record<string, string | number | boolean>` — the extra data on
messages, and what you filter them by. `StringMap` is `Record<string, string>`,
used for metadata. Both are flat: the server turns a nested object into keys like
`a.b`.

## Reading answers

Each method already knows the shape of its answer, so
`await emby.getChatInfo('c-1')` knows about `.chat` without any help. If you'd
rather describe it yourself, say so: `emby.getChats<MyShape>({ limit: 10 })`.
Nothing is checked at runtime — the type says what the endpoint promises, and a
field the server leaves out is simply not there.

### Pages and totals

Every answer has `status: true`. Lists add two more objects:

| Field | Type | What it is |
| --- | --- | --- |
| `meta.total` | `number` | How many there are in all |
| `meta.output` | `number` | How many are on this page |
| `pagination.items_per_page` | `number` | The page size actually used |
| `pagination.current` | `number` | The current page; 0 when nothing matched |
| `pagination.total` | `number` | How many pages there are; 0 when nothing matched |
| `pagination.next_page_url` | `string \| null` | `null` on the last page |
| `pagination.prev_page_url` | `string \| null` | `null` on the first page |

Two lists come back as an **object keyed by id** with a separate array of ids:
[`getChats`](#getchats) gives `chats` and `chats_sort`,
[`getMessagesFromChat`](#getmessagesfromchat) gives `messages` and
`messages_sort`. Walk the array of ids — it is in the right order, and it saves
you from the server's habit of sending an empty object as `[]`. Or let a
[walker](#walking-a-whole-list) do it: it hands over plain items, in order,
across pages.

### `PageIterator`

What the four [walkers](#walking-a-whole-list) hand back. Three ways to read one,
and each starts a fresh walk from the first page:

| How you read it | What you get |
| --- | --- |
| `for await (const item of it)` | the items one by one, across every page |
| `it.pages()` | whole [`Page`](#page) objects, counts included |
| `it.toArray()` | every item of every page in one array |

Requests happen as you read, so leaving the loop early asks for nothing more.

### `Page`

One page, as [`PageIterator.pages()`](#pageiterator) hands it over.

| Field | Type | What it is |
| --- | --- | --- |
| `items` | `T[]` | The items of this page, in the server's order |
| `meta` | `{ total, output }` | How many there are in all, and how many are here |
| `pagination` | see [Pages and totals](#pages-and-totals) | Where this page sits in the list |
| `raw` | `unknown` | The untouched answer, for extras like the `users` list |

`meta.output` falls back to the number of items read when the server leaves it
out, which the participant list does.

### `ChatResource`

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | Chat id |
| `type` | [`ChatType`](#where-the-types-lag-behind-the-api) | `null` for old chats made without one |
| `title` | `string` | Title |
| `created_at` / `updated_at` | `string` | Dates, as `2026-07-16T12:00:00+00:00` |
| `last_message_at` | `string` | Only when the chat has messages |
| `last_message` | [`MessageResource`](#messageresource) | Only when asked for with `with_last_message` |
| `owner_id` | `string` | The owner's id |
| `owner` | [`UserResource`](#userresource) | Only when asked for with `with_owner` |
| `metadata` | [`StringMap`](#extramap-and-stringmap) | Only when there is any |

On [`getUserChats`](#getuserchats) a chat can also carry `participants` or
`participants_omitted` — see
[where the types lag behind](#where-the-types-lag-behind-the-api).

### `MessageResource`

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | Message id |
| `user_id` | `string` | Who wrote it (an old message may carry the service's own id) |
| `text` | `string` | `null` for a deleted message |
| `created_at` | `number` | Unix time, in seconds |
| `updated_at` | `number \| null` | `null` until the first edit |
| `is_deleted` | `boolean` | Whether it is deleted |
| `is_edited` | `boolean` | Whether it was edited |
| `versions` | `number` | How many earlier versions are kept |
| `extra` | [`ExtraMap`](#extramap-and-stringmap) | Comes as `[]` when empty |
| `recipient_id` | `string` | Only when it was set |
| `buttons` | [`MessageButton[]`](#messagebutton) | The buttons under the message |

The server also sends `seq`, the number messages are ordered by — see
[where the types lag behind](#where-the-types-lag-behind-the-api).

### `UserResource`

| Field | Type | What it is |
| --- | --- | --- |
| `id` | `string` | User id |
| `name` | `string` | Display name |
| `email` | `string` | Email |
| `link` | `string` | Profile link |
| `picture` | `string` | Either an image URL, or a made-up avatar: `{ kind, color, initials }` |
| `created_at` / `updated_at` | `string` | Dates |
| `metadata` | [`StringMap`](#extramap-and-stringmap) | Whatever you stored |

### `ParticipantResource`

The same as [`UserResource`](#userresource) without `metadata`: `id`, `name`,
`email`, `link`, `picture`, `created_at`, `updated_at`. The list of participants
says nothing about rights — read those with
[`getParticipantRights`](#getparticipantrights).

### Where the types lag behind the API

The hand-written types in `src/types.ts` are the part that stays stable between
versions, and in a few places they are behind. None of this breaks a request —
the API takes and returns these values anyway — but TypeScript will argue:

- **`ChatType`** is `'private' | 'group' | 'system'`. The real list is `private`,
  `group`, `supergroup`, `channel`; `'system'` doesn't exist and is refused. For a
  supergroup or a channel use
  [`emby.api.chatCreate`](#the-generated-api-methods), whose types are generated
  and correct.
- **`MessageResource`** has no `seq`, although every message has one.
- **`ChatResource`** has no `participants` or `participants_omitted`.
- **`UserResource.picture`** says `string`, but a person without an uploaded
  avatar gets the object described above.
- **Voice messages** (`voice_url` instead of text) have no place in
  `MessageInput` — send them with
  [`emby.api.chatSendMessage`](#the-generated-api-methods).
- **[`UserRights`](#userrights)** knows neither the loose `'on'` / `'yes'`
  strings nor the [tail after a colon](#rights-in-a-link), both of which work —
  cast where you use them.

## Timeouts and retries

Every request has a time limit, and one that fails is repeated when repeating is
safe. Out of the box: **30 seconds** per attempt, **2** more attempts, and a wait
of **200 ms** that grows from there.

```ts
const emby = new Emby({
    api_token: '…',
    base_url: '…',
    options: { timeout: 5_000, retries: 3, retryDelay: 100 },
});
```

What gets repeated:

- **Reading** (`GET`, `DELETE`) — network trouble, server errors `500`, `502`,
  `503`, `504`, and "too many requests".
- **Writing** (`POST`, `PUT`) — only "too many requests", and connection errors
  that prove nothing was sent (connection refused, DNS failure). So a message is
  never posted twice.

If the server says how long to wait, the SDK waits that long, up to 30 seconds.
A timeout counts as network trouble, so a request that never answers can take
about `(retries + 1) × timeout` plus the waiting before it gives up. Pass a
`signal` when you need one deadline for the whole thing.

### Changing it for one call

`signal`, `timeout`, `retries` and `retryDelay` go right next to the input of any
[generated method](#the-generated-api-methods), in the query object of a
[walker](#walking-a-whole-list) (where they apply to every page), and as the
seventh argument of [`requestApi`](#calling-an-endpoint-by-hand). They are taken
out before the request is built, so they never reach the server.

```ts
const ac = new AbortController();

const p = emby.api.chatShow({
    path: { chat_id: 'support-42' },
    signal: ac.signal,
    timeout: 5_000,
    retries: 0,
});

ac.abort();   // p fails with an AbortError; a cancelled request is never repeated
```

Cancelling also cuts short the wait between attempts. The numbers are checked the
same way as in the constructor, so `retries: 15` for one call throws just as it
would for the whole client.

## Errors

| What happened | What you get |
| --- | --- |
| The server answered with an error | An `Error` with `status`, `body` (the parsed answer when it was JSON) and `headers`. Its `message` is the answer as text |
| The API wouldn't accept your input | A `ZodError`, thrown **right away**, before anything is sent |
| An attempt ran out of time | A `TimeoutError` — `name === 'TimeoutError'`, `code === 'ETIMEDOUT'` |
| You cancelled the call | Whatever you gave `abort()`, or an `Error` with `name === 'AbortError'` |
| The SDK refused the input itself | A plain `Error` with a fixed message, like `chat id isn't passed` or `message text is required` |

```ts
import { Emby, TimeoutError } from '@emby-chat/node-sdk';

try {
    await emby.sendMessage('support-42', { id: 'u-1', name: 'Alice' }, [], 'hello');
} catch (e) {
    if (e instanceof TimeoutError) {
        // ran out of time
    } else if (e instanceof Error && 'status' in e) {
        const err = e as Error & { status: number; body: unknown };
        console.error(err.status, err.body);
    } else {
        throw e;
    }
}
```

Error answers come in two shapes. Something wrong with the input looks like
`{ message, errors: { field: [messages] } }`; an action the server refused looks
like `{ status: false, message }`. A missing chat, user or message is a plain
`{ message }` — except when sending a message, where the text sits under `error`.

## TypeScript

The types come with the package, nothing extra to install.

```ts
import {
    Emby,
    TimeoutError,
    type EmbyConfig,
    type ChatResource,
    type MessageButton,
    type Page,
    type PageIterator,
    type ParticipantRights,
    type RequestControlOptions,
    type UserRights,
} from '@emby-chat/node-sdk';
```

- `import { Emby }` and `import Emby from …` both work.
- `TimeoutError` is a class, so `instanceof` works with it.
- [`PageIterator`](#pageiterator) and [`Page`](#page) describe what the
  [walkers](#walking-a-whole-list) hand over, and `RequestControlOptions` the
  per-call `signal` / `timeout` / `retries` / `retryDelay`.
- The [generated methods](#the-generated-api-methods) build their types from
  `openapi.yml` and don't export them by name. If you need to name one, take it
  from the method: `Parameters<typeof emby.api.chatList>[0]` or
  `Awaited<ReturnType<typeof emby.api.chatList>>`.

## License

MIT — see [LICENSE](LICENSE).
