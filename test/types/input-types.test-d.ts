// Type-level tests for the SDK's INPUT contract — the mirror of
// response-types.test-d.ts (which pins what comes OUT). COMPILE-TIME assertions
// enforced by `npm run typecheck`; NOT run by `node --test`.
//
// Covers:
//   A. Public wrapper signatures are frozen (`Parameters<>` equality) — CLAUDE.md
//      says they "must not be changed without a version bump"; this turns that
//      into a compile error instead of a code-review hope.
//   B. `.api.*` input types reject missing / mis-typed required fields (six ops,
//      specific-field depth).
//   C. An explicit `<T>` overrides the generated response default.
//   D. The `Avatar` oneOf accepts both of its branches and rejects a bad shape.
//   E. `requestApi` stays `<T = unknown>` (raw transport, never narrowed).
//   F. Every one of the 30 operations: empty input is rejected unless the whole
//      input is optional (breadth complement to B — guards required-ness).
//   G. The `Prefer` header slot's exact union is pinned on all five ops that carry it.
//   H. Excess (unknown) properties are rejected at the call site.
//
// Most negatives use assignability (`ExpectFalse<V extends Input>`): it is immune
// to line-reflow by the formatter and speaks the same Equal/Expect vocabulary as
// the rest of the suite. Excess-property rejection (H) is the exception — it is a
// literal/call-site feature TS cannot express structurally (`{ a; b } extends { a }`
// is true), so those few use `@ts-expect-error` at a real call site.

import type { Avatar } from '../../src/generated/schemas.js';
import type { ChatArg, Emby, MessageTextInput, UpdateMessageInput, UpdateMessageOptions } from '../../src/index.js';
import type {
    ChatCreate,
    ChatUpdate,
    ExtraMap,
    ExtraValue,
    GetChatMessagesQuery,
    GetChatsQuery,
    GetUserChatsQuery,
    MessageButton,
    MessageInput,
    MessageResource,
    MessageUpdate,
    PaginationQuery,
    Participant,
    User,
} from '../../src/types.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;

declare const emby: Emby;

// ─────────────────────────────────────────────────────────────────────────────
// A. Public wrapper signatures are frozen. A reorder / retype / arity change (or
//    a lost `?`) flips one of these to `false` → red typecheck → forces a
//    deliberate signature change + version bump.
// ─────────────────────────────────────────────────────────────────────────────

export type _sigGetChats = Expect<Equal<Parameters<Emby['getChats']>, [queryParams?: GetChatsQuery]>>;
export type _sigGetChatInfo = Expect<Equal<Parameters<Emby['getChatInfo']>, [id: string]>>;
export type _sigGetMessagesFromChat = Expect<
    Equal<
        Parameters<Emby['getMessagesFromChat']>,
        [chatId: string, queryParams?: GetChatMessagesQuery, page?: number, limit?: number]
    >
>;
export type _sigSendMessage = Expect<
    Equal<
        Parameters<Emby['sendMessage']>,
        [
            chat: ChatArg,
            user: User,
            participants: Participant[] | undefined,
            message: MessageTextInput,
            extra?: ExtraMap,
            buttons?: MessageButton[],
        ]
    >
>;
export type _sigUpdateMessage = Expect<
    Equal<
        Parameters<Emby['updateMessage']>,
        [chatId: string, messageId: string, input: UpdateMessageInput, options?: UpdateMessageOptions]
    >
>;
export type _sigDeleteMessage = Expect<Equal<Parameters<Emby['deleteMessage']>, [chatId: string, messageId: string]>>;
export type _sigSendTyping = Expect<
    Equal<Parameters<Emby['sendTyping']>, [chatId: string, userId: string, time?: number]>
>;
export type _sigAddParticipants = Expect<
    Equal<Parameters<Emby['addParticipantsToChat']>, [chatId: string, participants?: Participant[]]>
>;
export type _sigCreateChat = Expect<
    Equal<Parameters<Emby['createChat']>, [chat: ChatCreate, participants?: Participant[]]>
>;
export type _sigUpdateChat = Expect<Equal<Parameters<Emby['updateChat']>, [chatId: string, updates?: ChatUpdate]>>;
export type _sigDeleteChat = Expect<Equal<Parameters<Emby['deleteChat']>, [chatId: string]>>;
export type _sigGetChatParticipants = Expect<
    Equal<Parameters<Emby['getChatParticipants']>, [chatId: string, query?: PaginationQuery]>
