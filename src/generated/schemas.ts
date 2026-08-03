// Generated from openapi.yml — do not edit manually.
// Regenerate with `npm run generate`.

import { z } from 'zod';

export const ParticipantRightsSchema = z.object({
    send_messages: z.boolean().nullable().optional(),
    can_press_buttons: z.boolean().nullable().optional(),
    edit_messages: z.enum(['none', 'my', 'any']).nullable().optional(),
    delete_messages: z.enum(['none', 'my', 'any']).nullable().optional(),
    pin_messages: z.enum(['none', 'for_me', 'for_everyone']).nullable().optional(),
    send_typing: z.boolean().nullable().optional(),
    send_photos: z.boolean().nullable().optional(),
    send_voices: z.boolean().nullable().optional(),
    send_audio: z.boolean().nullable().optional(),
    send_documents: z.boolean().nullable().optional(),
    send_location: z.boolean().nullable().optional(),
    create_pool: z.boolean().nullable().optional(),
    participate_pool: z.boolean().nullable().optional(),
    kick_users: z.boolean().nullable().optional(),
    track_presence: z.boolean().nullable().optional(),
    track_read_state: z.boolean().nullable().optional(),
    send_read_state: z.boolean().nullable().optional(),
    react_messages: z.boolean().nullable().optional(),
    leave_chats: z.boolean().nullable().optional(),
});
export type ParticipantRights = z.infer<typeof ParticipantRightsSchema>;

export const OwnerInputSchema = z.object({
    id: z.string().max(255).optional(),
    name: z.string().max(255).optional(),
    email: z.email().optional(),
    link: z.url().optional(),
    picture: z.url().optional(),
    metadata: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.unknown()]))
        .refine((v) => Object.keys(v as object).length <= 100, { message: 'maximum 100 properties allowed' })
        .optional(),
    rights: ParticipantRightsSchema.optional(),
});
export type OwnerInput = z.infer<typeof OwnerInputSchema>;

export const ParticipantInputSchema = z.object({
    id: z.string(),
    name: z.string().max(100).optional(),
    email: z.email().max(100).optional(),
    link: z.url().optional(),
    picture: z.string().optional(),
    is_bot: z.boolean().optional(),
    rights: ParticipantRightsSchema.optional(),
});
export type ParticipantInput = z.infer<typeof ParticipantInputSchema>;

export const ButtonSchema = z.object({
    action: z.string().max(255).optional(),
    type: z.enum(['url', 'call', 'local', 'remote']),
    label: z.string().max(100),
    state: z.enum(['default', 'loading', 'disabled']).optional(),
    style: z.enum(['primary', 'positive', 'negative', 'neutral']).optional(),
});
export type Button = z.infer<typeof ButtonSchema>;

export const AvatarSchema = z.union([
    z.url(),
    z.object({
        kind: z.string(),
        color: z.string().optional(),
        initials: z.string().optional(),
    }),
]);
export type Avatar = z.infer<typeof AvatarSchema>;

export const UserSchema = z.object({
    id: z.string().max(255),
    name: z.string().max(255),
    email: z.email().optional(),
    link: z.url().optional(),
    picture: z.url().optional(),
    metadata: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .refine((v) => Object.keys(v as object).length <= 100, { message: 'maximum 100 properties allowed' })
        .optional(),
});
export type User = z.infer<typeof UserSchema>;

export const UserResourceSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email().optional(),
    link: z.url().optional(),
    picture: AvatarSchema.optional(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
    metadata: z.record(z.string(), z.string()).optional(),
});
export type UserResource = z.infer<typeof UserResourceSchema>;

export const ParticipantResourceSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email().optional(),
    link: z.url().optional(),
    picture: AvatarSchema.optional(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
});
export type ParticipantResource = z.infer<typeof ParticipantResourceSchema>;

export const MessageResourceSchema = z.object({
    id: z.string(),
    seq: z.number().int(),
    user_id: z.string(),
    text: z.string().nullable(),
    created_at: z.number().int(),
    updated_at: z.number().int().nullable(),
    is_deleted: z.boolean(),
    is_edited: z.boolean(),
    versions: z.number().int(),
    extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    recipient_id: z.string().optional(),
    buttons: z.array(ButtonSchema).max(20).optional(),
});
export type MessageResource = z.infer<typeof MessageResourceSchema>;

export const ChatResourceSchema = z.object({
    id: z.string(),
    type: z.enum(['private', 'group', 'supergroup', 'channel']).nullable(),
    title: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
    last_message_at: z.iso.datetime({ offset: true }).optional(),
    last_message: MessageResourceSchema.optional(),
    owner_id: z.string().optional(),
    owner: UserResourceSchema.optional(),
    participants: z.array(ParticipantResourceSchema).optional(),
    participants_omitted: z
        .object({
            reason: z.enum(['large_group', 'unsupported_type']),
            members_count: z.number().int(),
            hint: z.string().optional(),
        })
        .optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type ChatResource = z.infer<typeof ChatResourceSchema>;

export const PaginationMetaSchema = z.object({
    total: z.number().int(),
    output: z.number().int(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const PaginationSchema = z.object({
    items_per_page: z.number().int(),
    current: z.number().int(),
    total: z.number().int(),
    next_page_url: z.string().nullable().optional(),
    prev_page_url: z.string().nullable().optional(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const StatusErrorSchema = z.object({
    status: z.boolean().optional(),
    message: z.string().optional(),
});
export type StatusError = z.infer<typeof StatusErrorSchema>;

export const ValidationErrorSchema = z.object({
    message: z.string().optional(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
