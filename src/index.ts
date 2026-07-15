import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import * as querystring from 'node:querystring';
import {
    type ChatAddParticipantsResponse,
    type ChatCreateInput,
    type ChatCreateResponse,
    type ChatDeleteParticipantRightsResponse,
    type ChatDeleteParticipantsResponse,
    type ChatDeleteResponse,
    type ChatGetParticipantRightsResponse,
    type ChatListInput,
    type ChatListResponse,
    type ChatMessagesInput,
    type ChatMessagesResponse,
    type ChatParticipantsInput,
    type ChatParticipantsResponse,
    type ChatSendMessageInput,
    type ChatSendMessageResponse,
    type ChatSendTypingResponse,
    type ChatShowResponse,
    type ChatUpdateInput,
    type ChatUpdateMessageResponse,
    type ChatUpdateParticipantRightsInput,
    type ChatUpdateParticipantRightsResponse,
    type ChatUpdateResponse,
    createOperations,
    type Operations,
    type UserChatsInput,
    type UserChatsResponse,
    type UserCreateResponse,
    type UserDeleteResponse,
    type UserShowResponse,
    type UserUpdateInput,
    type UserUpdateResponse,
} from './generated/operations.js';

// Convenience aliases for query/body slots — used when hand-written methods
// build inputs to delegate into `.api.*`.
type ChatListQuery = NonNullable<NonNullable<ChatListInput>['query']>;
type ChatMessagesQuery = NonNullable<NonNullable<ChatMessagesInput>['query']>;
type ChatSendMessageBody = ChatSendMessageInput['body'];
type ChatCreateBody = ChatCreateInput['body'];
type ChatUpdateBody = ChatUpdateInput['body'];
type ChatUpdateParticipantRightsBody = ChatUpdateParticipantRightsInput['body'];
type ChatParticipantsQuery = NonNullable<NonNullable<ChatParticipantsInput>['query']>;
type UserUpdateBody = UserUpdateInput['body'];
type UserChatsQuery = NonNullable<NonNullable<UserChatsInput>['query']>;

import * as _ from './libs/helpers.js';
import processUserRights from './libs/processUserRights.js';
import {
    type RequestControlOptions,
    type ResolvedRequestOptions,
    resolveControlOverrides,
    resolveRequestOptions,
    TimeoutError,
} from './libs/requestOptions.js';
import { backoffDelay, parseRetryAfter, shouldRetry, sleep } from './libs/retry.js';
import {
    addToSignature,
    appendLegacy,
    coerceBooleansForWire,
    flatten,
    normalizeChat,
    normalizeData,
    normalizeParticipant,
    strRandom,
} from './libs/signing.js';

import type {
    ChatCreate,
    ChatInput,
    ChatUpdate,
    ExtraMap,
    GetChatMessagesQuery,
    GetChatsQuery,
    GetUserChatsQuery,
    MessageButton,
    MessageInput,
    PaginationQuery,
    Participant,
    UrlRecipient,
    User,
    UserRights,
} from './types.js';

/**
 * Request-reliability options, passed once at construction under `options`.
 * Values are Zod-validated (see `resolveRequestOptions`) — bad input throws.
 */
export interface EmbyRequestOptions {
    /**
     * Per-attempt timeout in milliseconds before the request is aborted and the
     * promise rejects with a `TimeoutError`. `0` disables it. Defaults to `30000`.
     */
    timeout?: number;
    /**
     * Retry attempts after the first failure (0 disables). Defaults to `2`.
     * GET/DELETE retry on network errors, 5xx and 429; POST/PUT retry only on 429
     * (honoring `Retry-After`) and connection errors that never reached the server.
     */
    retries?: number;
    /** Base backoff delay in ms (exponential with jitter between attempts). Defaults to `200`. */
    retryDelay?: number;
}

