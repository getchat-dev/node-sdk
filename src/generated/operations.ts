// Generated from openapi.yml — do not edit manually.
// Regenerate with `npm run generate`.

import { z } from 'zod';
import * as S from './schemas.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

export interface Transport {
    requestApi<T = unknown>(
        method: string,
        params?: Record<string, unknown>,
        type?: HttpMethod,
        version?: string,
        query?: Record<string, unknown>,
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
export type ChatListInput = z.infer<typeof chatListInput>;

const chatCreateInput = z.object({
    body: z.object({
        chat: z.object({
            id: z.string().max(255),
            title: z.string().max(255),
            type: z.enum(['private', 'group', 'supergroup', 'channel']),
            metadata: z
                .record(z.string(), z.string())
                .refine((v) => Object.keys(v as object).length <= 64, { message: 'maximum 64 properties allowed' })
                .optional(),
            owner: S.UserSchema.optional(),
        }),
        participants: z.array(S.ParticipantInputSchema).max(10).optional(),
    }),
});
export type ChatCreateInput = z.infer<typeof chatCreateInput>;

const chatShowInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
});
export type ChatShowInput = z.infer<typeof chatShowInput>;

const chatUpdateInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
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
export type ChatUpdateInput = z.infer<typeof chatUpdateInput>;

const chatDeleteInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
});
export type ChatDeleteInput = z.infer<typeof chatDeleteInput>;

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
export type ChatParticipantsInput = z.infer<typeof chatParticipantsInput>;

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
                }),
            )
            .max(100)
            .optional(),
    }),
});
export type ChatAddParticipantsInput = z.infer<typeof chatAddParticipantsInput>;

const chatDeleteParticipantsInput = z.object({
    path: z.object({
        chat_id: z.string(),
        user_id: z.string(),
    }),
});
export type ChatDeleteParticipantsInput = z.infer<typeof chatDeleteParticipantsInput>;

const chatMessagesInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    query: z
        .object({
            limit: z.number().int().min(1).max(1000).optional(),
            page: z.number().int().min(1).optional(),
            with_users: z.union([z.literal(0), z.literal(1)]).optional(),
            isDeleted: z.union([z.literal(0), z.literal(1)]).optional(),
            isEdited: z.union([z.literal(0), z.literal(1)]).optional(),
            extra: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
});
export type ChatMessagesInput = z.infer<typeof chatMessagesInput>;

const chatSendMessageInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    body: z.object({
        user: S.UserSchema,
        chat: z
            .object({
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
                    extra: z.record(z.string(), z.string()).optional(),
                    recipient_id: z.string().optional(),
                    buttons: z.array(S.ButtonSchema).max(4).optional(),
                    disable_notification: z.boolean().optional(),
                }),
            )
            .max(50),
    }),
});
export type ChatSendMessageInput = z.infer<typeof chatSendMessageInput>;

const chatUpdateMessageInput = z.object({
    path: z.object({
        chat_id: z.string(),
        message: z.string(),
    }),
    body: z.object({
        message: z
            .object({
                text: z.string().max(4096).optional(),
                is_deleted: z.boolean().optional(),
                extra: z.record(z.string(), z.string()).optional(),
                buttons: z.array(S.ButtonSchema).max(4).optional(),
            })
            .optional(),
        update_extra_mode: z.enum(['merge', 'replace']).optional(),
        return_message: z.boolean().optional(),
    }),
});
export type ChatUpdateMessageInput = z.infer<typeof chatUpdateMessageInput>;

const chatSendTypingInput = z.object({
    path: z.object({
        chat_id: z.string(),
        user_id: z.string(),
    }),
});
export type ChatSendTypingInput = z.infer<typeof chatSendTypingInput>;

const chatSetWebhookInput = z.object({
    path: z.object({
        chat_id: z.string(),
    }),
    body: z.object({
        disabled: z.boolean().optional(),
        url: z.url().optional(),
    }),
});
export type ChatSetWebhookInput = z.infer<typeof chatSetWebhookInput>;

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
export type ChatSetS3CredentialsInput = z.infer<typeof chatSetS3CredentialsInput>;

