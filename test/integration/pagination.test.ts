import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

// ---------------------------------------------------------------------------
// Page builders. The four list endpoints agree on the query (`page` + `limit`)
// and on the `meta` / `pagination` objects; they disagree on how the items
// themselves are shaped, so each builder mirrors one real response.
// ---------------------------------------------------------------------------

interface PageOpts {
    page?: number;
    pages?: number;
    /** Explicit `next_page_url`; `undefined` derives it from page/pages, `omit` drops the key. */
    next?: string | null | 'omit';
    /** Drop `pagination.total` from the response. */
    noTotal?: boolean;
    limit?: number;
}

function pagination(ids: string[], o: PageOpts) {
    const page = o.page ?? 1;
    const pages = o.pages ?? 1;
    const next = o.next === undefined ? (page < pages ? `http://x/api/v1/list?page=${page + 1}` : null) : o.next;
    const block: Record<string, unknown> = {
        items_per_page: o.limit ?? 100,
        current: page,
        prev_page_url: null,
    };
    if (!o.noTotal) block.total = pages;
    if (next !== 'omit') block.next_page_url = next;
    return {
        meta: { total: pages * ids.length, output: ids.length },
        pagination: block,
    };
}

const chat = (id: string) => ({
    id,
    type: 'group',
    title: `Chat ${id}`,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
});

const message = (id: string) => ({
    id,
    seq: Number(id.replace(/\D/g, '')),
    user_id: 'u-1',
    text: `text ${id}`,
    created_at: 1_770_000_000,
    updated_at: null,
    is_deleted: false,
    is_edited: false,
    versions: 0,
    extra: {},
});

const participant = (id: string) => ({
    id,
    name: `Person ${id}`,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
});

/** GET /chats — map keyed by id + `chats_sort`. */
function chatsPage(ids: string[], o: PageOpts & { chats?: unknown; sort?: string[] | 'omit' } = {}) {
    const map: Record<string, unknown> = {};
    for (const id of ids) map[id] = chat(id);
    const body: Record<string, unknown> = {
        status: true,
        chats: o.chats !== undefined ? o.chats : map,
        ...pagination(ids, o),
    };
    if (o.sort !== 'omit') body.chats_sort = o.sort ?? ids;
    return { status: 200, body };
}

/** GET /chats/{id}/messages — map keyed by id + `messages_sort`. */
function messagesPage(ids: string[], o: PageOpts & { sort?: string[] | 'omit' } = {}) {
    const map: Record<string, unknown> = {};
    for (const id of ids) map[id] = message(id);
    const body: Record<string, unknown> = { status: true, messages: map, ...pagination(ids, o) };
    if (o.sort !== 'omit') body.messages_sort = o.sort ?? ids;
    return { status: 200, body };
}

/** GET /chats/{id}/participants — plain array. */
const participantsPage = (ids: string[], o: PageOpts = {}) => ({
    status: 200,
    body: { status: true, participants: ids.map(participant), ...pagination(ids, o) },
});

/** GET /users/{id}/chats — plain array. */
const userChatsPage = (ids: string[], o: PageOpts = {}) => ({
    status: 200,
    body: { status: true, chats: ids.map(chat), ...pagination(ids, o) },
});

/** `page` / `limit` of every request the mock server saw, in order. */
function paging(server: MockServer): Array<{ page: string | null; limit: string | null }> {
    return server.requests.map((r) => {
        const q = new URL(r.path ?? '', 'http://x').searchParams;
        return { page: q.get('page'), limit: q.get('limit') };
    });
}