>;
export type _sigRemoveParticipant = Expect<
    Equal<Parameters<Emby['removeParticipantFromChat']>, [chatId: string, userId: string]>
>;
export type _sigCreateUser = Expect<Equal<Parameters<Emby['createUser']>, [user: User]>>;
export type _sigGetUser = Expect<Equal<Parameters<Emby['getUser']>, [userId: string]>>;
export type _sigUpdateUser = Expect<Equal<Parameters<Emby['updateUser']>, [userId: string, updates?: Partial<User>]>>;
export type _sigDeleteUser = Expect<Equal<Parameters<Emby['deleteUser']>, [userId: string]>>;
export type _sigGetUserChats = Expect<
    Equal<Parameters<Emby['getUserChats']>, [userId: string, query?: GetUserChatsQuery]>
>;

// ─────────────────────────────────────────────────────────────────────────────
// B. `.api.*` input types reject missing / mis-typed required fields.
//    `AcceptsInput<K, V>` is true iff V is assignable to method K's input type.
// ─────────────────────────────────────────────────────────────────────────────

type Api = Emby['api'];
type AcceptsInput<K extends keyof Api, V> = V extends Parameters<Api[K]>[0] ? true : false;

// chatShow — path.chat_id required
export type _inChatShowOk = Expect<AcceptsInput<'chatShow', { path: { chat_id: 'c1' } }>>;
export type _inChatShowNoId = ExpectFalse<AcceptsInput<'chatShow', { path: Record<string, never> }>>;
export type _inChatShowNoPath = ExpectFalse<AcceptsInput<'chatShow', Record<string, never>>>;

// userShow — path.user_id required
export type _inUserShowOk = Expect<AcceptsInput<'userShow', { path: { user_id: 'u1' } }>>;
export type _inUserShowNoId = ExpectFalse<AcceptsInput<'userShow', { path: Record<string, never> }>>;

// chatSendTyping — both path params required; query.time is a number
export type _inTypingOk = Expect<AcceptsInput<'chatSendTyping', { path: { chat_id: 'c1'; user_id: 'u1' } }>>;
export type _inTypingWithTime = Expect<
    AcceptsInput<'chatSendTyping', { path: { chat_id: 'c1'; user_id: 'u1' }; query: { time: 5 } }>
>;
export type _inTypingNoUser = ExpectFalse<AcceptsInput<'chatSendTyping', { path: { chat_id: 'c1' } }>>;
export type _inTypingBadTime = ExpectFalse<
    AcceptsInput<'chatSendTyping', { path: { chat_id: 'c1'; user_id: 'u1' }; query: { time: 'soon' } }>
>;

// chatParticipants — path.chat_id required; query optional but typed
export type _inParticipantsOk = Expect<AcceptsInput<'chatParticipants', { path: { chat_id: 'c1' } }>>;
export type _inParticipantsBadLimit = ExpectFalse<
    AcceptsInput<'chatParticipants', { path: { chat_id: 'c1' }; query: { limit: 'lots' } }>
>;

// chatSendMessage — path.chat_id + body.user + body.messages all required
export type _inSendMsgOk = Expect<
    AcceptsInput<
        'chatSendMessage',
        { path: { chat_id: 'c1' }; body: { user: { id: 'u1'; name: 'U' }; messages: [{ text: 'hi' }] } }
    >
>;
export type _inSendMsgNoUser = ExpectFalse<
    AcceptsInput<'chatSendMessage', { path: { chat_id: 'c1' }; body: { messages: [{ text: 'hi' }] } }>
>;
export type _inSendMsgNoMessages = ExpectFalse<
    AcceptsInput<'chatSendMessage', { path: { chat_id: 'c1' }; body: { user: { id: 'u1'; name: 'U' } } }>
>;

// chatCreate — body.chat requires id + title + type
export type _inCreateChatOk = Expect<
    AcceptsInput<'chatCreate', { body: { chat: { id: 'c1'; title: 'T'; type: 'group' } } }>
