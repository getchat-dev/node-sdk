export type RightScheme = { readonly type: 'boolean' } | { readonly type: 'enum'; readonly values: readonly string[] };

export const rightsScheme = {
    send_messages: { type: 'boolean' },
    edit_messages: { type: 'enum', values: ['none', 'my', 'any'] },
    delete_messages: { type: 'enum', values: ['none', 'my', 'any'] },
    react_messages: { type: 'boolean' },
    pin_messages: { type: 'enum', values: ['none', 'for_me', 'for_everyone'] },
    can_press_buttons: { type: 'boolean' },
    send_typing: { type: 'boolean' },
    track_presence: { type: 'boolean' },
    send_photos: { type: 'boolean' },
    send_voices: { type: 'boolean' },
    send_audio: { type: 'boolean' },
    send_documents: { type: 'boolean' },
    send_location: { type: 'boolean' },
    create_pool: { type: 'boolean' },
    participate_pool: { type: 'boolean' },
    kick_users: { type: 'boolean' },
    track_read_state: { type: 'boolean' },
    send_read_state: { type: 'boolean' },
    leave_chats: { type: 'boolean' },
} as const satisfies Record<string, RightScheme>;

export type RightKey = keyof typeof rightsScheme;
