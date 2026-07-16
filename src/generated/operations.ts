// Generated from openapi.yml — do not edit manually.
// Regenerate with `npm run generate`.

import { z } from 'zod';
import { pickRequestControl, type RequestControlOptions } from '../libs/requestOptions.js';
import * as S from './schemas.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

export interface Transport {
    requestApi<T = unknown>(
        method: string,
        params?: Record<string, unknown>,
        type?: HttpMethod,
        version?: string,
        query?: Record<string, unknown>,
        headers?: Record<string, unknown>,
        control?: RequestControlOptions,
    ): Promise<T>;
}

const chatListInput = z
    .object({
        query: z
            .object({
                limit: z.number().int().min(1).max(1000).optional(),
                page: z.number().int().min(1).optional(),
                type: z.enum(['private', 'group', 'supergroup', 'channel']).optional(),
                owner: z.string().max(255).optional(),
                created_from: z.iso.datetime({ offset: true }).optional(),
                created_to: z.iso.datetime({ offset: true }).optional(),
                last_message_from: z.iso.datetime({ offset: true }).optional(),
                last_message_to: z.iso.datetime({ offset: true }).optional(),
                metadata: z.record(z.string(), z.string()).optional(),
                with_owners: z.union([z.literal(0), z.literal(1)]).optional(),
            })
            .optional(),
    })
    .optional();
export type ChatListInput = z.infer<typeof chatListInput> & RequestControlOptions;
export type ChatListResponse = {
    status: boolean;
    chats: Record<string, S.ChatResource>;
    chats_sort?: Array<string>;
    users?: Record<string, S.UserResource>;
    meta: { total: number; output: number };
    pagination: {
        items_per_page: number;
        current: number;
        total: number;
        next_page_url?: string | null;
        prev_page_url?: string | null;
    };
};

const chatCreateInput = z.object({
    query: z
        .object({
            with_participants: z.boolean().optional(),
            result: z.enum(['yes', 'no']).optional(),
            participants: z.enum(['yes', 'no']).optional(),
        })
        .optional(),
    header: z
        .object({
            Prefer: z.enum(['return=representation', 'return=minimal']).optional(),
        })
        .optional(),
    body: z.object({
        chat: z.object({
            id: z.string().max(255),
            title: z.string().max(255),
            type: z.enum(['private', 'group', 'supergroup', 'channel']),
            metadata: z
                .record(z.string(), z.string())
                .refine((v) => Object.keys(v as object).length <= 64, { message: 'maximum 64 properties allowed' })
                .optional(),
            owner: z
                .intersection(
                    S.UserSchema,
                    z.object({
                        rights: S.ParticipantRightsSchema.optional(),
                    }),
                )
                .optional(),
        }),
        participants: z.array(S.ParticipantInputSchema).max(10).optional(),
    }),
});
export type ChatCreateInput = z.infer<typeof chatCreateInput> & RequestControlOptions;
export type ChatCreateResponse = {
    status?: boolean;
    chat?: S.ChatResource;
    participants?: Array<S.ParticipantResource>;
};

const chatShowInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
});
export type ChatShowInput = z.infer<typeof chatShowInput> & RequestControlOptions;
export type ChatShowResponse = { status?: boolean; chat?: S.ChatResource };

const chatUpdateInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    query: z
        .object({
            result: z.enum(['yes', 'no']).optional(),
        })
        .optional(),
    header: z
        .object({
            Prefer: z.enum(['return=representation', 'return=minimal']).optional(),
        })
        .optional(),
    body: z.object({
        chat: z
            .object({
                id: z.string().max(255).optional(),
                title: z.string().max(255).optional(),
                metadata: z.record(z.string(), z.string()).optional(),
            })
            .optional(),
    }),
});
export type ChatUpdateInput = z.infer<typeof chatUpdateInput> & RequestControlOptions;
export type ChatUpdateResponse = { status?: boolean; chat?: S.ChatResource };

const chatDeleteInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
});
export type ChatDeleteInput = z.infer<typeof chatDeleteInput> & RequestControlOptions;
export type ChatDeleteResponse = { status?: boolean };

const chatParticipantsInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    query: z
        .object({
            limit: z.number().int().min(1).max(1000).optional(),
            page: z.number().int().min(1).optional(),
        })
        .optional(),
});
export type ChatParticipantsInput = z.infer<typeof chatParticipantsInput> & RequestControlOptions;
export type ChatParticipantsResponse = {
    participants: Array<S.ParticipantResource>;
    meta: { total?: number; output?: number };
    pagination: { items_per_page?: number; current?: number; total?: number };
};

const chatAddParticipantsInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    body: z.object({
        participants: z
            .array(
                z.object({
                    id: z.string(),
                    name: z.string().max(100).optional(),
                    email: z.email().optional(),
                    link: z.url().optional(),
                    picture: z.string().optional(),
                    is_bot: z.boolean().optional(),
                    rights: S.ParticipantRightsSchema.optional(),
                }),
            )
            .max(100)
            .optional(),
    }),
});
export type ChatAddParticipantsInput = z.infer<typeof chatAddParticipantsInput> & RequestControlOptions;
export type ChatAddParticipantsResponse = unknown;

const chatGetParticipantRightsInput = z.object({
    path: z.object({
        chat_id: z.string(),
        user_id: z.string(),
    }),
});
export type ChatGetParticipantRightsInput = z.infer<typeof chatGetParticipantRightsInput> & RequestControlOptions;
export type ChatGetParticipantRightsResponse = { status?: boolean; rights?: Record<string, unknown> };

const chatUpdateParticipantRightsInput = z.object({
    path: z.object({
        chat_id: z.string(),
        user_id: z.string(),
    }),
    query: z
        .object({
            result: z.enum(['yes', 'no']).optional(),
        })
        .optional(),
    header: z
        .object({
            Prefer: z.enum(['return=representation', 'return=minimal']).optional(),
        })
        .optional(),
    body: S.ParticipantRightsSchema.refine((v) => Object.keys(v as object).length >= 1, {
        message: 'at least 1 property required',
    }),
});
export type ChatUpdateParticipantRightsInput = z.infer<typeof chatUpdateParticipantRightsInput> & RequestControlOptions;
export type ChatUpdateParticipantRightsResponse = { status?: boolean; rights?: Record<string, unknown> };

const chatDeleteParticipantRightsInput = z.object({
    path: z.object({
        chat_id: z.string(),
        user_id: z.string(),
    }),
});
export type ChatDeleteParticipantRightsInput = z.infer<typeof chatDeleteParticipantRightsInput> & RequestControlOptions;
export type ChatDeleteParticipantRightsResponse = { status?: boolean };

const chatDeleteParticipantsInput = z.object({
    path: z.object({
        chat_id: z.string(),
        user_id: z.string(),
    }),
});
export type ChatDeleteParticipantsInput = z.infer<typeof chatDeleteParticipantsInput> & RequestControlOptions;
export type ChatDeleteParticipantsResponse = unknown;

const chatMessagesInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    query: z
        .object({
            limit: z.number().int().min(1).max(1000).optional(),
            page: z.number().int().min(1).optional(),
            with_users: z.union([z.literal(0), z.literal(1)]).optional(),
            order: z.enum(['asc', 'desc']).optional(),
            isDeleted: z.union([z.literal(0), z.literal(1)]).optional(),
            isEdited: z.union([z.literal(0), z.literal(1)]).optional(),
            extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        })
        .optional(),
});
export type ChatMessagesInput = z.infer<typeof chatMessagesInput> & RequestControlOptions;
export type ChatMessagesResponse = {
    messages: Record<string, S.MessageResource>;
    messages_sort?: Array<string>;
    users?: Record<string, S.ParticipantResource>;
    meta: { total?: number; output?: number };
    pagination: {
        items_per_page?: number;
        current?: number;
        total?: number;
        next_page_url?: string | null;
        prev_page_url?: string | null;
    };
};

const chatSendMessageInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    body: z.object({
        user: S.UserSchema,
        chat: z
            .object({
                create: z.boolean().optional(),
                type: z.enum(['private', 'group', 'supergroup', 'channel']).optional(),
                title: z.string().max(255).optional(),
                metadata: z
                    .record(z.string(), z.string())
                    .refine((v) => Object.keys(v as object).length <= 64, { message: 'maximum 64 properties allowed' })
                    .optional(),
            })
            .optional(),
        participants: z.array(S.ParticipantInputSchema).max(10).optional(),
        messages: z
            .array(
                z.object({
                    text: z.string().max(4096),
                    extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
                    recipient_id: z.string().optional(),
                    buttons: z.array(S.ButtonSchema).max(4).optional(),
                    disable_notification: z.boolean().optional(),
                }),
            )
            .max(50),
    }),
});
export type ChatSendMessageInput = z.infer<typeof chatSendMessageInput> & RequestControlOptions;
export type ChatSendMessageResponse = { status?: boolean; message_ids?: Array<string> };

const chatUpdateMessageInput = z.object({
    path: z.object({
        chat_id: z.string(),
        message: z.string(),
    }),
    query: z
        .object({
            result: z.enum(['yes', 'no']).optional(),
        })
        .optional(),
    header: z
        .object({
            Prefer: z.enum(['return=representation', 'return=minimal']).optional(),
        })
        .optional(),
    body: z.object({
        message: z
            .object({
                text: z.string().max(4096).optional(),
                is_deleted: z.boolean().optional(),
                extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
                buttons: z.array(S.ButtonSchema).max(4).optional(),
            })
            .optional(),
        update_extra_mode: z.enum(['merge', 'replace']).optional(),
    }),
});
export type ChatUpdateMessageInput = z.infer<typeof chatUpdateMessageInput> & RequestControlOptions;
export type ChatUpdateMessageResponse = { status?: boolean; is_updated?: boolean; message?: S.MessageResource };

const chatSendTypingInput = z.object({
    path: z.object({
        chat_id: z.string(),
        user_id: z.string(),
    }),
    query: z
        .object({
            time: z.number().int().min(1).max(60).optional(),
        })
        .optional(),
});
export type ChatSendTypingInput = z.infer<typeof chatSendTypingInput> & RequestControlOptions;
export type ChatSendTypingResponse = unknown;

const chatSetWebhookInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    body: z.object({
        disabled: z.boolean().optional(),
        url: z.url().optional(),
    }),
});
export type ChatSetWebhookInput = z.infer<typeof chatSetWebhookInput> & RequestControlOptions;
export type ChatSetWebhookResponse = unknown;

const chatSetS3CredentialsInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    body: z.object({
        access_key: z.string().max(40),
        secret_key: z.string().max(40),
        endpoint_url: z.url(),
        bucket: z.string(),
        region: z.string().max(20).optional(),
        s3_path_style: z.boolean().optional(),
        public_url: z.url().optional(),
        cdn_url: z.url().optional(),
    }),
});
export type ChatSetS3CredentialsInput = z.infer<typeof chatSetS3CredentialsInput> & RequestControlOptions;
export type ChatSetS3CredentialsResponse = { status?: boolean; modified?: boolean };

const userCreateInput = z.object({
    query: z
        .object({
            result: z.enum(['yes', 'no']).optional(),
        })
        .optional(),
    header: z
        .object({
            Prefer: z.enum(['return=representation', 'return=minimal']).optional(),
        })
        .optional(),
    body: z.object({
        user: z.object({
            id: z.string().max(255),
            name: z.string().max(255),
            email: z.email().optional(),
            link: z.url().optional(),
            picture: z.url().optional(),
            metadata: z
                .record(z.string(), z.string())
                .refine((v) => Object.keys(v as object).length <= 64, { message: 'maximum 64 properties allowed' })
                .optional(),
        }),
    }),
});
export type UserCreateInput = z.infer<typeof userCreateInput> & RequestControlOptions;
export type UserCreateResponse = { status?: boolean; user?: S.UserResource };

const userShowInput = z.object({
    path: z.object({
        user_id: z.string(),
    }),
});
export type UserShowInput = z.infer<typeof userShowInput> & RequestControlOptions;
export type UserShowResponse = { status?: boolean; user?: S.UserResource };

