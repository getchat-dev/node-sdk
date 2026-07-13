// Domain types for the GetChat Node SDK.
// Sourced from openapi.yml (primitives, resources, request/response shapes)
// and libs/rights.scheme.json (UserRights — not in openapi.yml).

// ---------------------------------------------------------------------------
// Primitive unions & enums
// ---------------------------------------------------------------------------

export type ChatType = 'private' | 'group' | 'system';

export type MessageButtonType = 'url' | 'call' | 'local' | 'remote';
export type MessageButtonState = 'default' | 'loading' | 'disabled';
export type MessageButtonStyle = 'primary' | 'positive' | 'negative' | 'neutral';

export type DeviceType = 'android' | 'ios' | 'web';

export type SortOrder = 'asc' | 'desc';

export type UpdateExtraMode = 'merge' | 'replace';

export type EditMessagesRight = 'none' | 'my' | 'any';
export type DeleteMessagesRight = 'none' | 'my' | 'any';
export type PinMessagesRight = 'none' | 'for_me' | 'for_everyone';

// String ↔ string map used everywhere (metadata, extra).
export type StringMap = Record<string, string>;

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

/** Input shape: what the client passes in (create/sign/send). */
export interface User {
    id: string;
    name: string;
    email?: string;
    link?: string;
    picture?: string;
    metadata?: StringMap;
}

/** Output shape: what the API returns. */
export interface UserResource {
    id: string;
    name: string;
    email?: string;
    link?: string;
    picture?: string;
    created_at: string;
    updated_at: string;
    metadata?: StringMap;
}

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

/**
 * Participant payload for **REST API** flow:
 *   - `chat.addParticipants` (POST /chats/{id}/participants)
 *   - `chat.sendMessage` (POST /chats/{id}/messages — `participants[]` on new chats)
 *   - `chat.create` (POST /chats — `participants[]` on creation)
 *
 * Lenient: backend only requires `id`; everything else is optional and
 * sanitized server-side (see `components/schemas/ParticipantInput` in
 * openapi.yml). If you're building a **signed iframe URL** instead, use
 * `UrlRecipient` — that flow has stricter rules.
 */
export interface Participant {
    id: string;
    name?: string;
    email?: string;
    link?: string;
    picture?: string;
    is_bot?: boolean;
}

/**
 * Recipient payload for **URL-signing flow** (`url()` / `urlByChatId()`).
 * Stricter than REST `Participant` — backend validator
 * `emby/app/Http/Requests/ChatIndexRequest.php` enforces:
 *   - `name` REQUIRED (`'recipients.*.name' => 'required'`)
 *   - `picture` must be a URL if present (`'recipients.*.picture' => 'nullable|url'`)
 *   - `email` / `link` nullable but, when present, must match their format
 *
 * If a signed URL is visited with a nameless recipient, the iframe request
 * fails validation client-side — so we mirror the stricter contract at the
 * TS level.
 */
export interface UrlRecipient {
    id: string;
    name: string;
    email?: string;
    link?: string;
    /** Must be a URL at the backend side. */
    picture?: string;
    is_bot?: boolean;
}

/** Output shape from the API. Note: no `is_bot` on the resource. */
export interface ParticipantResource {
    id: string;
    name: string;
    email?: string;
    link?: string;
    picture?: string;
    created_at: string;
    updated_at: string;
}

// ---------------------------------------------------------------------------
// User rights (derived from libs/rights.scheme.ts — not in openapi.yml)
// ---------------------------------------------------------------------------