>;
export type _inCreateChatNoType = ExpectFalse<AcceptsInput<'chatCreate', { body: { chat: { id: 'c1'; title: 'T' } } }>>;
export type _inCreateChatNoTitle = ExpectFalse<
    AcceptsInput<'chatCreate', { body: { chat: { id: 'c1'; type: 'group' } } }>
>;

// ─────────────────────────────────────────────────────────────────────────────
// C. Explicit `<T>` overrides the response default (wrapper + generated method).
// ─────────────────────────────────────────────────────────────────────────────

type Custom = { custom: 123 };
export function _overrideReturns() {
    return {
        wrapper: emby.getChatInfo<Custom>('c1'),
        api: emby.api.chatShow<Custom>({ path: { chat_id: 'c1' } }),
    };
}
type OverrideReturns = ReturnType<typeof _overrideReturns>;
export type _oWrapper = Expect<Equal<Awaited<OverrideReturns['wrapper']>, Custom>>;
export type _oApi = Expect<Equal<Awaited<OverrideReturns['api']>, Custom>>;

// ─────────────────────────────────────────────────────────────────────────────
// D. `Avatar` oneOf: string branch OR the placeholder object; both minimal and
//    full object shapes are accepted; an unrelated shape is not.
// ─────────────────────────────────────────────────────────────────────────────

type Assignable<A, B> = A extends B ? true : false;
export type _avatarString = Expect<Assignable<string, Avatar>>;
export type _avatarFull = Expect<Assignable<{ kind: string; color: string; initials: string }, Avatar>>;
export type _avatarMinimal = Expect<Assignable<{ kind: string }, Avatar>>;
export type _avatarBad = ExpectFalse<Assignable<{ foo: number }, Avatar>>;

// ─────────────────────────────────────────────────────────────────────────────
// E. `requestApi` is the raw transport — its default stays `unknown`.
// ─────────────────────────────────────────────────────────────────────────────

export function _requestApiDefault() {
    return emby.requestApi('chats');
}
export type _requestApiUnknown = Expect<Equal<Awaited<ReturnType<typeof _requestApiDefault>>, unknown>>;

// ─────────────────────────────────────────────────────────────────────────────
// F. Exhaustive required-ness across ALL 30 operations. Empty input must be
//    REJECTED by every op with a required path/body, and ACCEPTED only by the two
//    whose entire input is optional (`chatList`, `tenantClearData`). This is the
//    breadth complement to the specific-field negatives above: it guards against a
//    codegen regression silently making a path/body optional. (It asserts that
//    *something* is required, not which field — the six ops above pin fields.)
// ─────────────────────────────────────────────────────────────────────────────

type Empty = Record<string, never>;

export type _reqChatList = Expect<AcceptsInput<'chatList', Empty>>; // fully-optional input
export type _reqTenantClearData = Expect<AcceptsInput<'tenantClearData', Empty>>; // fully-optional input