const userUpdateInput = z.object({
    path: z.object({
        user_id: z.string(),
    }),
    query: z
        .object({
            result: z.enum(['yes', 'no']).optional(),
        })
        .optional(),
    header: z
        .object({
            Prefer: z.enum(['return=representation', 'return=minimal']).optional(),
        })
        .optional(),
    body: z.object({
        user: z
            .object({
                id: z.string().max(255).optional(),
                name: z.string().max(255).optional(),
                email: z.email().optional(),
                link: z.url().optional(),
                picture: z.url().optional(),
                metadata: z.record(z.string(), z.string()).optional(),
            })
            .optional(),
    }),
});
export type UserUpdateInput = z.infer<typeof userUpdateInput> & RequestControlOptions;
export type UserUpdateResponse = { status?: boolean; user?: S.UserResource };

const userDeleteInput = z.object({
    path: z.object({
        user_id: z.string(),
    }),
});
export type UserDeleteInput = z.infer<typeof userDeleteInput> & RequestControlOptions;
export type UserDeleteResponse = unknown;

const userChatsInput = z.object({
    path: z.object({
        user_id: z.string(),
    }),
    query: z
        .object({
            limit: z.number().int().min(1).max(1000).optional(),
            page: z.number().int().min(1).optional(),
            order: z.enum(['asc', 'desc']).optional(),
            read: z.boolean().optional(),
            metadata: z.record(z.string(), z.string()).optional(),
            with_last_message: z.union([z.literal(0), z.literal(1)]).optional(),
        })
        .optional(),
});
export type UserChatsInput = z.infer<typeof userChatsInput> & RequestControlOptions;
export type UserChatsResponse = {
    chats: Array<S.ChatResource>;
    meta: { total?: number; output?: number };
    pagination: {
        items_per_page?: number;
        current?: number;
        total?: number;
        next_page_url?: string | null;
        prev_page_url?: string | null;
    };
};

const userAddFcmTokenInput = z.object({
    path: z.object({
        user_id: z.string(),
    }),
    body: z.object({
        token: z.string().max(255),
        device_type: z.enum(['android', 'ios', 'web']),
        device_fingerprint: z.string().max(255).optional(),
    }),
});
export type UserAddFcmTokenInput = z.infer<typeof userAddFcmTokenInput> & RequestControlOptions;
export type UserAddFcmTokenResponse = unknown;

const tenantSetS3CredentialsInput = z.object({
    body: z.object({
        access_key: z.string().max(40),
        secret_key: z.string().max(40),
        endpoint_url: z.url(),
        bucket: z.string(),
        region: z.string().max(20).optional(),
        s3_path_style: z.boolean().optional(),
        public_url: z.url().optional(),
        cdn_url: z.url().optional(),
    }),
});
export type TenantSetS3CredentialsInput = z.infer<typeof tenantSetS3CredentialsInput> & RequestControlOptions;
export type TenantSetS3CredentialsResponse = { status?: boolean; modified?: boolean };

const tenantSetWebhookSettingsInput = z.object({
    body: z.object({
        disabled: z.boolean().optional(),
        url: z.url().optional(),
    }),
});
export type TenantSetWebhookSettingsInput = z.infer<typeof tenantSetWebhookSettingsInput> & RequestControlOptions;
export type TenantSetWebhookSettingsResponse = unknown;

const tenantSetFirebaseConfigForJsInput = z.object({
    body: z.object({
        api_key: z.string().max(255),
        auth_domain: z.string().max(255),
        project_id: z.string().max(255),
        storage_bucket: z.string().max(255),
        messaging_sender_id: z.string().max(255),
        app_id: z.string().max(255),
        measurement_id: z.string().max(255).optional(),
    }),
});
export type TenantSetFirebaseConfigForJsInput = z.infer<typeof tenantSetFirebaseConfigForJsInput> &
    RequestControlOptions;
export type TenantSetFirebaseConfigForJsResponse = unknown;

