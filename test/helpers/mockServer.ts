import * as http from 'node:http';

export interface MockResponse {
    status?: number;
    body?: unknown;
    rawBody?: string;
    contentType?: string;
    headers?: Record<string, string>;
    closeSocket?: boolean;
    delayMs?: number;
}

export interface CapturedRequest {
    method: string | undefined;
    path: string | undefined;
    headers: http.IncomingHttpHeaders;
    body: unknown;
    rawBody: string;
}

export interface MockServer {
    server: http.Server;
    baseUrl: string;
    respondWith(spec: MockResponse): MockServer;
    readonly requests: CapturedRequest[];
    readonly lastRequest: CapturedRequest | undefined;
    readonly pendingResponses: number;
    close(): Promise<void>;
    reset(): void;
}

export function startMockServer(): Promise<MockServer> {
    const responses: MockResponse[] = [];
    const requests: CapturedRequest[] = [];

    const server = http.createServer((req, res) => {
        let raw = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
            raw += chunk;
        });
        req.on('end', async () => {
            const contentType = req.headers['content-type'] || '';
            let body: unknown = raw;
            if (raw && contentType.startsWith('application/json')) {
                try {
                    body = JSON.parse(raw);
                } catch {
                    /* leave raw */
                }
            }
            requests.push({
                method: req.method,
                path: req.url,
                headers: req.headers,
                body,
                rawBody: raw,
            });

            const next = responses.shift();
            if (!next) {
                res.statusCode = 599;
                res.end(`mock: no response queued for ${req.method} ${req.url}`);
                return;
            }

            if (next.delayMs) {
                await new Promise<void>((r) => setTimeout(r, next.delayMs));
            }

            // The client may have aborted during the delay (e.g. a timeout test);
            // writing to a dead socket would throw. Check `res.destroyed` (socket
            // gone) — NOT `req.destroyed`, which is simply true once a GET's (empty)
            // body has been consumed and does not mean the client left.
            if (res.destroyed) {
                return;
            }

            if (next.closeSocket) {
                req.socket.destroy();
                return;
            }

            const status = next.status || 200;
            const headers: Record<string, string> = {
                'content-type': next.contentType || 'application/json',
                ...(next.headers || {}),
            };

            let payload = '';
            if (typeof next.rawBody === 'string') {
                payload = next.rawBody;
            } else if (next.body !== undefined) {
                payload = headers['content-type'].startsWith('application/json')
                    ? JSON.stringify(next.body)
                    : String(next.body);
            }

            res.writeHead(status, headers);
            res.end(payload);
        });
    });

    return new Promise<MockServer>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            const baseUrl = `http://127.0.0.1:${port}`;

            const api: MockServer = {
                server,
                baseUrl,
                respondWith(spec: MockResponse) {
                    responses.push(spec);
                    return api;
                },
                get requests() {
                    return requests.slice();
                },
                get lastRequest() {
                    return requests[requests.length - 1];
                },
                get pendingResponses() {
                    return responses.length;
                },
                close() {
                    return new Promise<void>((r) => {
                        // Force-drop any lingering (e.g. aborted) connections first,
                        // otherwise close() can wait on a half-open socket forever.
                        server.closeAllConnections?.();
                        server.close(() => r());
                    });
                },
                reset() {
                    requests.length = 0;
                    responses.length = 0;
                },
            };

            resolve(api);
        });
    });
}
