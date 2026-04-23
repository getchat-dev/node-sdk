import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import * as querystring from 'node:querystring';

import * as _ from './libs/helpers.js';
import processUserRights from './libs/processUserRights.js';
import {
    addToSignature,
    flatten,
    normalizeChat,
    normalizeData,
    normalizeParticipant,
    strRandom,
} from './libs/signing.js';

import type {
    ChatCreate,
    GetChatMessagesQuery,
    GetChatsQuery,
    MessageButton,
    MessageInput,
    Participant,
    StringMap,
    User,
    UserRights,
} from './types.js';

export interface EmbyConfig {
    id?: string;
    secret?: string;
    api_token?: string;
    base_url?: string;
    api_url?: string;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

export interface UrlUserOptions extends Partial<User> {
    session?: string;
    rights?: UserRights;
}

export interface UrlOptions {
    chat?: Partial<ChatCreate> | string | null;
    user: UrlUserOptions;
    participants?: Participant[];
    extra?: Record<string, unknown>;
}

export interface UpdateMessageInput {
    text?: string;
    isDeleted?: boolean;
    extra?: StringMap;
    buttons?: MessageButton[];
}

export interface UpdateMessageOptions {
    replaceExtra?: boolean;
    returnMessage?: boolean;
}

export type ChatInput = Partial<ChatCreate> | string;
export type MessageTextInput = string | { text: string; recipient_id?: string };

export class Emby {
    clientId?: string;
    clientSecret?: string;
    apiToken?: string;
    baseUrl?: string;
    apiUrl?: string;

    constructor(config: EmbyConfig = {}) {
        this.clientId = config.id;
        this.clientSecret = config.secret;
        this.apiToken = config.api_token;
        this.baseUrl = config.base_url;
        this.apiUrl = config.api_url || this.baseUrl;

        if (_.isString(this.baseUrl)) {
            this.baseUrl = this.baseUrl.replace(/\/+$/g, '');
        }
    }

    requestApi<T = unknown>(
        method: string,
        params: Record<string, unknown> = {},
        type: HttpMethod = 'get',
        version = 'v1',
    ): Promise<T> {
        let sParams = '';

        let _url = `${this.apiUrl}/api/${version}/${method}`;

        if (!(type === 'post' || type === 'put')) {
            _url += `?${querystring.stringify(flatten(params) as querystring.ParsedUrlQueryInput)}`;
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
            },
        };

        if (type === 'post' || type === 'put') {
            sParams = JSON.stringify(params);
        }

        return new Promise<T>((resolve, reject) => {
            const transport = urlObj.protocol === 'https:' ? https : http;
            const request = transport
                .request(options, (res) => {
                    let body: unknown = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk: string) => {
                        body = `${body}${chunk}`;
                    });
                    res.on('end', () => {
                        const contentType = res.headers['content-type'];
                        if (contentType?.startsWith('application/json')) {
                            try {
                                body = JSON.parse(body as string);
                            } catch (e) {
                                reject(e as Error);
                            }
                        }

                        const status = res.statusCode ?? 0;
                        if (status >= 200 && status < 400) {
                            resolve(body as T);
                        } else {
                            const e = new Error(body as string) as Error & { status?: number };
                            e.status = status;
                            reject(e);
                        }
                    });
                })
                .on('error', (e) => {
                    reject(e);
                });

            if (sParams.length) {
                request.write(sParams);
            }