export interface EmbyConfig {
    id?: string;
    secret?: string;
    api_token?: string;
    base_url?: string;
    api_url?: string;
    /** Request-reliability options (timeout, …). See {@link EmbyRequestOptions}. */
    options?: EmbyRequestOptions;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

export interface UrlUserOptions extends Partial<User> {
    session?: string;
    rights?: UserRights;
    /**
     * URL-signing flow accepts an `is_bot` flag on the user itself (the current
     * viewer can be a bot). Validated by `ChatIndexRequest.rules()` —
     * `'user.is_bot' => 'boolean'`.
     */
    is_bot?: boolean;
}

export interface UrlOptions {
    chat?: ChatInput | string | null;
    user: UrlUserOptions;
    /**
     * URL-signing recipients — stricter than REST `Participant` (name required,
     * picture must be a URL). See `UrlRecipient` docstring and
     * emby/app/Http/Requests/ChatIndexRequest.php `rules()`.
     */
    participants?: UrlRecipient[];
    extra?: Record<string, unknown>;
}

export interface UpdateMessageInput {
    text?: string;
    isDeleted?: boolean;
    extra?: ExtraMap;
    buttons?: MessageButton[];
}

export interface UpdateMessageOptions {
    replaceExtra?: boolean;
    returnMessage?: boolean;
}

/** Convenience alias used by `sendMessage` — accepts the object shape or a string id. */
export type ChatArg = ChatInput | string;
export type MessageTextInput = string | { text: string; recipient_id?: string };

export class Emby {
    clientId?: string;
    clientSecret?: string;
    apiToken?: string;
    baseUrl?: string;
    apiUrl?: string;

    /**
     * Auto-generated, Zod-validated API methods — one per operationId in openapi.yml.
     * Regenerated via `npm run generate`. Complements the hand-written high-level methods below.
     */
    readonly api: Operations;

    /** Validated request-reliability options (timeout, …), resolved at construction. */
    readonly requestOptions: ResolvedRequestOptions;

    constructor(config: EmbyConfig = {}) {
        this.clientId = config.id;
        this.clientSecret = config.secret;
        this.apiToken = config.api_token;
        this.baseUrl = config.base_url;
        this.apiUrl = config.api_url || this.baseUrl;

        if (_.isString(this.baseUrl)) {
            this.baseUrl = this.baseUrl.replace(/\/+$/g, '');
        }

        // Throws a ZodError on invalid options (e.g. a negative timeout).
        this.requestOptions = resolveRequestOptions(config.options);

        this.api = createOperations(this);
    }