const userCreateInput = z.object({
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
export type UserCreateInput = z.infer<typeof userCreateInput>;

const userShowInput = z.object({
    path: z.object({
        user_id: z.string(),
    }),
});
export type UserShowInput = z.infer<typeof userShowInput>;

const userUpdateInput = z.object({
    path: z.object({
        user_id: z.string(),
    }),
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
export type UserUpdateInput = z.infer<typeof userUpdateInput>;

const userDeleteInput = z.object({
    path: z.object({
        user_id: z.string(),
    }),
});
export type UserDeleteInput = z.infer<typeof userDeleteInput>;

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
        })
        .optional(),
});
export type UserChatsInput = z.infer<typeof userChatsInput>;

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
export type UserAddFcmTokenInput = z.infer<typeof userAddFcmTokenInput>;

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
export type TenantSetS3CredentialsInput = z.infer<typeof tenantSetS3CredentialsInput>;

const tenantSetWebhookSettingsInput = z.object({
    body: z.object({
        disabled: z.boolean().optional(),
        url: z.url().optional(),
    }),
});
export type TenantSetWebhookSettingsInput = z.infer<typeof tenantSetWebhookSettingsInput>;

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
export type TenantSetFirebaseConfigForJsInput = z.infer<typeof tenantSetFirebaseConfigForJsInput>;

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
export type TenantSetFirebaseServiceAccountInput = z.infer<typeof tenantSetFirebaseServiceAccountInput>;

const tenantSetFirebaseFcmVapidInput = z.object({
    body: z.object({
        public_key: z.string().max(255),
        private_key: z.string().max(255),
    }),
});
export type TenantSetFirebaseFcmVapidInput = z.infer<typeof tenantSetFirebaseFcmVapidInput>;

const tenantSetPushNotificationsSettingsInput = z.object({
    body: z.object({
        icon: z.url().max(100).optional(),
        url_template: z.string().max(255).optional(),
        disabled: z.boolean().optional(),
    }),
});
export type TenantSetPushNotificationsSettingsInput = z.infer<typeof tenantSetPushNotificationsSettingsInput>;

const tenantClearDataInput = z
    .object({
        query: z
            .object({
                sync: z.boolean().optional(),
            })
            .optional(),
    })
    .optional();
export type TenantClearDataInput = z.infer<typeof tenantClearDataInput>;