const tenantSetFirebaseServiceAccountInput = z.object({
    body: z.object({
        type: z.string().max(100),
        project_id: z.string().max(150),
        private_key_id: z.string().max(100),
        private_key: z.string().max(2000),
        client_email: z.email(),
        client_id: z.string().max(100),
        auth_uri: z.url(),
        token_uri: z.url(),
        auth_provider_x509_cert_url: z.url(),
        client_x509_cert_url: z.url(),
        universe_domain: z.string().max(255),
    }),
});
export type TenantSetFirebaseServiceAccountInput = z.infer<typeof tenantSetFirebaseServiceAccountInput> &
    RequestControlOptions;
export type TenantSetFirebaseServiceAccountResponse = unknown;

const tenantSetFirebaseFcmVapidInput = z.object({
    body: z.object({
        public_key: z.string().max(255),
        private_key: z.string().max(255),
    }),
});
export type TenantSetFirebaseFcmVapidInput = z.infer<typeof tenantSetFirebaseFcmVapidInput> & RequestControlOptions;
export type TenantSetFirebaseFcmVapidResponse = unknown;

const tenantSetPushNotificationsSettingsInput = z.object({
    body: z.object({
        icon: z.url().max(100).optional(),
        url_template: z.string().max(255).optional(),
        disabled: z.boolean().optional(),
    }),
});
export type TenantSetPushNotificationsSettingsInput = z.infer<typeof tenantSetPushNotificationsSettingsInput> &
    RequestControlOptions;
export type TenantSetPushNotificationsSettingsResponse = unknown;

const tenantClearDataInput = z
    .object({
        query: z
            .object({
                sync: z.boolean().optional(),
            })
            .optional(),
    })
    .optional();
export type TenantClearDataInput = z.infer<typeof tenantClearDataInput> & RequestControlOptions;
export type TenantClearDataResponse = { status?: boolean };

