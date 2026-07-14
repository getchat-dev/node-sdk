// Type-level tests for the SDK's INPUT contract — the mirror of
// response-types.test-d.ts (which pins what comes OUT). COMPILE-TIME assertions
// enforced by `npm run typecheck`; NOT run by `node --test`.
//
// Covers:
//   A. Public wrapper signatures are frozen (`Parameters<>` equality) — CLAUDE.md
//      says they "must not be changed without a version bump"; this turns that
//      into a compile error instead of a code-review hope.
//   B. `.api.*` input types reject missing / mis-typed required fields.
//   C. An explicit `<T>` overrides the generated response default.
//   D. The `Avatar` oneOf accepts both of its branches and rejects a bad shape.
//   E. `requestApi` stays `<T = unknown>` (raw transport, never narrowed).
//
// Negatives use assignability (`ExpectFalse<V extends Input>`) rather than
// `@ts-expect-error`: it is immune to line-reflow by the formatter and speaks
// the same Equal/Expect vocabulary as the rest of the suite. (It does not model
// excess-property checking — that is intentionally out of scope.)

import type { Avatar } from '../../src/generated/schemas.js';
import type { ChatArg, Emby, MessageTextInput, UpdateMessageInput, UpdateMessageOptions } from '../../src/index.js';
import type {
    ChatCreate,
    ChatUpdate,
    GetChatMessagesQuery,
    GetChatsQuery,
    GetUserChatsQuery,
    MessageButton,
    PaginationQuery,
    Participant,
    StringMap,
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
            extra?: StringMap,
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
export type _sigSendTyping = Expect<Equal<Parameters<Emby['sendTyping']>, [chatId: string, userId: string]>>;
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