export function createOperations(transport: Transport) {
    return {
        /** List chats */
        chatList: async <T = unknown>(input?: ChatListInput): Promise<T> => {
            const parsed = chatListInput.parse(input);
            const url = 'chats';
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, query, 'get');
        },

        /** Create a new chat */
        chatCreate: async <T = unknown>(input: ChatCreateInput): Promise<T> => {
            const parsed = chatCreateInput.parse(input);
            const url = 'chats';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'post');
        },

        /** Get chat details */
        chatShow: async <T = unknown>(input: ChatShowInput): Promise<T> => {
            const parsed = chatShowInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}`;
            return transport.requestApi<T>(url, undefined, 'get');
        },

        /** Update chat */
        chatUpdate: async <T = unknown>(input: ChatUpdateInput): Promise<T> => {
            const parsed = chatUpdateInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Delete chat */
        chatDelete: async <T = unknown>(input: ChatDeleteInput): Promise<T> => {
            const parsed = chatDeleteInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}`;
            return transport.requestApi<T>(url, undefined, 'delete');
        },

        /** List chat participants */
        chatParticipants: async <T = unknown>(input: ChatParticipantsInput): Promise<T> => {
            const parsed = chatParticipantsInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/participants`;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, query, 'get');
        },

        /** Add participants to chat */
        chatAddParticipants: async <T = unknown>(input: ChatAddParticipantsInput): Promise<T> => {
            const parsed = chatAddParticipantsInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/participants`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'post');
        },

        /** Remove participant from chat */
        chatDeleteParticipants: async <T = unknown>(input: ChatDeleteParticipantsInput): Promise<T> => {
            const parsed = chatDeleteParticipantsInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/participants/${String((parsed as { path: Record<string, unknown> }).path['user_id'])}`;
            return transport.requestApi<T>(url, undefined, 'delete');
        },

        /** List messages in chat */
        chatMessages: async <T = unknown>(input: ChatMessagesInput): Promise<T> => {
            const parsed = chatMessagesInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/messages`;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, query, 'get');
        },

        /** Send messages to chat */
        chatSendMessage: async <T = unknown>(input: ChatSendMessageInput): Promise<T> => {
            const parsed = chatSendMessageInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/messages`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'post');
        },

        /** Update message */
        chatUpdateMessage: async <T = unknown>(input: ChatUpdateMessageInput): Promise<T> => {
            const parsed = chatUpdateMessageInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/messages/${String((parsed as { path: Record<string, unknown> }).path['message'])}`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Send typing indicator */
        chatSendTyping: async <T = unknown>(input: ChatSendTypingInput): Promise<T> => {
            const parsed = chatSendTypingInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/typing/${String((parsed as { path: Record<string, unknown> }).path['user_id'])}`;
            return transport.requestApi<T>(url, undefined, 'put');
        },

        /** Set chat webhook settings */
        chatSetWebhook: async <T = unknown>(input: ChatSetWebhookInput): Promise<T> => {
            const parsed = chatSetWebhookInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/webhook`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Set S3 credentials for chat */
        chatSetS3Credentials: async <T = unknown>(input: ChatSetS3CredentialsInput): Promise<T> => {
            const parsed = chatSetS3CredentialsInput.parse(input);
            const url = `chats/${String((parsed as { path: Record<string, unknown> }).path['chat_id'])}/s3-credentials`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Create user */
        userCreate: async <T = unknown>(input: UserCreateInput): Promise<T> => {
            const parsed = userCreateInput.parse(input);
            const url = 'users';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'post');
        },

        /** Get user details */
        userShow: async <T = unknown>(input: UserShowInput): Promise<T> => {
            const parsed = userShowInput.parse(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path['user_id'])}`;
            return transport.requestApi<T>(url, undefined, 'get');
        },

        /** Update user */
        userUpdate: async <T = unknown>(input: UserUpdateInput): Promise<T> => {
            const parsed = userUpdateInput.parse(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path['user_id'])}`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Delete user */
        userDelete: async <T = unknown>(input: UserDeleteInput): Promise<T> => {
            const parsed = userDeleteInput.parse(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path['user_id'])}`;
            return transport.requestApi<T>(url, undefined, 'delete');
        },

        /** Get user chats */
        userChats: async <T = unknown>(input: UserChatsInput): Promise<T> => {
            const parsed = userChatsInput.parse(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path['user_id'])}/chats`;
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, query, 'get');
        },

        /** Add FCM token */
        userAddFcmToken: async <T = unknown>(input: UserAddFcmTokenInput): Promise<T> => {
            const parsed = userAddFcmTokenInput.parse(input);
            const url = `users/${String((parsed as { path: Record<string, unknown> }).path['user_id'])}/fcm_tokens`;
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'post');
        },

        /** Set tenant S3 credentials */
        tenantSetS3Credentials: async <T = unknown>(input: TenantSetS3CredentialsInput): Promise<T> => {
            const parsed = tenantSetS3CredentialsInput.parse(input);
            const url = 's3-credentials';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Set tenant webhook settings */
        tenantSetWebhookSettings: async <T = unknown>(input: TenantSetWebhookSettingsInput): Promise<T> => {
            const parsed = tenantSetWebhookSettingsInput.parse(input);
            const url = 'webhook';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Set Firebase config for JS */
        tenantSetFirebaseConfigForJs: async <T = unknown>(input: TenantSetFirebaseConfigForJsInput): Promise<T> => {
            const parsed = tenantSetFirebaseConfigForJsInput.parse(input);
            const url = 'firebase/js_config';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Set Firebase service account */
        tenantSetFirebaseServiceAccount: async <T = unknown>(
            input: TenantSetFirebaseServiceAccountInput,
        ): Promise<T> => {
            const parsed = tenantSetFirebaseServiceAccountInput.parse(input);
            const url = 'firebase/svc_acc_credentials';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Set Firebase FCM VAPID */
        tenantSetFirebaseFcmVapid: async <T = unknown>(input: TenantSetFirebaseFcmVapidInput): Promise<T> => {
            const parsed = tenantSetFirebaseFcmVapidInput.parse(input);
            const url = 'firebase/fcm_vapid';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Set push notification settings */
        tenantSetPushNotificationsSettings: async <T = unknown>(
            input: TenantSetPushNotificationsSettingsInput,
        ): Promise<T> => {
            const parsed = tenantSetPushNotificationsSettingsInput.parse(input);
            const url = 'settings/push-notifications';
            const body = (parsed as { body?: Record<string, unknown> } | undefined)?.body;
            return transport.requestApi<T>(url, body, 'put');
        },

        /** Clear tenant data */
        tenantClearData: async <T = unknown>(input?: TenantClearDataInput): Promise<T> => {
            const parsed = tenantClearDataInput.parse(input);
            const url = 'clear';
            const query = (parsed as { query?: Record<string, unknown> } | undefined)?.query;
            return transport.requestApi<T>(url, undefined, 'put', undefined, query);
        },
    };
}

export type Operations = ReturnType<typeof createOperations>;