            request.end();
        });
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

        const query = querystring.stringify(flatten(queryParams) as querystring.ParsedUrlQueryInput);

        return `${this.baseUrl}?${query}`;
    }

    urlByChatId(
        chat: ChatInput = {},
        user: UrlUserOptions = {},
        participants: Participant[] = [],
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

        signatureParams = addToSignature(signatureParams, userData, ['id', 'name', 'email', 'link', 'picture']);

        participants.forEach((participant) => {
            const normalized = normalizeData(participant, {
                id: null,
                name: null,
                is_bot: { default: false },
            });
            (queryParams.recipients as Record<string, unknown>[]).push(normalized);
            signatureParams = addToSignature(signatureParams, normalized, ['id', 'name']);
        });

        signatureParams = addToSignature(signatureParams, chatData, ['id', 'title', 'socket_port', 'create']);

        queryParams.signature = crypto.createHash('md5').update(signatureParams.join(',')).digest('hex');

        Object.keys(extra).forEach((key) => {
            queryParams[key] = extra[key];
        });

        const query = querystring.stringify(flatten(queryParams) as querystring.ParsedUrlQueryInput);

        return `${this.baseUrl}?${query}`;
    }

    getChats<T = unknown>(queryParams: GetChatsQuery = {}): Promise<T> {
        if (!_.isPlainObject(queryParams)) {
            throw new Error('queryParams must be a plain object');
        }

        const params: Record<string, unknown> = {};

        params.page = Math.max(parseInt(String(queryParams.page), 10) || 1, 1);
        params.limit = Math.min(parseInt(String(queryParams.limit), 10) || 1, 1000);

        const availableParams = [
            'type',
            'owner',
            'with_owners',
            'created_from',
            'created_to',
            'last_message_from',
            'last_message_to',
        ] as const;

        availableParams.forEach((key) => {
            const raw = (queryParams as Record<string, unknown>)[key];
            if (_.isNoValue(raw)) return;

            if (key === 'with_owners') {
                if (_.isBoolean(raw) || _.isTRUE(raw)) {
                    params[key] = 1;
                } else if (_.isNumeric(raw)) {
                    params[key] = parseInt(String(raw), 10);
                }
            } else if (_.isString(raw) && raw.length > 0) {
                params[key] = raw;
            }
        });

        if (_.isFilledPlainObject(queryParams.metadata)) {
            params.metadata = queryParams.metadata;
        }

        return this.requestApi<T>('chats', params, 'get');
    }

    getChatInfo<T = unknown>(id: string): Promise<T> {
        if (!_.isString(id)) {
            throw new Error("chat id isn't passed");
        }
        return this.requestApi<T>(`chats/${id}`);
    }

    getMessagesFromChat<T = unknown>(
        chatId: string,
        queryParams?: GetChatMessagesQuery,
        page = 1,
        limit = 1,
    ): Promise<T> {
        const clampedLimit = Math.min(parseInt(String(limit), 10), 1000);
        const clampedPage = Math.max(parseInt(String(page), 10), 1);

        let params: Record<string, unknown> = {
            page: clampedPage,
            limit: clampedLimit,
        };

        if (_.isFilledPlainObject(queryParams)) {
            const merged: Record<string, unknown> = {};

            if (_.isFilledPlainObject(queryParams.extra)) {
                const extraParams: Record<string, unknown> = {};

                Object.keys(queryParams.extra).forEach((key) => {
                    const value = (queryParams.extra as StringMap)[key];
                    if (_.isScalar(value)) {
                        extraParams[key] = _.isBoolean(value, true) ? _.isTRUE(value) : value;
                    }
                });

                if (Object.keys(extraParams).length) {
                    merged.extra = extraParams;
                }
            }

            if (_.isBoolean(queryParams.isDeleted, true)) {
                merged.isDeleted = Number(_.isTRUE(queryParams.isDeleted));
            }
            if (_.isBoolean(queryParams.isEdited, true)) {
                merged.isEdited = Number(_.isTRUE(queryParams.isEdited));
            }
            if (_.isBoolean((queryParams as { withUsers?: unknown }).withUsers, true)) {
                merged.withUsers = Number(_.isTRUE((queryParams as { withUsers?: unknown }).withUsers));
            }

            if (Object.keys(merged).length) {
                params = { ...params, ...merged };
            }
        }

        return this.requestApi<T>(`chats/${chatId}/messages`, params);
    }

    sendMessage<T = unknown>(
        chat: ChatInput,
        user: User,
        participants: Participant[] | undefined,
        message: MessageTextInput,
        extra: StringMap = {},
        buttons: MessageButton[] = [],
    ): Promise<T> {
        const queryParams: Record<string, unknown> = {
            user,
            participants,
        };

        const messageData: Record<string, unknown> = {};

        if (_.isPlainObject(message)) {
            const normalized = normalizeData(message, ['text', 'recipient_id']);
            if (_.isString(normalized.text)) {
                messageData.text = normalized.text;
            }
            if (!_.isNoValue(normalized.recipient_id)) {
                messageData.recipient_id = normalized.recipient_id;
            }
        } else if (_.isString(message)) {
            messageData.text = message;
        }

        if (!(_.isString(messageData.text) && (messageData.text as string).length)) {
            throw new Error('message text is required');
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
            if (!_.isNumeric(chatData.id)) {
                throw new Error("chat id isn't passed");
            }
            chatData.id = String(chatData.id);
        }

        const chatId = chatData.id as string;
        delete chatData.id;
        if (Object.keys(chatData).length) {
            queryParams.chat = chatData;
        }

        if (_.isFilledPlainObject(extra)) {
            messageData.extra = extra;
        }

        if (_.isFilledArray(buttons)) {
            messageData.buttons = buttons;
        }

        if (_.isFilledArray(participants)) {
            const normalized = (participants as Participant[]).map(normalizeParticipant);
            if (_.isFilledArray(normalized)) {
                queryParams.participants = normalized;
            }
        }

        queryParams.messages = [messageData];

        return this.requestApi<T>(`chats/${chatId}/messages`, queryParams, 'post');
    }

    updateMessage<T = unknown>(
        chatId: string,
        messageId: string,
        { text, isDeleted = false, extra = {}, buttons = [] }: UpdateMessageInput,
        { replaceExtra = false, returnMessage = false }: UpdateMessageOptions = {},
    ): Promise<T> {
        const params: Record<string, unknown> = { message: {} as Record<string, unknown> };
        const messageBody = params.message as Record<string, unknown>;

        if (_.isString(text) && text.length) {
            messageBody.text = text;
        }

        if (_.isTRUE(isDeleted)) {
            messageBody.is_deleted = '1';
            delete messageBody.text;
        }

        if (_.isFilledPlainObject(extra)) {
            messageBody.extra = extra;
        }

        if (_.isFilledArray(buttons)) {
            messageBody.buttons = buttons;
        }

        params.update_extra_mode = replaceExtra === true ? 'replace' : 'merge';

        if (returnMessage === true) {
            params.return_message = '1';
        }

        return this.requestApi<T>(`chats/${chatId}/messages/${messageId}`, params, 'put');
    }

    deleteMessage<T = unknown>(chatId: string, messageId: string): Promise<T> {
        const params: Record<string, unknown> = { message: { is_deleted: '1' } };
        return this.requestApi<T>(`chats/${chatId}/messages/${messageId}`, params, 'put');
    }

    sendTyping<T = unknown>(chatId: string, userId: string): Promise<T> {
        const queryParams: Record<string, unknown> = { user: userId };
        return this.requestApi<T>(`chats/${chatId}/typing`, queryParams, 'put');
    }

    addParticipantsToChat<T = unknown>(chatId: string, participants: Participant[] = []): Promise<T> {
        if (!_.isFilledArray(participants)) {
            throw new Error('participants have to be an array of participant objects');
        }

        const queryParams: Record<string, unknown> = {
            participants: participants.map(normalizeParticipant),
        };

        return this.requestApi<T>(`chats/${chatId}/participants`, queryParams, 'post');
    }
}

export default Emby;
export * from './types.js';
