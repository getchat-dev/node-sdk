// Unit tests for the page-walking helpers behind `iterateChats` and friends.
//
// These pin the parts that have no HTTP in them: how items are read out of the
// two answer shapes, and — the reason this file exists — exactly when the walk
// decides there is another page. That decision has four rules that fall through
// to each other, and driving them through a real endpoint would mean building a
// server for each; here a stub is three lines. The over-the-wire behaviour is
// covered in test/integration/pagination.test.ts.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createPageIterator,
    DEFAULT_PAGE_SIZE,
    itemsFromArray,
    itemsFromMap,
    type PageInfo,
    pageSize,
    startPage,
} from '../../src/libs/paginate';

describe('libs/paginate', () => {
    describe('itemsFromMap', () => {
        const items = (body: unknown) => itemsFromMap<{ id: string }>(body, 'chats', 'chats_sort');

        test('follows the sort array', () => {
            const body = { chats: { a: { id: 'a' }, b: { id: 'b' } }, chats_sort: ['b', 'a'] };
            assert.deepEqual(
                items(body).map((c) => c.id),
                ['b', 'a'],
            );
        });

        test('skips an id in the sort array that has no item', () => {
            const body = { chats: { a: { id: 'a' } }, chats_sort: ['a', 'ghost'] };
            assert.deepEqual(
                items(body).map((c) => c.id),
                ['a'],
            );
        });

        test('falls back to the list when the sort array is missing or empty', () => {
            const chats = { a: { id: 'a' }, b: { id: 'b' } };
            assert.deepEqual(
                items({ chats }).map((c) => c.id),
                ['a', 'b'],
            );
            assert.deepEqual(
                items({ chats, chats_sort: [] }).map((c) => c.id),
                ['a', 'b'],
            );
        });

        test('takes the empty list that arrives as an array', () => {
            assert.deepEqual(items({ chats: [], chats_sort: [] }), []);
        });

        test('gives an empty list for anything unexpected', () => {
            assert.deepEqual(items({}), []);
            assert.deepEqual(items({ chats: null }), []);
            assert.deepEqual(items({ chats: 'nope' }), []);
            assert.deepEqual(items(undefined), []);
        });
    });

    describe('itemsFromArray', () => {
        test('takes the array as it is', () => {
            assert.deepEqual(itemsFromArray({ participants: [1, 2] }, 'participants'), [1, 2]);
        });

        test('gives an empty list when the key is missing or not an array', () => {
            assert.deepEqual(itemsFromArray({}, 'participants'), []);
            assert.deepEqual(itemsFromArray({ participants: { a: 1 } }, 'participants'), []);
            assert.deepEqual(itemsFromArray(null, 'participants'), []);
        });
    });

    describe('startPage', () => {
        test('anything unusable becomes page 1', () => {
            assert.equal(startPage(undefined), 1);
            assert.equal(startPage('abc'), 1);
            assert.equal(startPage(0), 1);
            assert.equal(startPage(-4), 1);
        });

        test('a usable number is kept', () => {
            assert.equal(startPage(3), 3);
            assert.equal(startPage('7'), 7);
            assert.equal(startPage(2.9), 2);
        });
    });

    describe('pageSize', () => {
        test('defaults to 100, and to the ceiling when that is smaller', () => {
            assert.equal(pageSize(undefined, 1000), DEFAULT_PAGE_SIZE);
            assert.equal(pageSize('abc', 1000), DEFAULT_PAGE_SIZE);
            assert.equal(pageSize(0, 1000), DEFAULT_PAGE_SIZE);
            assert.equal(pageSize(-3, 1000), DEFAULT_PAGE_SIZE);
            assert.equal(pageSize(undefined, 50), 50);
        });

        test('keeps the number asked for, up to the ceiling', () => {
            assert.equal(pageSize(25, 1000), 25);
            assert.equal(pageSize('300', 1000), 300);
            assert.equal(pageSize(5000, 1000), 1000);
            assert.equal(pageSize(5000, 250), 250);
        });
    });

    describe('createPageIterator', () => {
        /**
         * A stub endpoint serving the given pages in order, and recording which
         * page numbers were asked for — `asked` is what most of these tests
         * assert on, since the point is where the walk stops, not what it read.
         *
         * Asking for a page that isn't there fails the test rather than
         * returning nothing: a walk that runs off the end must be loud.
         */
        const fake = (pages: Array<{ items: number[]; pagination: PageInfo }>) => {
            const asked: number[] = [];
            const it = createPageIterator<number>({
                startPage: 1,
                limit: 2,
                fetch: (page) => {
                    asked.push(page);
                    const body = pages[page - 1];
                    assert.ok(body, `no page ${page} to serve — the walk asked once too often`);
                    return Promise.resolve({ items: body.items, pagination: body.pagination, meta: {} });
                },
                items: (response) => itemsFromArray<number>(response, 'items'),
            });
            return { it, asked };
        };

        test('follows next_page_url and stops when it turns null', async () => {
            const { it, asked } = fake([
                { items: [1, 2], pagination: { next_page_url: '/p2', total: 1 } },
                { items: [3], pagination: { next_page_url: null, total: 99 } },
            ]);

            assert.deepEqual(await it.toArray(), [1, 2, 3]);
            assert.deepEqual(asked, [1, 2]);
        });

        test('an empty next_page_url counts as the last page', async () => {
            const { it, asked } = fake([{ items: [1], pagination: { next_page_url: '' } }]);

            assert.deepEqual(await it.toArray(), [1]);
            assert.deepEqual(asked, [1]);
        });

        test('without next_page_url it follows the page count', async () => {
            const { it, asked } = fake([
                { items: [1], pagination: { total: 2 } },
                { items: [2], pagination: { total: 2 } },
            ]);

            assert.deepEqual(await it.toArray(), [1, 2]);
            assert.deepEqual(asked, [1, 2]);
        });

        test('with no signal at all it goes by how full the page is', async () => {
            const { it, asked } = fake([
                { items: [1, 2], pagination: {} }, // full for the requested limit of 2
                { items: [3], pagination: {} }, // short — the last one
            ]);

            assert.deepEqual(await it.toArray(), [1, 2, 3]);
            assert.deepEqual(asked, [1, 2]);
        });

        test('fullness follows the page size the server reports', async () => {
            const { it, asked } = fake([
                { items: [1], pagination: { items_per_page: 1 } }, // full by the server's own size
                { items: [], pagination: { items_per_page: 1 } },
            ]);

            assert.deepEqual(await it.toArray(), [1]);
            assert.deepEqual(asked, [1, 2]);
        });

        test('a page the server served under another number ends the walk', async () => {
            // `pagination.current` is the page the server actually served. When it
            // disagrees with the one we asked for, our page ran past the end and was
            // clamped back — everything on it has been handed over already.
            const asked: number[] = [];
            const it = createPageIterator<number>({
                startPage: 1,
                limit: 2,
                fetch: (page) => {
                    asked.push(page);
                    // A walk that doesn't notice the clamp never ends, so cut it off
                    // here — the test must fail, not hang.
                    assert.ok(asked.length <= 4, `the walk kept asking: ${asked.join(', ')}`);
                    return Promise.resolve({
                        items: [1, 2],
                        pagination: { items_per_page: 2, current: 1 }, // always page 1
                        meta: {},
                    });
                },
                items: (response) => itemsFromArray<number>(response, 'items'),
            });

            assert.deepEqual(await it.toArray(), [1, 2]);
            assert.deepEqual(asked, [1, 2]);
        });

        test('a page count of 0 on an empty first page is not read as a clamp', async () => {
            // The backend reports `current: 0` when nothing matched. That is not a
            // page served under another number, so the (empty) page still arrives —
            // it carries the counts a caller may want to show.
            const it = createPageIterator<number>({
                startPage: 1,
                limit: 2,
                fetch: () => Promise.resolve({ items: [], pagination: { current: 0, total: 0 }, meta: {} }),
                items: (response) => itemsFromArray<number>(response, 'items'),
            });

            const pages = [];
            for await (const page of it.pages()) pages.push(page);

            assert.equal(pages.length, 1);
            assert.deepEqual(pages[0].items, []);
        });

        test('an empty page after the first one is not handed over', async () => {
            const { it, asked } = fake([
                { items: [1], pagination: { next_page_url: '/p2' } },
                { items: [], pagination: { next_page_url: '/p3' } },
            ]);

            const sizes = [];
            for await (const page of it.pages()) sizes.push(page.items.length);

            assert.deepEqual(sizes, [1], 'the trailing empty page should not reach the caller');
            assert.deepEqual(asked, [1, 2]);
        });

        test('an empty page ends the walk however loudly the server points on', async () => {
            const { it, asked } = fake([{ items: [], pagination: { next_page_url: '/p2', total: 9 } }]);

            assert.deepEqual(await it.toArray(), []);
            assert.deepEqual(asked, [1]);
        });

        test('pages() carries the counts, and `raw` keeps the whole answer', async () => {
            const { it } = fake([{ items: [1], pagination: { next_page_url: null, current: 1, total: 1 } }]);

            const pages = [];
            for await (const page of it.pages()) pages.push(page);

            assert.equal(pages.length, 1);
            assert.deepEqual(pages[0].items, [1]);
            assert.equal(pages[0].pagination.current, 1);
            // `meta` is empty in this answer, so `output` falls back to what we read.
            assert.equal(pages[0].meta.output, 1);
            assert.equal(pages[0].meta.total, 0);
            assert.deepEqual((pages[0].raw as { items: number[] }).items, [1]);
        });

        test('each walk starts over from the first page', async () => {
            const { it, asked } = fake([{ items: [1], pagination: { next_page_url: null } }]);

            await it.toArray();
            for await (const _item of it) {
                /* second walk */
            }
            for await (const _page of it.pages()) {
                /* third walk */
            }

            assert.deepEqual(asked, [1, 1, 1]);
        });

        test('leaving the loop early stops the walk', async () => {
            const { it, asked } = fake([
                { items: [1, 2], pagination: { next_page_url: '/p2' } },
                { items: [3], pagination: { next_page_url: null } },
            ]);

            for await (const item of it) {
                assert.equal(item, 1);
                break;
            }

            assert.deepEqual(asked, [1]);
        });
    });
});