export type _reqChatCreate = ExpectFalse<AcceptsInput<'chatCreate', Empty>>;
export type _reqChatShow = ExpectFalse<AcceptsInput<'chatShow', Empty>>;
export type _reqChatUpdate = ExpectFalse<AcceptsInput<'chatUpdate', Empty>>;
export type _reqChatDelete = ExpectFalse<AcceptsInput<'chatDelete', Empty>>;
export type _reqChatParticipants = ExpectFalse<AcceptsInput<'chatParticipants', Empty>>;
export type _reqChatAddParticipants = ExpectFalse<AcceptsInput<'chatAddParticipants', Empty>>;
export type _reqChatGetParticipantRights = ExpectFalse<AcceptsInput<'chatGetParticipantRights', Empty>>;
export type _reqChatUpdateParticipantRights = ExpectFalse<AcceptsInput<'chatUpdateParticipantRights', Empty>>;
export type _reqChatDeleteParticipantRights = ExpectFalse<AcceptsInput<'chatDeleteParticipantRights', Empty>>;
export type _reqChatDeleteParticipants = ExpectFalse<AcceptsInput<'chatDeleteParticipants', Empty>>;
export type _reqChatMessages = ExpectFalse<AcceptsInput<'chatMessages', Empty>>;
export type _reqChatSendMessage = ExpectFalse<AcceptsInput<'chatSendMessage', Empty>>;
export type _reqChatUpdateMessage = ExpectFalse<AcceptsInput<'chatUpdateMessage', Empty>>;
export type _reqChatSendTyping = ExpectFalse<AcceptsInput<'chatSendTyping', Empty>>;
export type _reqChatSetWebhook = ExpectFalse<AcceptsInput<'chatSetWebhook', Empty>>;
export type _reqChatSetS3Credentials = ExpectFalse<AcceptsInput<'chatSetS3Credentials', Empty>>;
export type _reqUserCreate = ExpectFalse<AcceptsInput<'userCreate', Empty>>;
export type _reqUserShow = ExpectFalse<AcceptsInput<'userShow', Empty>>;
export type _reqUserUpdate = ExpectFalse<AcceptsInput<'userUpdate', Empty>>;
export type _reqUserDelete = ExpectFalse<AcceptsInput<'userDelete', Empty>>;
export type _reqUserChats = ExpectFalse<AcceptsInput<'userChats', Empty>>;
export type _reqUserAddFcmToken = ExpectFalse<AcceptsInput<'userAddFcmToken', Empty>>;
export type _reqTenantSetS3Credentials = ExpectFalse<AcceptsInput<'tenantSetS3Credentials', Empty>>;
export type _reqTenantSetWebhookSettings = ExpectFalse<AcceptsInput<'tenantSetWebhookSettings', Empty>>;
export type _reqTenantSetFirebaseConfigForJs = ExpectFalse<AcceptsInput<'tenantSetFirebaseConfigForJs', Empty>>;
export type _reqTenantSetFirebaseServiceAccount = ExpectFalse<AcceptsInput<'tenantSetFirebaseServiceAccount', Empty>>;
export type _reqTenantSetFirebaseFcmVapid = ExpectFalse<AcceptsInput<'tenantSetFirebaseFcmVapid', Empty>>;
export type _reqTenantSetPushNotificationsSettings = ExpectFalse<
    AcceptsInput<'tenantSetPushNotificationsSettings', Empty>
>;

// ─────────────────────────────────────────────────────────────────────────────
// G. Header slot. Five ops carry an optional `Prefer` header (RFC 7240). Pin its
//    exact union for each — a regenerate that drops a value, adds one, or loses
//    the slot flips the Equal. Extracting the slot type avoids building a full
//    valid body just to reach the header.
// ─────────────────────────────────────────────────────────────────────────────

type PreferOf<K extends keyof Api> =
    NonNullable<Parameters<Api[K]>[0]> extends { header?: { Prefer?: infer P } } ? P : never;
type PreferEnum = 'return=representation' | 'return=minimal';

export type _hdrChatCreate = Expect<Equal<NonNullable<PreferOf<'chatCreate'>>, PreferEnum>>;
export type _hdrChatUpdate = Expect<Equal<NonNullable<PreferOf<'chatUpdate'>>, PreferEnum>>;
export type _hdrChatUpdateMessage = Expect<Equal<NonNullable<PreferOf<'chatUpdateMessage'>>, PreferEnum>>;
export type _hdrUserCreate = Expect<Equal<NonNullable<PreferOf<'userCreate'>>, PreferEnum>>;
export type _hdrUserUpdate = Expect<Equal<NonNullable<PreferOf<'userUpdate'>>, PreferEnum>>;
// The header slot itself is omittable (optional).
export type _hdrOptional = Expect<Assignable<undefined, Parameters<Api['chatUpdateMessage']>[0]['header']>>;

// ─────────────────────────────────────────────────────────────────────────────
// H. Excess-property rejection. This is a literal / call-site feature (TS only
//    flags unknown keys on fresh object literals) and is NOT expressible via
//    assignability — `{ a; b } extends { a }` is true. So these use real call
//    sites + `@ts-expect-error`, positioned directly before the offending key.
//    The surrounding comment keeps the formatter from collapsing the literal and
//    detaching the directive. If excess-checking ever stopped firing, the now
//    unused directive would itself error (TS2578) — the assertion is self-teething.
// ─────────────────────────────────────────────────────────────────────────────

