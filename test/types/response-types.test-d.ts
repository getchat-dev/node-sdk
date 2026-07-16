// Type-level tests for the generated response types and the wrapper defaults.
//
// These are COMPILE-TIME assertions: they are enforced by `npm run typecheck`
// (this file is under the `test/**/*` tsconfig include) and are intentionally
// NOT picked up by `node --test` (it globs only `test/unit|integration/*.test.ts`).
// A failing `Expect<...>` is a type error, so `npm run typecheck` goes red.

import type {
    ChatAddParticipantsResponse,
    ChatCreateResponse,
    ChatDeleteParticipantRightsResponse,
    ChatDeleteParticipantsResponse,
    ChatDeleteResponse,
    ChatGetParticipantRightsResponse,
    ChatListResponse,
    ChatMessagesResponse,
    ChatParticipantsResponse,
    ChatSendMessageResponse,
    ChatSendTypingResponse,
    ChatSetS3CredentialsResponse,
    ChatSetWebhookResponse,
    ChatShowResponse,
    ChatUpdateMessageResponse,
    ChatUpdateParticipantRightsResponse,
    ChatUpdateResponse,
    TenantClearDataResponse,
    TenantSetFirebaseConfigForJsResponse,
    TenantSetFirebaseFcmVapidResponse,
    TenantSetFirebaseServiceAccountResponse,
    TenantSetPushNotificationsSettingsResponse,
    TenantSetS3CredentialsResponse,
    TenantSetWebhookSettingsResponse,
    UserAddFcmTokenResponse,
    UserChatsResponse,
    UserCreateResponse,
    UserDeleteResponse,
    UserShowResponse,
    UserUpdateResponse,
} from '../../src/generated/operations.js';
import type { ChatResource, ParticipantResource, UserResource } from '../../src/generated/schemas.js';
import type { Emby } from '../../src/index.js';

// Strict structural equality — distinguishes optional vs `| undefined`, readonly, etc.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ─────────────────────────────────────────────────────────────────────────────
// emitType output shapes — the tricky branches of the response-type emitter.
// ─────────────────────────────────────────────────────────────────────────────

// $ref inside an all-optional envelope.
export type _ShowEnvelope = Expect<Equal<ChatShowResponse, { status?: boolean; chat?: ChatResource }>>;

// `additionalProperties: { $ref }` → Record<string, T>.
export type _ListChatsMap = Expect<Equal<ChatListResponse['chats'], Record<string, ChatResource>>>;
export type _ListUsersMap = Expect<Equal<NonNullable<ChatListResponse['users']>, Record<string, UserResource>>>;

// `nullable: true` on an optional property → `string | null | undefined`.
export type _ListNextUrl = Expect<Equal<ChatListResponse['pagination']['next_page_url'], string | null | undefined>>;

// `type: array` → element[] (Array<T> and T[] are the same type).
export type _ListSort = Expect<Equal<NonNullable<ChatListResponse['chats_sort']>, string[]>>;

// `participants` is an array of a $ref.
export type _CreateParticipants = Expect<
    Equal<NonNullable<ChatCreateResponse['participants']>[number], ParticipantResource>
>;

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper defaults (the subject of this commit): each hand-written wrapper's
// return generic must default to its operation's XResponse.
//
// `ReturnType<typeof wrapper>` would NOT capture the default (TS instantiates the
// generic to `unknown` during inference). A *call site* does apply the default,
// so we capture the returns through an un-run function body.
// ─────────────────────────────────────────────────────────────────────────────

