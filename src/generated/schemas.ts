// Generated from openapi.yml — do not edit manually.
// Regenerate with `npm run generate`.

import { z } from 'zod';

export const ParticipantInputSchema = z.object({
    id: z.string().max(255),
    name: z.string().max(255).optional(),
    email: z.email().optional(),
    link: z.url().optional(),
    picture: z.string().optional(),
    is_bot: z.boolean().optional(),
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
        .record(z.string(), z.string())
        .refine((v) => Object.keys(v as object).length <= 64, { message: 'maximum 64 properties allowed' })
        .optional(),
});
export type User = z.infer<typeof UserSchema>;

export const UserResourceSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email().optional(),
    link: z.url().optional(),
    picture: AvatarSchema.optional(),
    created_at: z.string(),
    updated_at: z.string(),
    metadata: z.record(z.string(), z.string()).optional(),
});
export type UserResource = z.infer<typeof UserResourceSchema>;

export const ParticipantResourceSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email().optional(),
    link: z.url().optional(),
    picture: AvatarSchema.optional(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type ParticipantResource = z.infer<typeof ParticipantResourceSchema>;

export const MessageResourceSchema = z.object({
    id: z.string(),
    user_id: z.string(),
    text: z.string().optional(),
    created_at: z.number().int(),
    updated_at: z.number().int().nullable().optional(),
    is_deleted: z.boolean(),
    is_edited: z.boolean().optional(),
    versions: z.number().int().optional(),
    extra: z.record(z.string(), z.string()).optional(),
    recipient_id: z.string().optional(),
    buttons: z
        .array(
            z.object({
                action: z.string().optional(),
                type: z.enum(['url', 'call', 'local', 'remote']).optional(),
                label: z.string().optional(),
                state: z.enum(['default', 'loading', 'disabled']).optional(),
                style: z.enum(['primary', 'positive', 'negative', 'neutral']).optional(),
            }),
        )
        .max(4)
        .optional(),
});
export type MessageResource = z.infer<typeof MessageResourceSchema>;

export const ChatResourceSchema = z.object({
    id: z.string(),
    type: z.enum(['private', 'group', 'supergroup', 'channel']),
    title: z.string().optional(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
    last_message_at: z.iso.datetime({ offset: true }).optional(),
    last_message: z.unknown().optional(),
    owner_id: z.string().optional(),
    owner: UserResourceSchema.optional(),
    metadata: z.record(z.string(), z.string()).optional(),
});
export type ChatResource = z.infer<typeof ChatResourceSchema>;