export function _excessRejected() {
    return [
        emby.api.chatShow({
            path: { chat_id: 'c1' },
            // @ts-expect-error `bogus` is not a known top-level input field
            bogus: true,
        }),
        emby.api.chatShow({
            path: {
                chat_id: 'c1',
                // @ts-expect-error `bogus` is not a known field inside `path`
                bogus: true,
            },
        }),
        emby.api.chatCreate({
            body: {
                chat: { id: 'c1', title: 'T', type: 'group' },
                // @ts-expect-error `bogus` is not a known field inside `body`
                bogus: true,
            },
        }),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// I. Per-call control options. Every `.api.*` input also accepts an optional
//    signal / timeout / retries / retryDelay (mixed in via RequestControlOptions).
// ─────────────────────────────────────────────────────────────────────────────

type ChatShowIn = NonNullable<Parameters<Api['chatShow']>[0]>;
export type _ctrlSignal = Expect<Equal<ChatShowIn['signal'], AbortSignal | undefined>>;
export type _ctrlTimeout = Expect<Equal<ChatShowIn['timeout'], number | undefined>>;
export type _ctrlRetries = Expect<Equal<ChatShowIn['retries'], number | undefined>>;
export type _ctrlRetryDelay = Expect<Equal<ChatShowIn['retryDelay'], number | undefined>>;
// Wire slots plus control options together type-check…
export type _ctrlAccepted = Expect<
    AcceptsInput<
        'chatShow',
        { path: { chat_id: 'c1' }; signal: AbortSignal; timeout: 5000; retries: 1; retryDelay: 50 }
    >
>;
// …and the control options are optional (bare wire input still valid).
export type _ctrlOptional = Expect<AcceptsInput<'chatShow', { path: { chat_id: 'c1' } }>>;

// ─────────────────────────────────────────────────────────────────────────────
// J. `extra` bags accept scalar values (string | number | boolean), not only
//    strings — pins the fix that widened `additionalProperties` from `type: string`
//    to a scalar union so `{ is_service: true }` type-checks instead of erroring.
// ─────────────────────────────────────────────────────────────────────────────

export type _extraValueShape = Expect<Equal<ExtraValue, string | number | boolean>>;
export type _extraMapShape = Expect<Equal<ExtraMap, Record<string, string | number | boolean>>>;

// The hand-written message types carry the widened map.
export type _msgInputExtra = Expect<Equal<MessageInput['extra'], ExtraMap | undefined>>;
export type _msgUpdateExtra = Expect<Equal<MessageUpdate['extra'], ExtraMap | undefined>>;
export type _msgResourceExtra = Expect<Equal<MessageResource['extra'], ExtraMap | undefined>>;
export type _updateMsgInputExtra = Expect<Equal<UpdateMessageInput['extra'], ExtraMap | undefined>>;

// `.api.*` inputs accept number + boolean extra values, not only strings.
export type _apiSendScalarExtra = Expect<
    AcceptsInput<
        'chatSendMessage',
        {
            path: { chat_id: 'c1' };
            body: { user: { id: 'u1'; name: 'U' }; messages: [{ text: 'hi'; extra: { s: 'x'; n: 1; b: true } }] };
        }
    >
>;
export type _apiUpdateScalarExtra = Expect<
    AcceptsInput<
        'chatUpdateMessage',
        { path: { chat_id: 'c1'; message: 'm1' }; body: { message: { extra: { s: 'x'; n: 1; b: true } } } }
    >
>;
export type _apiMessagesQueryScalarExtra = Expect<
    AcceptsInput<'chatMessages', { path: { chat_id: 'c1' }; query: { extra: { flag: true; count: 2 } } }>
>;

// A non-scalar value (object / array / null) is NOT a valid extra value.
export type _extraRejectsObjectValue = ExpectFalse<Assignable<{ a: { nested: 1 } }, ExtraMap>>;
export type _extraRejectsArrayValue = ExpectFalse<Assignable<{ a: number[] }, ExtraMap>>;
export type _extraRejectsNullValue = ExpectFalse<Assignable<{ a: null }, ExtraMap>>;

// …and that rejection holds at the actual `.api.*` call site.
export type _apiSendRejectsObjectExtra = ExpectFalse<
    AcceptsInput<
        'chatSendMessage',
        {
            path: { chat_id: 'c1' };
            body: { user: { id: 'u1'; name: 'U' }; messages: [{ text: 'hi'; extra: { bad: { x: 1 } } }] };
        }
    >
>;