declare const emby: Emby;
export function _wrapperReturns() {
    return {
        getChats: emby.getChats(),
        getChatInfo: emby.getChatInfo('c1'),
        getMessagesFromChat: emby.getMessagesFromChat('c1'),
        sendMessage: emby.sendMessage('c1', { id: 'u1', name: 'U' }, undefined, 'hi'),
        updateMessage: emby.updateMessage('c1', 'm1', { text: 'x' }),
        deleteMessage: emby.deleteMessage('c1', 'm1'),
        sendTyping: emby.sendTyping('c1', 'u1'),
        addParticipantsToChat: emby.addParticipantsToChat('c1', [{ id: 'p1' }]),
        createChat: emby.createChat({ id: 'c1', title: 'T', type: 'group' }),
        updateChat: emby.updateChat('c1', {}),
        deleteChat: emby.deleteChat('c1'),
        getChatParticipants: emby.getChatParticipants('c1'),
        removeParticipantFromChat: emby.removeParticipantFromChat('c1', 'u1'),
        createUser: emby.createUser({ id: 'u1', name: 'U' }),
        getUser: emby.getUser('u1'),
        updateUser: emby.updateUser('u1', {}),
        deleteUser: emby.deleteUser('u1'),
        getUserChats: emby.getUserChats('u1'),
    };
}
type WrapperReturns = ReturnType<typeof _wrapperReturns>;

export type _wGetChats = Expect<Equal<Awaited<WrapperReturns['getChats']>, ChatListResponse>>;
export type _wGetChatInfo = Expect<Equal<Awaited<WrapperReturns['getChatInfo']>, ChatShowResponse>>;
export type _wGetMessages = Expect<Equal<Awaited<WrapperReturns['getMessagesFromChat']>, ChatMessagesResponse>>;
export type _wSendMessage = Expect<Equal<Awaited<WrapperReturns['sendMessage']>, ChatSendMessageResponse>>;
export type _wUpdateMessage = Expect<Equal<Awaited<WrapperReturns['updateMessage']>, ChatUpdateMessageResponse>>;
export type _wDeleteMessage = Expect<Equal<Awaited<WrapperReturns['deleteMessage']>, ChatUpdateMessageResponse>>;
export type _wSendTyping = Expect<Equal<Awaited<WrapperReturns['sendTyping']>, ChatSendTypingResponse>>;
export type _wAddParticipants = Expect<
    Equal<Awaited<WrapperReturns['addParticipantsToChat']>, ChatAddParticipantsResponse>
>;
export type _wCreateChat = Expect<Equal<Awaited<WrapperReturns['createChat']>, ChatCreateResponse>>;
export type _wUpdateChat = Expect<Equal<Awaited<WrapperReturns['updateChat']>, ChatUpdateResponse>>;
export type _wDeleteChat = Expect<Equal<Awaited<WrapperReturns['deleteChat']>, ChatDeleteResponse>>;
export type _wGetChatParticipants = Expect<
    Equal<Awaited<WrapperReturns['getChatParticipants']>, ChatParticipantsResponse>
>;
export type _wRemoveParticipant = Expect<
    Equal<Awaited<WrapperReturns['removeParticipantFromChat']>, ChatDeleteParticipantsResponse>
>;
export type _wCreateUser = Expect<Equal<Awaited<WrapperReturns['createUser']>, UserCreateResponse>>;
export type _wGetUser = Expect<Equal<Awaited<WrapperReturns['getUser']>, UserShowResponse>>;
export type _wUpdateUser = Expect<Equal<Awaited<WrapperReturns['updateUser']>, UserUpdateResponse>>;
export type _wDeleteUser = Expect<Equal<Awaited<WrapperReturns['deleteUser']>, UserDeleteResponse>>;
export type _wGetUserChats = Expect<Equal<Awaited<WrapperReturns['getUserChats']>, UserChatsResponse>>;

// ─────────────────────────────────────────────────────────────────────────────
// `.api.*` methods WITHOUT a hand-written wrapper. Unlike the wrapper defaults
// above (typed by hand), these `<T = XResponse>` defaults are emitted by the
// codegen — so each assertion guards against the generator pairing an operation
// with the wrong response type (a bad typeName in the emitted signature makes
// the Equal go false, even when the response type is `unknown`).
//
// Each method gets a typed placeholder of its own input (`Parameters<fn>[0]`,
// never constructed) so the call site type-checks without hand-built request
// bodies; the call site is again what applies the generic default.
// ─────────────────────────────────────────────────────────────────────────────

type Api = Emby['api'];
declare const apiInput: { [K in keyof Api]: Parameters<Api[K]>[0] };