describe('pagination helpers', () => {
    let server: MockServer;
    let sdk: Emby;

    before(async () => {
        server = await startMockServer();
        sdk = makeSdk(server.baseUrl);
    });
    after(async () => {
        await server.close();
    });
    beforeEach(() => {
        server.reset();
    });

    // -----------------------------------------------------------------------
    // iterateChats — the map-shaped list, and the walk itself
    // -----------------------------------------------------------------------

    describe('iterateChats', () => {
        test('a bad query is refused where you write it, not on the first page', () => {
            assert.throws(() => sdk.iterateChats('nope' as unknown as Record<string, never>), /plain object/);
            assert.equal(server.requests.length, 0);
        });

        test('per-call options stay out of the query string', async () => {
            server.respondWith(chatsPage(['c1'], {}));

            await sdk.iterateChats({ timeout: 5_000, retries: 0, retryDelay: 10 }).toArray();

            const path = server.lastRequest!.path!;
            assert.doesNotMatch(path, /timeout/);
            assert.doesNotMatch(path, /retries/);
            assert.doesNotMatch(path, /retryDelay/);
        });

        test('pages() still hands over one page when nothing matched', async () => {
            server.respondWith(chatsPage([], {}));

            const pages = [];
            for await (const p of sdk.iterateChats().pages()) pages.push(p);

            assert.equal(pages.length, 1);
            assert.deepEqual(pages[0].items, []);
            assert.equal(pages[0].meta.total, 0);
        });

        test('walks every page and yields the items in `chats_sort` order', async () => {
            server.respondWith(chatsPage(['c1', 'c2'], { page: 1, pages: 3 }));
            server.respondWith(chatsPage(['c3', 'c4'], { page: 2, pages: 3 }));
            server.respondWith(chatsPage(['c5'], { page: 3, pages: 3 }));

            const seen: string[] = [];
            for await (const c of sdk.iterateChats()) seen.push(c.id);

            assert.deepEqual(seen, ['c1', 'c2', 'c3', 'c4', 'c5']);
            assert.equal(server.requests.length, 3);
            assert.equal(server.pendingResponses, 0);
        });

        test('asks for page 1 with 100 items by default, then walks page by page', async () => {
            server.respondWith(chatsPage(['c1'], { page: 1, pages: 2 }));
            server.respondWith(chatsPage(['c2'], { page: 2, pages: 2 }));

            await sdk.iterateChats().toArray();

            assert.deepEqual(paging(server), [
                { page: '1', limit: '100' },
                { page: '2', limit: '100' },
            ]);
            for (const r of server.requests) {
                assert.equal(r.method, 'GET');
                assert.match(r.path!, /^\/api\/v1\/chats\?/);
            }
        });

        test('an explicit limit is used and capped at 1000', async () => {
            server.respondWith(chatsPage(['c1'], {}));
            await sdk.iterateChats({ limit: 250 }).toArray();
            assert.equal(paging(server)[0].limit, '250');

            server.reset();
            server.respondWith(chatsPage(['c1'], {}));
            await sdk.iterateChats({ limit: 5000 }).toArray();
            assert.equal(paging(server)[0].limit, '1000');
        });

        test('starts from the page given in the query', async () => {
            server.respondWith(chatsPage(['c7'], { page: 4, pages: 5 }));
            server.respondWith(chatsPage(['c8'], { page: 5, pages: 5 }));

            const ids = (await sdk.iterateChats({ page: 4 }).toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c7', 'c8']);
            assert.deepEqual(
                paging(server).map((p) => p.page),
                ['4', '5'],
            );
        });

        test('filters go out with every page, including the lenient ones', async () => {
            server.respondWith(chatsPage(['c1'], { page: 1, pages: 2 }));
            server.respondWith(chatsPage(['c2'], { page: 2, pages: 2 }));

            await sdk.iterateChats({ type: 'group', with_owners: true, owner: 'u-owner' }).toArray();

            assert.equal(server.requests.length, 2);
            for (const r of server.requests) {
                assert.match(r.path!, /type=group/);
                assert.match(r.path!, /with_owners=1/);
                assert.match(r.path!, /owner=u-owner/);
            }
        });

        test('stops when `next_page_url` is null, even if the page count says otherwise', async () => {
            server.respondWith(chatsPage(['c1'], { page: 1, pages: 9, next: null }));

            const ids = (await sdk.iterateChats().toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c1']);
            assert.equal(server.requests.length, 1);
        });

        test('falls back to the page count when `next_page_url` is missing', async () => {
            server.respondWith(chatsPage(['c1'], { page: 1, pages: 2, next: 'omit' }));
            server.respondWith(chatsPage(['c2'], { page: 2, pages: 2, next: 'omit' }));

            const ids = (await sdk.iterateChats().toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c1', 'c2']);
            assert.equal(server.requests.length, 2);
        });

        test('with neither signal, keeps going while pages come back full', async () => {
            const opts = { next: 'omit' as const, noTotal: true, limit: 2 };
            server.respondWith(chatsPage(['c1', 'c2'], opts)); // full → ask again
            server.respondWith(chatsPage(['c3'], opts)); // short → last one

            const ids = (await sdk.iterateChats({ limit: 2 }).toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c1', 'c2', 'c3']);
            assert.equal(server.requests.length, 2);
        });

        test('a page is "full" by the size the server reports, not the one we asked for', async () => {
            // The server may hand back smaller pages than requested. Judging fullness
            // by our own `limit` would end the walk after the first page.
            const opts = { next: 'omit' as const, noTotal: true, limit: 1 };
            server.respondWith(chatsPage(['c1'], opts));
            server.respondWith(chatsPage([], opts));

            const ids = (await sdk.iterateChats({ limit: 2 }).toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c1']);
            assert.equal(server.requests.length, 2);
        });

        test('stops on an empty page even when the server still points further', async () => {
            server.respondWith(chatsPage(['c1'], { page: 1, pages: 5 }));
            server.respondWith(chatsPage([], { page: 2, pages: 5 }));

            const ids = (await sdk.iterateChats().toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c1']);
            assert.equal(server.requests.length, 2);
        });

        test('no results: no items, one request', async () => {
            server.respondWith(chatsPage([], {}));

            const all = await sdk.iterateChats().toArray();

            assert.deepEqual(all, []);
            assert.equal(server.requests.length, 1);
        });

        test('handles the empty list arriving as `[]` instead of `{}`', async () => {
            server.respondWith(chatsPage([], { chats: [], sort: [] }));

            assert.deepEqual(await sdk.iterateChats().toArray(), []);
        });

        test('skips an id that is in the sort array but missing from the list', async () => {
            server.respondWith(chatsPage(['c1', 'c2'], { sort: ['c1', 'ghost', 'c2'] }));

            const ids = (await sdk.iterateChats().toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c1', 'c2']);
        });

        test('falls back to the list itself when the sort array is missing', async () => {
            server.respondWith(chatsPage(['c1', 'c2'], { sort: 'omit' }));

            const ids = (await sdk.iterateChats().toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c1', 'c2']);
        });

        test('leaving the loop early stops asking for more', async () => {
            server.respondWith(chatsPage(['c1', 'c2'], { page: 1, pages: 5 }));

            const seen: string[] = [];
            for await (const c of sdk.iterateChats()) {
                seen.push(c.id);
                break;
            }

            assert.deepEqual(seen, ['c1']);
            assert.equal(server.requests.length, 1);
        });

        test('a failing page throws out of the loop and stops the walk', async () => {
            server.respondWith(chatsPage(['c1'], { page: 1, pages: 3 }));
            server.respondWith({ status: 500, body: { status: false, message: 'boom' } });

            const seen: string[] = [];
            await assert.rejects(
                (async () => {
                    for await (const c of sdk.iterateChats()) seen.push(c.id);
                })(),
                (e) => (e as Error & { status?: number }).status === 500,
            );

            assert.deepEqual(seen, ['c1']);
            assert.equal(server.requests.length, 2);
        });

        test('a cancelled walk stops between pages', async () => {
            server.respondWith(chatsPage(['c1'], { page: 1, pages: 3 }));
            server.respondWith({ ...chatsPage(['c2'], { page: 2, pages: 3 }), delayMs: 300 });

            const ac = new AbortController();
            const seen: string[] = [];

            await assert.rejects(
                (async () => {
                    for await (const c of sdk.iterateChats({ signal: ac.signal })) {
                        seen.push(c.id);
                        setTimeout(() => ac.abort(), 20);
                    }
                })(),
                (e) => (e as Error).name === 'AbortError',
            );

            assert.deepEqual(seen, ['c1']);
            assert.equal(server.requests.length, 2);
        });

        test('the same iterator can be walked twice, starting over each time', async () => {
            const it = sdk.iterateChats();

            server.respondWith(chatsPage(['c1'], {}));
            assert.deepEqual(
                (await it.toArray()).map((c) => c.id),
                ['c1'],
            );

            server.respondWith(chatsPage(['c1'], {}));
            const second: string[] = [];
            for await (const c of it) second.push(c.id);

            assert.deepEqual(second, ['c1']);
            assert.equal(server.requests.length, 2);
            assert.deepEqual(
                paging(server).map((p) => p.page),
                ['1', '1'],
            );
        });

        test('pages() hands over whole pages, counts included', async () => {
            server.respondWith(chatsPage(['c1', 'c2'], { page: 1, pages: 2 }));
            server.respondWith(chatsPage(['c3'], { page: 2, pages: 2 }));

            const pages = [];
            for await (const p of sdk.iterateChats().pages()) pages.push(p);

            assert.equal(pages.length, 2);
            assert.deepEqual(
                pages[0].items.map((c) => c.id),
                ['c1', 'c2'],
            );
            assert.deepEqual(
                pages[1].items.map((c) => c.id),
                ['c3'],
            );
            assert.equal(pages[0].pagination.current, 1);
            assert.equal(pages[0].pagination.total, 2);
            assert.equal(pages[0].meta.output, 2);
            // The untouched answer stays reachable — that is where `users` and the
            // rest of the endpoint-specific extras live.
            assert.deepEqual((pages[0].raw as { chats_sort: string[] }).chats_sort, ['c1', 'c2']);
        });
    });

    // -----------------------------------------------------------------------
    // The other three lists
    // -----------------------------------------------------------------------

    describe('iterateMessagesFromChat', () => {
        test('walks pages and yields in `messages_sort` order', async () => {
            server.respondWith(messagesPage(['m1', 'm2'], { page: 1, pages: 2 }));
            server.respondWith(messagesPage(['m3'], { page: 2, pages: 2 }));

            const ids = (await sdk.iterateMessagesFromChat('c1').toArray()).map((m) => m.id);

            assert.deepEqual(ids, ['m1', 'm2', 'm3']);
            for (const r of server.requests) {
                assert.match(r.path!, /^\/api\/v1\/chats\/c1\/messages\?/);
            }
        });

        test('filters are coerced the same way as in getMessagesFromChat', async () => {
            server.respondWith(messagesPage(['m1'], { page: 1, pages: 2 }));
            server.respondWith(messagesPage(['m2'], { page: 2, pages: 2 }));

            await sdk.iterateMessagesFromChat('c1', { with_users: true, isDeleted: false }).toArray();

            assert.equal(server.requests.length, 2);
            for (const r of server.requests) {
                assert.match(r.path!, /with_users=1/);
                assert.match(r.path!, /isDeleted=0/);
            }
        });
    });

    describe('iterateChatParticipants', () => {
        test('a missing chat id is refused right away', () => {
            assert.throws(() => sdk.iterateChatParticipants(undefined as unknown as string), /chat id isn't passed/);
            assert.equal(server.requests.length, 0);
        });

        test('walks the plain array list', async () => {
            server.respondWith(participantsPage(['u1', 'u2'], { page: 1, pages: 2 }));
            server.respondWith(participantsPage(['u3'], { page: 2, pages: 2 }));

            const ids = (await sdk.iterateChatParticipants('c1').toArray()).map((p) => p.id);

            assert.deepEqual(ids, ['u1', 'u2', 'u3']);
            assert.deepEqual(
                paging(server).map((p) => p.page),
                ['1', '2'],
            );
            for (const r of server.requests) {
                assert.match(r.path!, /^\/api\/v1\/chats\/c1\/participants\?/);
            }
        });
    });

    describe('iterateUserChats', () => {
        test('a missing user id is refused right away', () => {
            assert.throws(() => sdk.iterateUserChats(undefined as unknown as string), /user id isn't passed/);
            assert.equal(server.requests.length, 0);
        });

        test('walks the plain array list', async () => {
            server.respondWith(userChatsPage(['c1'], { page: 1, pages: 2 }));
            server.respondWith(userChatsPage(['c2'], { page: 2, pages: 2 }));

            const ids = (await sdk.iterateUserChats('u-1').toArray()).map((c) => c.id);

            assert.deepEqual(ids, ['c1', 'c2']);
            for (const r of server.requests) {
                assert.match(r.path!, /^\/api\/v1\/users\/u-1\/chats\?/);
            }
        });

        test('the page size is capped at 250 here, not 1000', async () => {
            server.respondWith(userChatsPage(['c1'], {}));

            await sdk.iterateUserChats('u-1', { limit: 5000 }).toArray();

            assert.equal(paging(server)[0].limit, '250');
        });

        test('filters go out with every page', async () => {
            server.respondWith(userChatsPage(['c1'], { page: 1, pages: 2 }));
            server.respondWith(userChatsPage(['c2'], { page: 2, pages: 2 }));

            await sdk.iterateUserChats('u-1', { order: 'desc', read: false, with_last_message: true }).toArray();

            assert.equal(server.requests.length, 2);
            for (const r of server.requests) {
                assert.match(r.path!, /order=desc/);
                assert.match(r.path!, /read=false/);
                assert.match(r.path!, /with_last_message=1/);
            }
        });
    });
});