export function createOperations(transport: Transport) {
    return {
        /** List chats */
        chatList: async <T = ChatListResponse>(input?: ChatListInput): Promise<T> => {
            const parsed = chatListInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'chats';
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, query, 'get', undefined, undefined, undefined, control);
        },

        /** Create a new chat */
        chatCreate: async <T = ChatCreateResponse>(input: ChatCreateInput): Promise<T> => {
            const parsed = chatCreateInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'chats';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            const header = (parsed as { header?: Record<string, unknown> } | undefined)?.header;
            return transport.requestApi<T>(url, body, 'post', undefined, query, header, control);
        },

        /** Get chat details */
        chatShow: async <T = ChatShowResponse>(input: ChatShowInput): Promise<T> => {
            const parsed = chatShowInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}`;
            return transport.requestApi<T>(url, undefined, 'get', undefined, undefined, undefined, control);
        },

        /** Update chat */
        chatUpdate: async <T = ChatUpdateResponse>(input: ChatUpdateInput): Promise<T> => {
            const parsed = chatUpdateInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            const header = (parsed as { header?: Record<string, unknown> } | undefined)?.header;
            return transport.requestApi<T>(url, body, 'put', undefined, query, header, control);
        },

        /** Delete chat */
        chatDelete: async <T = ChatDeleteResponse>(input: ChatDeleteInput): Promise<T> => {
            const parsed = chatDeleteInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}`;
            return transport.requestApi<T>(url, undefined, 'delete', undefined, undefined, undefined, control);
        },

        /** List chat participants */
        chatParticipants: async <T = ChatParticipantsResponse>(input: ChatParticipantsInput): Promise<T> => {
            const parsed = chatParticipantsInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/participants`;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, query, 'get', undefined, undefined, undefined, control);
        },

        /** Add participants to chat */
        chatAddParticipants: async <T = ChatAddParticipantsResponse>(input: ChatAddParticipantsInput): Promise<T> => {
            const parsed = chatAddParticipantsInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/participants`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'post', undefined, undefined, undefined, control);
        },

        /** Get participant's per-chat rights */
        chatGetParticipantRights: async <T = ChatGetParticipantRightsResponse>(
            input: ChatGetParticipantRightsInput,
        ): Promise<T> => {
            const parsed = chatGetParticipantRightsInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/participants/${String((parsed as { path: Record<string, unknown> }).path.user_id)}/rights`;
            return transport.requestApi<T>(url, undefined, 'get', undefined, undefined, undefined, control);
        },

        /** Override participant rights for this chat */
        chatUpdateParticipantRights: async <T = ChatUpdateParticipantRightsResponse>(
            input: ChatUpdateParticipantRightsInput,
        ): Promise<T> => {
            const parsed = chatUpdateParticipantRightsInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/participants/${String((parsed as { path: Record<string, unknown> }).path.user_id)}/rights`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            const header = (parsed as { header?: Record<string, unknown> } | undefined)?.header;
            return transport.requestApi<T>(url, body, 'put', undefined, query, header, control);
        },

        /** Clear all participant rights for this chat */
        chatDeleteParticipantRights: async <T = ChatDeleteParticipantRightsResponse>(
            input: ChatDeleteParticipantRightsInput,
        ): Promise<T> => {
            const parsed = chatDeleteParticipantRightsInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/participants/${String((parsed as { path: Record<string, unknown> }).path.user_id)}/rights`;
            return transport.requestApi<T>(url, undefined, 'delete', undefined, undefined, undefined, control);
        },

        /** Remove participant from chat */
        chatDeleteParticipants: async <T = ChatDeleteParticipantsResponse>(
            input: ChatDeleteParticipantsInput,
        ): Promise<T> => {
            const parsed = chatDeleteParticipantsInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/participants/${String((parsed as { path: Record<string, unknown> }).path.user_id)}`;
            return transport.requestApi<T>(url, undefined, 'delete', undefined, undefined, undefined, control);
        },

        /** List messages in chat */
        chatMessages: async <T = ChatMessagesResponse>(input: ChatMessagesInput): Promise<T> => {
            const parsed = chatMessagesInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/messages`;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, query, 'get', undefined, undefined, undefined, control);
        },

        /** Send messages to chat */
        chatSendMessage: async <T = ChatSendMessageResponse>(input: ChatSendMessageInput): Promise<T> => {
            const parsed = chatSendMessageInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/messages`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'post', undefined, undefined, undefined, control);
        },

        /** Update message */
        chatUpdateMessage: async <T = ChatUpdateMessageResponse>(input: ChatUpdateMessageInput): Promise<T> => {
            const parsed = chatUpdateMessageInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/messages/${String((parsed as { path: Record<string, unknown> }).path.message)}`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            const header = (parsed as { header?: Record<string, unknown> } | undefined)?.header;
            return transport.requestApi<T>(url, body, 'put', undefined, query, header, control);
        },

        /** Send typing indicator */
        chatSendTyping: async <T = ChatSendTypingResponse>(input: ChatSendTypingInput): Promise<T> => {
            const parsed = chatSendTypingInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/typing/${String((parsed as { path: Record<string, unknown> }).path.user_id)}`;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, undefined, 'put', undefined, query, undefined, control);
        },

        /** Set chat webhook settings */
        chatSetWebhook: async <T = ChatSetWebhookResponse>(input: ChatSetWebhookInput): Promise<T> => {
            const parsed = chatSetWebhookInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/webhook`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put', undefined, undefined, undefined, control);
        },

        /** Set S3 credentials for chat */
        chatSetS3Credentials: async <T = ChatSetS3CredentialsResponse>(
            input: ChatSetS3CredentialsInput,
        ): Promise<T> => {
            const parsed = chatSetS3CredentialsInput.parse(input);
            const control = pickRequestControl(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path.chat_id)}/s3-credentials`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put', undefined, undefined, undefined, control);
        },

        /** Create user */
        userCreate: async <T = UserCreateResponse>(input: UserCreateInput): Promise<T> => {
            const parsed = userCreateInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'users';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            const header = (parsed as { header?: Record<string, unknown> } | undefined)?.header;
            return transport.requestApi<T>(url, body, 'post', undefined, query, header, control);
        },

        /** Get user details */
        userShow: async <T = UserShowResponse>(input: UserShowInput): Promise<T> => {
            const parsed = userShowInput.parse(input);
            const control = pickRequestControl(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path.user_id)}`;
            return transport.requestApi<T>(url, undefined, 'get', undefined, undefined, undefined, control);
        },

        /** Update user */
        userUpdate: async <T = UserUpdateResponse>(input: UserUpdateInput): Promise<T> => {
            const parsed = userUpdateInput.parse(input);
            const control = pickRequestControl(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path.user_id)}`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            const header = (parsed as { header?: Record<string, unknown> } | undefined)?.header;
            return transport.requestApi<T>(url, body, 'put', undefined, query, header, control);
        },

        /** Delete user */
        userDelete: async <T = UserDeleteResponse>(input: UserDeleteInput): Promise<T> => {
            const parsed = userDeleteInput.parse(input);
            const control = pickRequestControl(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path.user_id)}`;
            return transport.requestApi<T>(url, undefined, 'delete', undefined, undefined, undefined, control);
        },

        /** Get user chats */
        userChats: async <T = UserChatsResponse>(input: UserChatsInput): Promise<T> => {
            const parsed = userChatsInput.parse(input);
            const control = pickRequestControl(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path.user_id)}/chats`;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, query, 'get', undefined, undefined, undefined, control);
        },

        /** Add FCM token */
        userAddFcmToken: async <T = UserAddFcmTokenResponse>(input: UserAddFcmTokenInput): Promise<T> => {
            const parsed = userAddFcmTokenInput.parse(input);
            const control = pickRequestControl(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path.user_id)}/fcm_tokens`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'post', undefined, undefined, undefined, control);
        },

        /** Set tenant S3 credentials */
        tenantSetS3Credentials: async <T = TenantSetS3CredentialsResponse>(
            input: TenantSetS3CredentialsInput,
        ): Promise<T> => {
            const parsed = tenantSetS3CredentialsInput.parse(input);
            const control = pickRequestControl(input);
            const url = 's3-credentials';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put', undefined, undefined, undefined, control);
        },

        /** Set tenant webhook settings */
        tenantSetWebhookSettings: async <T = TenantSetWebhookSettingsResponse>(
            input: TenantSetWebhookSettingsInput,
        ): Promise<T> => {
            const parsed = tenantSetWebhookSettingsInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'webhook';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put', undefined, undefined, undefined, control);
        },

        /** Set Firebase config for JS */
        tenantSetFirebaseConfigForJs: async <T = TenantSetFirebaseConfigForJsResponse>(
            input: TenantSetFirebaseConfigForJsInput,
        ): Promise<T> => {
            const parsed = tenantSetFirebaseConfigForJsInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'firebase/js_config';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put', undefined, undefined, undefined, control);
        },

        /** Set Firebase service account */
        tenantSetFirebaseServiceAccount: async <T = TenantSetFirebaseServiceAccountResponse>(
            input: TenantSetFirebaseServiceAccountInput,
        ): Promise<T> => {
            const parsed = tenantSetFirebaseServiceAccountInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'firebase/svc_acc_credentials';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put', undefined, undefined, undefined, control);
        },

        /** Set Firebase FCM VAPID */
        tenantSetFirebaseFcmVapid: async <T = TenantSetFirebaseFcmVapidResponse>(
            input: TenantSetFirebaseFcmVapidInput,
        ): Promise<T> => {
            const parsed = tenantSetFirebaseFcmVapidInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'firebase/fcm_vapid';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put', undefined, undefined, undefined, control);
        },

        /** Set push notification settings */
        tenantSetPushNotificationsSettings: async <T = TenantSetPushNotificationsSettingsResponse>(
            input: TenantSetPushNotificationsSettingsInput,
        ): Promise<T> => {
            const parsed = tenantSetPushNotificationsSettingsInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'settings/push-notifications';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put', undefined, undefined, undefined, control);
        },

        /** Clear tenant data */
        tenantClearData: async <T = TenantClearDataResponse>(input?: TenantClearDataInput): Promise<T> => {
            const parsed = tenantClearDataInput.parse(input);
            const control = pickRequestControl(input);
            const url = 'clear';
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, undefined, 'put', undefined, query, undefined, control);
        },
    };
}

export type Operations = ReturnType<typeof createOperations>;