export function _apiOnlyReturns() {
    return {
        chatGetParticipantRights: emby.api.chatGetParticipantRights(apiInput.chatGetParticipantRights),
        chatUpdateParticipantRights: emby.api.chatUpdateParticipantRights(apiInput.chatUpdateParticipantRights),
        chatDeleteParticipantRights: emby.api.chatDeleteParticipantRights(apiInput.chatDeleteParticipantRights),
        chatSetWebhook: emby.api.chatSetWebhook(apiInput.chatSetWebhook),
        chatSetS3Credentials: emby.api.chatSetS3Credentials(apiInput.chatSetS3Credentials),
        userAddFcmToken: emby.api.userAddFcmToken(apiInput.userAddFcmToken),
        tenantSetS3Credentials: emby.api.tenantSetS3Credentials(apiInput.tenantSetS3Credentials),
        tenantSetWebhookSettings: emby.api.tenantSetWebhookSettings(apiInput.tenantSetWebhookSettings),
        tenantSetFirebaseConfigForJs: emby.api.tenantSetFirebaseConfigForJs(apiInput.tenantSetFirebaseConfigForJs),
        tenantSetFirebaseServiceAccount: emby.api.tenantSetFirebaseServiceAccount(
            apiInput.tenantSetFirebaseServiceAccount,
        ),
        tenantSetFirebaseFcmVapid: emby.api.tenantSetFirebaseFcmVapid(apiInput.tenantSetFirebaseFcmVapid),
        tenantSetPushNotificationsSettings: emby.api.tenantSetPushNotificationsSettings(
            apiInput.tenantSetPushNotificationsSettings,
        ),
        tenantClearData: emby.api.tenantClearData(apiInput.tenantClearData),
    };
}
type ApiOnlyReturns = ReturnType<typeof _apiOnlyReturns>;

export type _aChatGetParticipantRights = Expect<
    Equal<Awaited<ApiOnlyReturns['chatGetParticipantRights']>, ChatGetParticipantRightsResponse>
>;
export type _aChatUpdateParticipantRights = Expect<
    Equal<Awaited<ApiOnlyReturns['chatUpdateParticipantRights']>, ChatUpdateParticipantRightsResponse>
>;
export type _aChatDeleteParticipantRights = Expect<
    Equal<Awaited<ApiOnlyReturns['chatDeleteParticipantRights']>, ChatDeleteParticipantRightsResponse>
>;
export type _aChatSetWebhook = Expect<Equal<Awaited<ApiOnlyReturns['chatSetWebhook']>, ChatSetWebhookResponse>>;
export type _aChatSetS3Credentials = Expect<
    Equal<Awaited<ApiOnlyReturns['chatSetS3Credentials']>, ChatSetS3CredentialsResponse>
>;
export type _aUserAddFcmToken = Expect<Equal<Awaited<ApiOnlyReturns['userAddFcmToken']>, UserAddFcmTokenResponse>>;
export type _aTenantSetS3Credentials = Expect<
    Equal<Awaited<ApiOnlyReturns['tenantSetS3Credentials']>, TenantSetS3CredentialsResponse>
>;
export type _aTenantSetWebhookSettings = Expect<
    Equal<Awaited<ApiOnlyReturns['tenantSetWebhookSettings']>, TenantSetWebhookSettingsResponse>
>;
export type _aTenantSetFirebaseConfigForJs = Expect<
    Equal<Awaited<ApiOnlyReturns['tenantSetFirebaseConfigForJs']>, TenantSetFirebaseConfigForJsResponse>
>;
export type _aTenantSetFirebaseServiceAccount = Expect<
    Equal<Awaited<ApiOnlyReturns['tenantSetFirebaseServiceAccount']>, TenantSetFirebaseServiceAccountResponse>
>;
export type _aTenantSetFirebaseFcmVapid = Expect<
    Equal<Awaited<ApiOnlyReturns['tenantSetFirebaseFcmVapid']>, TenantSetFirebaseFcmVapidResponse>
>;
export type _aTenantSetPushNotificationsSettings = Expect<
    Equal<Awaited<ApiOnlyReturns['tenantSetPushNotificationsSettings']>, TenantSetPushNotificationsSettingsResponse>
>;
export type _aTenantClearData = Expect<Equal<Awaited<ApiOnlyReturns['tenantClearData']>, TenantClearDataResponse>>;
