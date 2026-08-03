// Walking a list endpoint page by page.
//
// All four list endpoints (`chats`, a chat's messages, a chat's participants and
// a user's chats) agree on the request — `page` + `limit` — and on the `meta` /
// `pagination` blocks of the answer. They disagree only on how the items
// themselves are shaped: two hand back an object keyed by id plus a sort array,
// two hand back a plain array. That difference lives in the `items` callback of
// `PageSource`; everything else here is shared.

import * as _ from './helpers.js';

/** Page state of a list answer. Every field is optional — old answers may omit some. */
export interface PageInfo {
    items_per_page?: number;
    current?: number;
    total?: number;
    next_page_url?: string | null;
    prev_page_url?: string | null;
}

/** One page, as handed over by {@link PageIterator.pages}. */
export interface Page<T> {
    /** The items of this page, in the server's order. */
    items: T[];
    /** `total` — how many there are in all; `output` — how many are on this page. */
    meta: { total: number; output: number };
    pagination: PageInfo;
    /** The untouched answer, for the extras a page also carries (e.g. `users`). */
    raw: unknown;
}

/**
 * A list you can walk. Iterating it gives you the items one by one, across
 * pages; {@link pages} hands over whole pages, and {@link toArray} collects
 * everything. Each of the three starts a fresh walk from the first page.
 */
export interface PageIterator<T> extends AsyncIterable<T> {
    pages(): AsyncIterableIterator<Page<T>>;
    toArray(): Promise<T[]>;
}

/** What one endpoint has to say about itself for the walk to work. */
export interface PageSource<T> {
    /** The page to start from. */
    startPage: number;
    /** How many items to ask for. */
    limit: number;
    /** Ask for one page. */
    fetch(page: number, limit: number): Promise<unknown>;
    /** Pull the items out of an answer, in the server's order. */
    items(response: unknown): T[];
}

/** Page size used when the caller doesn't name one. */
export const DEFAULT_PAGE_SIZE = 100;

const asRecord = (value: unknown): Record<string, unknown> => (_.isPlainObject(value) ? value : {});

const asCount = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function pageInfo(response: unknown): PageInfo {
    const block = asRecord(asRecord(response).pagination);
    return block as PageInfo;
}

function pageMeta(response: unknown, itemCount: number): Page<unknown>['meta'] {
    const block = asRecord(asRecord(response).meta);
    return {
        total: asCount(block.total) ?? 0,
        // The participant list leaves `output` out; the items we just read are a
        // better answer than 0.
        output: asCount(block.output) ?? itemCount,
    };
}

/**
 * Is there another page after this one?
 *
 * `next_page_url` is the clearest signal, so it wins: a URL means "keep going",
 * an explicit `null` means "that was the last one" even when the page count
 * disagrees. Only when the key is missing altogether do we fall back to the page
 * count, and then to the size of the page itself — a full page suggests more,
 * and asking once too often is better than cutting a list short.
 */
function hasMorePages(info: PageInfo, page: number, itemCount: number, limit: number): boolean {
    const next = info.next_page_url;
    if (_.isString(next)) return next.length > 0;
    if (next === null) return false;

    const pages = asCount(info.total);
    if (pages !== undefined) return page < pages;

    // The server may hand back smaller pages than we asked for, so trust the size
    // it reports over the one we requested.
    const size = asCount(info.items_per_page);
    return itemCount >= (size && size > 0 ? size : limit);
}

/** Items of an answer that keys them by id and lists the order separately. */
export function itemsFromMap<T>(response: unknown, key: string, sortKey: string): T[] {
    const list = asRecord(response)[key];
    // An empty list arrives as `[]`, not `{}`.
    if (Array.isArray(list)) return list as T[];
    if (!_.isPlainObject(list)) return [];

    const order = asRecord(response)[sortKey];
    if (!_.isFilledArray(order)) return Object.values(list) as T[];

    const items: T[] = [];
    for (const id of order as unknown[]) {
        const item = list[String(id)];
        // An id in the order that has no item behind it is simply skipped.
        if (item !== undefined) items.push(item as T);
    }
    return items;
}

/** Items of an answer that hands them over as a plain array. */
export function itemsFromArray<T>(response: unknown, key: string): T[] {
    const list = asRecord(response)[key];
    return Array.isArray(list) ? (list as T[]) : [];
}

/** Turn one endpoint into a list you can walk. */
export function createPageIterator<T>(source: PageSource<T>): PageIterator<T> {
    async function* walk(): AsyncGenerator<Page<T>> {
        let page = source.startPage;

        for (;;) {
            const raw = await source.fetch(page, source.limit);
            const items = source.items(raw);
            const info = pageInfo(raw);

            yield { items, meta: pageMeta(raw, items.length), pagination: info, raw };

            // An empty page ends the walk whatever the server says next — otherwise
            // a stale `next_page_url` would keep us going forever.
            if (items.length === 0) return;
            if (!hasMorePages(info, page, items.length, source.limit)) return;

            page += 1;
        }
    }

    return {
        async *[Symbol.asyncIterator]() {
            for await (const page of walk()) yield* page.items;
        },
        pages: () => walk(),
        async toArray() {
            const all: T[] = [];
            for await (const page of walk()) all.push(...page.items);
            return all;
        },
    };
}

/** The page to start from: at least 1, and 1 when nothing sensible was passed. */
export const startPage = (value: unknown): number => Math.max(parseInt(String(value), 10) || 1, 1);

/** How many items to ask for: the caller's number, kept inside 1…`max`. */
export const pageSize = (value: unknown, max: number): number => {
    const n = parseInt(String(value), 10);
    if (!Number.isFinite(n) || n < 1) return Math.min(DEFAULT_PAGE_SIZE, max);
    return Math.min(n, max);
};