    requestApi<T = unknown>(
        method: string,
        params: Record<string, unknown> = {},
        type: HttpMethod = 'get',
        version = 'v1',
        query?: Record<string, unknown>,
        headers?: Record<string, unknown>,
        control?: RequestControlOptions,
    ): Promise<T> {
        let sParams = '';

        let _url = `${this.apiUrl}/api/${version}/${method}`;

        const isBodyMethod = type === 'post' || type === 'put';
        if (isBodyMethod) {
            if (query && Object.keys(query).length > 0) {
                _url += `?${querystring.stringify(flatten(query) as querystring.ParsedUrlQueryInput)}`;
            }
        } else {
            const merged = query ? { ...params, ...query } : params;
            _url += `?${querystring.stringify(flatten(merged) as querystring.ParsedUrlQueryInput)}`;
        }

        _url = encodeURI(_url);

        const urlObj = new URL(_url);

        const options: http.RequestOptions = {
            method: type.toUpperCase(),
            hostname: urlObj.hostname,
            port: urlObj.port || undefined,
            path: `${urlObj.pathname}${urlObj.search}`,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiToken}`,
                ...(headers as Record<string, string> | undefined),
            },
        };

        if (isBodyMethod) {
            sParams = JSON.stringify(params);
        }

        // Per-call options override the instance defaults for this request. The
        // numeric overrides run through the same bounds as the instance options, so a
        // bad `retries`/`timeout`/`retryDelay` throws instead of slipping through.
        const signal = control?.signal;
        const overrides = resolveControlOverrides(control);
        const timeout = overrides.timeout ?? this.requestOptions.timeout;
        const retries = overrides.retries ?? this.requestOptions.retries;
        const retryDelay = overrides.retryDelay ?? this.requestOptions.retryDelay;

        const attempt = () =>
            new Promise<T>((resolve, reject) => {
                const transport = urlObj.protocol === 'https:' ? https : http;

                // Node 16 has no AbortSignal.timeout/any, so one controller is aborted
                // by whichever fires first: the timeout timer or the caller's signal.
                const controller = new AbortController();
                options.signal = controller.signal;

                const onExternalAbort = () => controller.abort();
                if (signal) {
                    if (signal.aborted) controller.abort();
                    else signal.addEventListener('abort', onExternalAbort, { once: true });
                }

                let timedOut = false;
                let timer: NodeJS.Timeout | undefined;
                if (timeout > 0) {
                    timer = setTimeout(() => {
                        timedOut = true;
                        controller.abort();
                    }, timeout);
                    // A pending timeout must not keep the process alive.
                    timer.unref();
                }
                const cleanup = () => {
                    if (timer) clearTimeout(timer);
                    if (signal) signal.removeEventListener('abort', onExternalAbort);
                };

                const request = transport
                    .request(options, (res) => {
                        let body: unknown = '';
                        res.setEncoding('utf8');
                        res.on('data', (chunk: string) => {
                            body = `${body}${chunk}`;
                        });
                        res.on('end', () => {
                            cleanup();
                            const contentType = res.headers['content-type'];
                            if (contentType?.startsWith('application/json')) {
                                try {
                                    body = JSON.parse(body as string);
                                } catch (e) {
                                    reject(e as Error);
                                    return;
                                }
                            }

                            const status = res.statusCode ?? 0;
                            if (status >= 200 && status < 400) {
                                resolve(body as T);
                            } else {
                                const message = typeof body === 'string' ? body : JSON.stringify(body);
                                const e = new Error(message) as Error & {
                                    status?: number;
                                    body?: unknown;
                                    headers?: http.IncomingHttpHeaders;
                                };
                                e.status = status;
                                e.body = body;
                                e.headers = res.headers; // carries Retry-After for 429 retries
                                reject(e);
                            }
                        });
                    })
                    .on('error', (e) => {
                        cleanup();
                        // Caller cancellation vs timeout vs a real transport error.
                        if (signal?.aborted) reject(signal.reason ?? e);
                        else if (timedOut) reject(new TimeoutError(timeout, method));
                        else reject(e);
                    });

                if (sParams.length) {
                    request.write(sParams);
                }

                request.end();
            });

        return this.runWithRetry(attempt, type, retries, retryDelay, signal);
    }

    /** Run `attempt`, retrying failures per the method's idempotency + backoff options. */
    private async runWithRetry<T>(
        attempt: () => Promise<T>,
        method: HttpMethod,
        retries: number,
        retryDelay: number,
        signal?: AbortSignal,
    ): Promise<T> {
        const total = Math.max(1, retries + 1);
        let lastError: unknown;
        for (let n = 0; n < total; n++) {
            try {
                return await attempt();
            } catch (err) {
                lastError = err;
                if (signal?.aborted) throw err; // caller cancelled — never retry
                if (n + 1 >= total || !shouldRetry(method, err)) break;
                const headers = (err as { headers?: http.IncomingHttpHeaders }).headers;
                // A cancel during the backoff wait rejects the sleep and propagates out.
                await sleep(backoffDelay(n, retryDelay, parseRetryAfter(headers?.['retry-after'])), signal);
            }
        }
        throw lastError;
    }

    url({ chat = null, user, participants = [], extra = {} }: UrlOptions): string {
        if (!this.clientId) {
            throw new Error('To generate chat URL client id is required, please set it in the constructor config');
        }
        if (!this.clientSecret) {
            throw new Error('To generate chat URL client secret is required, please set it in the constructor config');
        }

        let chatData: Record<string, unknown> | null;
        if (_.isPlainObject(chat)) {
            chatData = normalizeChat(chat);
        } else if (_.isString(chat)) {
            chatData = { id: chat };
        } else {
            chatData = null;
        }

        let userData: Record<string, unknown>;
        if (_.isPlainObject(user)) {
            userData = normalizeData(user, {
                id: null,
                name: null,
                email: null,
                picture: null,
                rights: {
                    process: (data: unknown) => {
                        if (_.isFilledPlainObject(data)) {
                            const userRights = processUserRights(data as Record<string, unknown>);
                            if (userRights && Object.keys(userRights).length) {
                                return userRights;
                            }
                        }
                        return undefined;
                    },
                },
                session: {
                    process: (data: unknown) => {
                        if (!(user as UrlUserOptions).id) {
                            return _.isString(data) ? data : strRandom(40);
                        }
                        return undefined;
                    },
                },
            });
        } else {
            throw new Error('user parameter have to be a plain object');
        }

        const nonce = strRandom(32);

        let signatureParams: unknown[] = [this.clientId, nonce];

        const queryParams: Record<string, unknown> = {
            nonce,
            user: userData,
            recipients: [] as Record<string, unknown>[],
        };

        signatureParams = addToSignature(signatureParams, userData, [
            'id',
            'name',
            'email',
            'link',
            'picture',
            'rights',
        ]);

        participants.forEach((participant) => {
            const normalized = normalizeData(participant, {
                id: null,
                name: null,
                is_bot: { default: false },
            });
            (queryParams.recipients as Record<string, unknown>[]).push(normalized);
            signatureParams = addToSignature(signatureParams, normalized, ['id', 'name']);
        });

        if (chatData) {
            signatureParams = addToSignature(signatureParams, chatData, ['id', 'title', 'socket_port', 'create']);
            queryParams.chat = chatData;
        }

        queryParams.signature = crypto
            .createHmac('sha256', this.clientSecret)
            .update(signatureParams.join(','))
            .digest('hex');

        Object.keys(extra).forEach((key) => {
            queryParams[key] = extra[key];
        });

        // Laravel's `boolean` validator rejects 'true'/'false' wire — coerce bools to 1/0
        // AFTER signing (signature kept booleans to match PHP appendFieldsFixed/packField).
        const wire = coerceBooleansForWire(queryParams) as Record<string, unknown>;

        const query = querystring.stringify(flatten(wire) as querystring.ParsedUrlQueryInput);

        return `${this.baseUrl}?${query}`;
    }

    urlByChatId(
        chat: ChatInput | string = {},
        user: UrlUserOptions = {},
        participants: UrlRecipient[] = [],
        extra: Record<string, unknown> = {},
    ): string {
        if (!this.clientId) {
            throw new Error('To generate chat URL client id is required, please set it in the constructor config');
        }
        if (!this.clientSecret) {
            throw new Error('To generate chat URL client secret is required, please set it in the constructor config');
        }

        let chatData: Record<string, unknown>;
        if (_.isPlainObject(chat)) {
            chatData = normalizeChat(chat);
        } else if (_.isString(chat)) {
            chatData = { id: chat };
        } else {
            throw new Error('first parameter(chat) have to be a plain object or string');
        }

        if (!_.isString(chatData.id)) {
            throw new Error("chat id isn't passed");
        }

        let userData: Record<string, unknown>;
        if (_.isPlainObject(user)) {
            userData = normalizeData(user, {
                id: null,
                name: null,
                email: null,
                picture: null,
                rights: {
                    process: (data: unknown) => {
                        if (_.isFilledPlainObject(data)) {
                            const userRights = processUserRights(data as Record<string, unknown>);
                            if (userRights && Object.keys(userRights).length) {
                                return userRights;
                            }
                        }
                        return undefined;
                    },
                },
                session: {
                    process: (data: unknown) => {
                        if (!(user as UrlUserOptions).id) {
                            return _.isString(data) ? data : strRandom(40);
                        }
                        return undefined;
                    },
                },
            });
        } else {
            throw new Error('second parameter(user) have to be a plain object');
        }

        const nonce = strRandom(32);

        let signatureParams: unknown[] = [this.clientSecret, nonce];

        const queryParams: Record<string, unknown> = {
            nonce,
            chat: chatData,
            user: userData,
            recipients: [] as Record<string, unknown>[],
        };

        // Match backend's `verifyLegacyMd5` / `appendInfoLegacy`:
        //   - user filter excludes `link` (backend whitelist: id, name, email, picture)
        //   - recipients filter includes email + picture (backend: id, name, email, picture)
        //   - chat filter includes `list`, excludes `type`/`metadata`
        //   - each section is ksorted (alphabetical) + skips nulls + bool→'true'/'false'
        signatureParams = appendLegacy(signatureParams, userData, ['id', 'name', 'email', 'picture']);

        participants.forEach((participant) => {
            const normalized = normalizeData(participant, {
                id: null,
                name: null,
                email: null,
                link: null,
                picture: null,
                is_bot: { default: false },
            });
            (queryParams.recipients as Record<string, unknown>[]).push(normalized);
            signatureParams = appendLegacy(signatureParams, normalized, ['id', 'name', 'email', 'picture']);
        });

        signatureParams = appendLegacy(signatureParams, chatData, ['id', 'list', 'title', 'socket_port', 'create']);

        const sigInput = signatureParams.join(',');
        queryParams.signature = crypto.createHash('md5').update(sigInput).digest('hex');

        Object.keys(extra).forEach((key) => {
            queryParams[key] = extra[key];
        });

        // Laravel's `boolean` validator rejects 'true'/'false' wire — coerce bools to 1/0
        // AFTER signing (signature kept booleans to match PHP appendInfoLegacy string form).
        const wire = coerceBooleansForWire(queryParams) as Record<string, unknown>;

        const query = querystring.stringify(flatten(wire) as querystring.ParsedUrlQueryInput);

        return `${this.baseUrl}?${query}`;
    }

    getChats<T = ChatListResponse>(queryParams: GetChatsQuery = {}): Promise<T> {
        if (!_.isPlainObject(queryParams)) {
            throw new Error('queryParams must be a plain object');
        }

        const query: Partial<ChatListQuery> = {
            page: Math.max(parseInt(String(queryParams.page), 10) || 1, 1),
            limit: Math.min(parseInt(String(queryParams.limit), 10) || 1, 1000),
        };

        for (const key of [
            'type',
            'owner',
            'created_from',
            'created_to',
            'last_message_from',
            'last_message_to',
        ] as const) {
            const raw = (queryParams as Record<string, unknown>)[key];
            if (!_.isNoValue(raw) && _.isString(raw) && raw.length > 0) {
                (query as Record<string, unknown>)[key] = raw;
            }
        }

        // with_owners: lenient input (bool/yes/on/1/0/numeric) → spec wire integer 0|1.
        if (!_.isNoValue(queryParams.with_owners)) {
            const raw = queryParams.with_owners as unknown;
            if (_.isBoolean(raw)) {
                query.with_owners = raw ? 1 : 0;
            } else if (_.isTRUE(raw)) {
                query.with_owners = 1;
            } else if (_.isNumeric(raw)) {
                const n = parseInt(String(raw), 10);
                if (n === 0 || n === 1) query.with_owners = n as 0 | 1;
            }
        }

        if (_.isFilledPlainObject(queryParams.metadata)) {
            query.metadata = queryParams.metadata as ChatListQuery['metadata'];
        }

        return this.api.chatList<T>({ query: query as ChatListQuery });
    }

    getChatInfo<T = ChatShowResponse>(id: string): Promise<T> {
        if (!_.isString(id)) {
            throw new Error("chat id isn't passed");
        }
        return this.api.chatShow<T>({ path: { chat_id: id } });
    }

    /**
     * Bug-fix in 1.13: legacy code sent `withUsers=1` (camelCase) — backend silently ignored it.
     * Now coerces to spec `with_users=1` (snake_case + integer wire). Public-API field name
     * remains `with_users` (matches `GetChatMessagesQuery`); legacy `withUsers` callers also accepted.
     */
    getMessagesFromChat<T = ChatMessagesResponse>(
        chatId: string,
        queryParams?: GetChatMessagesQuery,
        page = 1,
        limit = 1,
    ): Promise<T> {
        const query: Partial<ChatMessagesQuery> = {
            page: Math.max(parseInt(String(page), 10), 1),
            limit: Math.min(parseInt(String(limit), 10), 1000),
        };

        if (_.isFilledPlainObject(queryParams)) {
            // extra: keep scalar values; coerce smart-booleans to 'true'/'false' strings
            // so the spec's `Record<string, string>` schema accepts them.
            if (_.isFilledPlainObject(queryParams.extra)) {
                const extraParams: Record<string, string> = {};
                for (const key of Object.keys(queryParams.extra)) {
                    const value = (queryParams.extra as ExtraMap)[key];
                    if (_.isScalar(value)) {
                        extraParams[key] = _.isBoolean(value, true) ? String(_.isTRUE(value)) : String(value);
                    }
                }
                if (Object.keys(extraParams).length) {
                    query.extra = extraParams;
                }
            }

            if (_.isBoolean(queryParams.isDeleted, true)) {
                query.isDeleted = Number(_.isTRUE(queryParams.isDeleted)) as 0 | 1;
            }
            if (_.isBoolean(queryParams.isEdited, true)) {
                query.isEdited = Number(_.isTRUE(queryParams.isEdited)) as 0 | 1;
            }
            // Accept both spec `with_users` and legacy `withUsers` input field names.
            const withUsersRaw = queryParams.with_users ?? (queryParams as { withUsers?: unknown }).withUsers;
            if (_.isBoolean(withUsersRaw, true)) {
                query.with_users = Number(_.isTRUE(withUsersRaw)) as 0 | 1;
            }
        }

        return this.api.chatMessages<T>({ path: { chat_id: chatId }, query: query as ChatMessagesQuery });
    }

    sendMessage<T = ChatSendMessageResponse>(
        chat: ChatArg,
        user: User,
        participants: Participant[] | undefined,
        message: MessageTextInput,
        extra: ExtraMap = {},
        buttons: MessageButton[] = [],
    ): Promise<T> {
        // Build the message item first — text/recipient_id then extras.
        const messageData: { text?: string; recipient_id?: string; extra?: ExtraMap; buttons?: MessageButton[] } = {};

        if (_.isPlainObject(message)) {
            const normalized = normalizeData(message, ['text', 'recipient_id']);
            if (_.isString(normalized.text)) messageData.text = normalized.text;
            if (!_.isNoValue(normalized.recipient_id)) {
                messageData.recipient_id = normalized.recipient_id as string;
            }
        } else if (_.isString(message)) {
            messageData.text = message;
        }

        if (!(_.isString(messageData.text) && messageData.text.length)) {
            throw new Error('message text is required');
        }

        // Resolve chat id (path param) and split off the rest as body.chat (optional).
        let chatData: Record<string, unknown>;
        if (_.isPlainObject(chat)) {
            chatData = normalizeChat(chat);
        } else if (_.isString(chat)) {
            chatData = { id: chat };
        } else {
            throw new Error('first parameter(chat) have to be a plain object or string');
        }

        if (!_.isString(chatData.id)) {
            if (!_.isNumeric(chatData.id)) {
                throw new Error("chat id isn't passed");
            }
            chatData.id = String(chatData.id);
        }

        const chatId = chatData.id as string;
        delete chatData.id;

        if (_.isFilledPlainObject(extra)) messageData.extra = extra;
        if (_.isFilledArray(buttons)) messageData.buttons = buttons;

        // Build body honoring the spec shape: { user (required), chat?, participants?, messages }
        const body: Record<string, unknown> = {
            user,
            messages: [messageData],
        };
        if (Object.keys(chatData).length) body.chat = chatData;
        if (_.isFilledArray(participants)) {
            body.participants = (participants as Participant[]).map(normalizeParticipant);
        }

        return this.api.chatSendMessage<T>({
            path: { chat_id: chatId },
            body: body as ChatSendMessageBody,
        });
    }

    /**
     * Wire-format aligned with spec: `is_deleted` is a boolean (was `'1'` string).
     * `returnMessage` maps to the RFC 7240 `Prefer: return=representation` header
     * (the legacy `return_message` body field and `?result=yes` flag were dropped).
     */
    updateMessage<T = ChatUpdateMessageResponse>(
        chatId: string,
        messageId: string,
        { text, isDeleted = false, extra = {}, buttons = [] }: UpdateMessageInput,
        { replaceExtra = false, returnMessage = false }: UpdateMessageOptions = {},
    ): Promise<T> {
        const messageBody: {
            text?: string;
            is_deleted?: boolean;
            extra?: ExtraMap;
            buttons?: MessageButton[];
        } = {};

        if (_.isString(text) && text.length) {
            messageBody.text = text;
        }
        if (_.isTRUE(isDeleted)) {
            messageBody.is_deleted = true;
            delete messageBody.text;
        }
        if (_.isFilledPlainObject(extra)) {
            messageBody.extra = extra;
        }
        if (_.isFilledArray(buttons)) {
            messageBody.buttons = buttons;
        }

        return this.api.chatUpdateMessage<T>({
            path: { chat_id: chatId, message: messageId },
            header: returnMessage === true ? { Prefer: 'return=representation' } : undefined,
            body: {
                message: messageBody,
                update_extra_mode: replaceExtra === true ? 'replace' : 'merge',
            },
        });
    }

    /**
     * Soft-delete a message. Wire format aligned with the openapi spec (`is_deleted: true` boolean).
     * Backend is lenient — accepts both `true` and `'1'` — but spec is authoritative going forward.
     */
    deleteMessage<T = ChatUpdateMessageResponse>(chatId: string, messageId: string): Promise<T> {
        return this.api.chatUpdateMessage<T>({
            path: { chat_id: chatId, message: messageId },
            body: { message: { is_deleted: true } },
        });
    }

    /**
     * BREAKING (1.13): now sends `PUT /chats/{chat_id}/typing/{user_id}` (no body) per the
     * OpenAPI spec, which is what the backend actually accepts. The previous shape
     * (`PUT /chats/{chat_id}/typing` with `{ user: userId }` body) is no longer used.
     * Verified live; legacy URL silently failed.
     */
    sendTyping<T = ChatSendTypingResponse>(chatId: string, userId: string): Promise<T> {
        return this.api.chatSendTyping<T>({ path: { chat_id: chatId, user_id: userId } });
    }

    addParticipantsToChat<T = ChatAddParticipantsResponse>(
        chatId: string,
        participants: Participant[] = [],
    ): Promise<T> {
        if (!_.isFilledArray(participants)) {
            throw new Error('participants have to be an array of participant objects');
        }
        // normalizeParticipant whitelists fields and applies is_bot default; the result
        // shape matches the chatAddParticipants body schema.
        const normalized = participants.map(normalizeParticipant) as Array<{
            id: string;
            name?: string;
            email?: string;
            link?: string;
            picture?: string;
            is_bot?: boolean;
        }>;
        return this.api.chatAddParticipants<T>({
            path: { chat_id: chatId },
            body: { participants: normalized },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Chat CRUD
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create a chat. Backend requires `participants` for `type: 'private'`.
     *
     * @param chat            Chat fields: { id, title, type, metadata?, owner? }.
     * @param participants    Optional participants array (required for private chats).
     */
    createChat<T = ChatCreateResponse>(chat: ChatCreate, participants?: Participant[]): Promise<T> {
        if (!_.isFilledPlainObject(chat)) {
            throw new Error('chat must be a non-empty object');
        }
        const body: Record<string, unknown> = { chat };
        if (_.isFilledArray(participants)) {
            body.participants = (participants as Participant[]).map(normalizeParticipant);
        }
        return this.api.chatCreate<T>({ body: body as ChatCreateBody });
    }

    /**
     * Update mutable chat fields (title, metadata, id).
     */
    updateChat<T = ChatUpdateResponse>(chatId: string, updates: ChatUpdate = {}): Promise<T> {
        if (!_.isString(chatId)) {
            throw new Error("chat id isn't passed");
        }
        return this.api.chatUpdate<T>({
            path: { chat_id: chatId },
            body: { chat: updates } as ChatUpdateBody,
        });
    }

    /**
     * Delete a chat permanently.
     */
    deleteChat<T = ChatDeleteResponse>(chatId: string): Promise<T> {
        if (!_.isString(chatId)) {
            throw new Error("chat id isn't passed");
        }
        return this.api.chatDelete<T>({ path: { chat_id: chatId } });
    }

    /**
     * List participants of a chat (paginated).
     */
    getChatParticipants<T = ChatParticipantsResponse>(chatId: string, query: PaginationQuery = {}): Promise<T> {
        if (!_.isString(chatId)) {
            throw new Error("chat id isn't passed");
        }
        const q: Partial<ChatParticipantsQuery> = {
            page: Math.max(parseInt(String(query.page), 10) || 1, 1),
            limit: Math.min(parseInt(String(query.limit), 10) || 50, 1000),
        };
        return this.api.chatParticipants<T>({
            path: { chat_id: chatId },
            query: q as ChatParticipantsQuery,
        });
    }

    /**
     * Remove a single participant from a chat by user id.
     */
    removeParticipantFromChat<T = ChatDeleteParticipantsResponse>(chatId: string, userId: string): Promise<T> {
        if (!_.isString(chatId)) {
            throw new Error("chat id isn't passed");
        }
        if (!_.isString(userId)) {
            throw new Error("user id isn't passed");
        }
        return this.api.chatDeleteParticipants<T>({
            path: { chat_id: chatId, user_id: userId },
        });
    }

    /**
     * Read a participant's per-chat right overrides (`GET
     * chats/{chatId}/participants/{userId}/rights`) — the values set via
     * {@link updateParticipantRights}. Rights not overridden here fall back to the
     * participant's signed-link values.
     *
     * @param chatId  Chat id.
     * @param userId  Participant's user id.
     */
    getParticipantRights<T = ChatGetParticipantRightsResponse>(chatId: string, userId: string): Promise<T> {
        if (!_.isString(chatId)) {
            throw new Error("chat id isn't passed");
        }
        if (!_.isString(userId)) {
            throw new Error("user id isn't passed");
        }
        return this.api.chatGetParticipantRights<T>({
            path: { chat_id: chatId, user_id: userId },
        });
    }

    /**
     * Override a participant's rights for a single chat (`PUT
     * chats/{chatId}/participants/{userId}/rights`). Every right is optional but at
     * least one must be given; each present value fully replaces the participant's
     * signed-link value for this chat, and an explicit `null` clears the override
     * (they fall back to the link value). Changes propagate live over the socket.
     *
     * @param chatId  Chat id.
     * @param userId  Participant's user id.
     * @param rights  Per-chat right overrides — booleans accept `true`/`false`/`null`;
     *                `edit_messages`/`delete_messages` are `none|my|any`, `pin_messages`
     *                is `none|for_me|for_everyone`.
     */
    updateParticipantRights<T = ChatUpdateParticipantRightsResponse>(
        chatId: string,
        userId: string,
        rights: ChatUpdateParticipantRightsBody,
    ): Promise<T> {
        if (!_.isString(chatId)) {
            throw new Error("chat id isn't passed");
        }
        if (!_.isString(userId)) {
            throw new Error("user id isn't passed");
        }
        if (!_.isFilledPlainObject(rights)) {
            throw new Error('rights must be a non-empty object');
        }
        return this.api.chatUpdateParticipantRights<T>({
            path: { chat_id: chatId, user_id: userId },
            body: rights,
        });
    }

    /**
     * Clear **all** of a participant's per-chat right overrides (`DELETE
     * chats/{chatId}/participants/{userId}/rights`). The participant falls back
     * entirely to their signed-link rights. Propagates live over the socket.
     *
     * @param chatId  Chat id.
     * @param userId  Participant's user id.
     */
    deleteParticipantRights<T = ChatDeleteParticipantRightsResponse>(chatId: string, userId: string): Promise<T> {
        if (!_.isString(chatId)) {
            throw new Error("chat id isn't passed");
        }
        if (!_.isString(userId)) {
            throw new Error("user id isn't passed");
        }
        return this.api.chatDeleteParticipantRights<T>({
            path: { chat_id: chatId, user_id: userId },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // User CRUD
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create a user.
     */
    createUser<T = UserCreateResponse>(user: User): Promise<T> {
        if (!_.isFilledPlainObject(user)) {
            throw new Error('user must be a non-empty object');
        }
        return this.api.userCreate<T>({ body: { user } });
    }

    /**
     * Get a user by id.
     */
    getUser<T = UserShowResponse>(userId: string): Promise<T> {
        if (!_.isString(userId)) {
            throw new Error("user id isn't passed");
        }
        return this.api.userShow<T>({ path: { user_id: userId } });
    }

    /**
     * Update mutable user fields.
     */
    updateUser<T = UserUpdateResponse>(userId: string, updates: Partial<User> = {}): Promise<T> {
        if (!_.isString(userId)) {
            throw new Error("user id isn't passed");
        }
        return this.api.userUpdate<T>({
            path: { user_id: userId },
            body: { user: updates } as UserUpdateBody,
        });
    }

    /**
     * Delete a user permanently.
     */
    deleteUser<T = UserDeleteResponse>(userId: string): Promise<T> {
        if (!_.isString(userId)) {
            throw new Error("user id isn't passed");
        }
        return this.api.userDelete<T>({ path: { user_id: userId } });
    }

    /**
     * List chats associated with a user (paginated, filterable by metadata / read state / order).
     */
    getUserChats<T = UserChatsResponse>(userId: string, query: GetUserChatsQuery = {}): Promise<T> {
        if (!_.isString(userId)) {
            throw new Error("user id isn't passed");
        }
        const q: Partial<UserChatsQuery> = {
            page: Math.max(parseInt(String(query.page), 10) || 1, 1),
            limit: Math.min(parseInt(String(query.limit), 10) || 50, 1000),
        };
        if (query.order === 'asc' || query.order === 'desc') {
            q.order = query.order;
        }
        if (_.isBoolean(query.read)) {
            q.read = query.read;
        }
        if (_.isFilledPlainObject(query.metadata)) {
            q.metadata = query.metadata as UserChatsQuery['metadata'];
        }
        // Coerce to integer 0/1 wire — Laravel's `boolean` rule on the backend rejects
        // the string "true"/"false" that querystring.stringify would emit for a bool.
        if (_.isBoolean(query.with_last_message)) {
            q.with_last_message = query.with_last_message ? 1 : 0;
        }
        return this.api.userChats<T>({
            path: { user_id: userId },
            query: q as UserChatsQuery,
        });
    }
}

export default Emby;
export { TimeoutError } from './libs/requestOptions.js';
export * from './types.js';