export interface UserRights {
    send_messages?: boolean;
    edit_messages?: EditMessagesRight;
    delete_messages?: DeleteMessagesRight;
    react_messages?: boolean;
    pin_messages?: PinMessagesRight;
    can_press_buttons?: boolean;
    send_typing?: boolean;
    track_presence?: boolean;
    send_photos?: boolean;
    send_voices?: boolean;
    send_audio?: boolean;
    send_documents?: boolean;
    send_location?: boolean;
    create_pool?: boolean;
    participate_pool?: boolean;
    kick_users?: boolean;
    track_read_state?: boolean;
    send_read_state?: boolean;
    leave_chats?: boolean;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/**
 * Chat payload accepted by `url()` / `urlByChatId()` / `sendMessage()`. Looser
 * than the strict REST `ChatCreate` body — used in TWO distinct wire flows that
 * each validate a different subset:
 *
 *  1. **URL-signing** (`url()` / `urlByChatId()`) — validated by the backend's
 *     `ChatIndexRequest` controller (emby/app/Http/Requests/ChatIndexRequest.php).
 *     Recognizes: `id`, `title`, `socket_port` (≤4 chars), `create` (boolean),
 *     `metadata`. **`type` is ignored here** — the URL-signing validator does
 *     not declare a rule for `chat.type`.
 *
 *  2. **REST** (`sendMessage` → `chat.sendMessage`) — validated by
 *     `SendMessageRequest`. Recognizes `type`, `title`, `metadata` (no
 *     `create` / `socket_port` — those are URL-signing-only).
 *
 * `normalizeChat()` (libs/signing.ts) uses the UNION whitelist
 * (id/title/socket_port/create/type/metadata); anything else is dropped before
 * the wire. Each backend validator then ignores fields it doesn't know.
 */
export interface ChatInput {
    id?: string;
    title?: string;
    type?: ChatType;
    metadata?: StringMap;
    create?: boolean;
    socket_port?: string | number;
}

/** Input for creating a chat via POST /chats (strict — id/title/type required). */
export interface ChatCreate {
    id: string;
    title: string;
    type: ChatType;
    metadata?: StringMap;
    owner?: User;
}

/** Input for updating a chat via PUT /chats/{chat_id}. */
export interface ChatUpdate {
    id?: string;
    title?: string;
    metadata?: StringMap;
}

/** Output shape from the API. */
export interface ChatResource {
    id: string;
    type: ChatType;
    title?: string;
    created_at: string; // ISO date-time
    updated_at: string; // ISO date-time
    last_message_at?: string;
    owner_id?: string;
    owner?: UserResource;
    metadata?: StringMap;
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface MessageButton {
    type: MessageButtonType;
    label: string;
    action?: string;
    state?: MessageButtonState;
    style?: MessageButtonStyle;
}

/** Input for POST /chats/{chat_id}/messages (items inside `messages[]`). */
export interface MessageInput {
    text: string;
    recipient_id?: string;
    extra?: StringMap;
    buttons?: MessageButton[];
    disable_notification?: boolean;
}

/** Output shape from the API. Note: created_at/updated_at are epoch ms (int64). */
export interface MessageResource {
    id: string;
    user_id: string;
    text?: string;
    created_at: number;
    updated_at?: number | null;
    is_deleted: boolean;
    is_edited?: boolean;
    versions?: number;
    extra?: StringMap;
    recipient_id?: string;
    buttons?: MessageButton[];
}

/** Body for PUT /chats/{chat_id}/messages/{message}. */
export interface MessageUpdate {
    text?: string;
    is_deleted?: boolean;
    extra?: StringMap;
    buttons?: MessageButton[];
}

// ---------------------------------------------------------------------------
// Configuration (webhooks, S3, Firebase, FCM, push)
// ---------------------------------------------------------------------------

export interface WebhookSettings {
    disabled?: boolean;
    url?: string;
}

export interface S3Credentials {
    access_key: string;
    secret_key: string;
    endpoint_url: string;
    bucket: string;
    region?: string;
    s3_path_style?: boolean;
    public_url?: string;
    cdn_url?: string;
}

export interface FirebaseJsConfig {
    api_key: string;
    auth_domain: string;
    project_id: string;
    storage_bucket: string;
    messaging_sender_id: string;
    app_id: string;
    measurement_id?: string;
}

export interface FirebaseServiceAccount {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
    universe_domain: string;
}

export interface FirebaseFcmVapid {
    public_key: string;
    private_key: string;
}

export interface FcmToken {
    token: string;
    device_type: DeviceType;
    device_fingerprint?: string;
}

export interface PushNotificationSettings {
    icon?: string;
    url_template?: string;
    disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Common response envelope pieces
// ---------------------------------------------------------------------------

export interface Meta {
    total: number;
    output: number;
}

export interface Pagination {
    items_per_page: number;
    current: number;
    total: number;
    next_page_url?: string | null;
    prev_page_url?: string | null;
}

export interface StatusResponse {
    status: boolean;
}

// Keyed-by-id maps, matching openapi.yml's `additionalProperties: $ref` pattern.
export type ChatMap = Record<string, ChatResource>;
export type MessageMap = Record<string, MessageResource>;
export type UserMap = Record<string, UserResource>;
export type ParticipantMap = Record<string, ParticipantResource>;

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

export interface PaginationQuery {
    limit?: number;
    page?: number;
}

export interface GetChatsQuery extends PaginationQuery {
    type?: ChatType;
    owner?: string;
    created_from?: string;
    created_to?: string;
    last_message_from?: string;
    last_message_to?: string;
    metadata?: StringMap;
    with_owners?: boolean;
}

export interface GetChatMessagesQuery extends PaginationQuery {
    with_users?: boolean;
    isDeleted?: boolean;
    isEdited?: boolean;
    extra?: StringMap;
}

export interface GetUserChatsQuery extends PaginationQuery {
    order?: SortOrder;
    read?: boolean;
    metadata?: StringMap;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface GetChatsResponse extends StatusResponse {
    chats: ChatMap;
    chats_sort?: string[];
    users?: UserMap;
    meta: Meta;
    pagination: Pagination;
}

export interface GetChatInfoResponse extends StatusResponse {
    data?: { chat?: ChatResource };
}

export interface CreateChatResponse extends StatusResponse {
    data?: {
        chat?: ChatResource;
        participants?: ParticipantResource[];
    };
}

export interface UpdateChatResponse extends StatusResponse {
    data?: { chat?: ChatResource };
}

export interface GetChatMessagesResponse extends StatusResponse {
    messages: MessageMap;
    messages_sort?: string[];
    users?: ParticipantMap;
    meta: Meta;
    pagination: Pagination;
}

export interface SendMessageResponse extends StatusResponse {
    message_ids?: string[];
}

export interface UpdateMessageResponse extends StatusResponse {
    is_updated?: boolean;
    message?: MessageResource;
}

export interface GetChatParticipantsResponse extends StatusResponse {
    participants: ParticipantResource[];
    meta: Meta;
    pagination: Pagination;
}

export interface GetUserChatsResponse extends StatusResponse {
    chats: ChatResource[];
    meta: Meta;
    pagination: Pagination;
}

export interface CreateUserResponse extends StatusResponse {
    data?: { user?: UserResource };
}

export interface GetUserResponse extends StatusResponse {
    data?: { user?: UserResource };
}

export interface UpdateUserResponse extends StatusResponse {
    data?: { user?: UserResource };
}

export interface SetS3CredentialsResponse extends StatusResponse {
    modified?: boolean;
}
