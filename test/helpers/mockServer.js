const http = require('node:http');

/**
 * Start an ephemeral-port HTTP mock server used to intercept SDK requests.
 *
 * Usage:
 *   const server = await startMockServer();
 *   server.respondWith({ status: 200, body: { ok: true } });
 *   // ... SDK call against server.baseUrl ...
 *   server.lastRequest // { method, path, headers, body (parsed), rawBody }
 *   await server.close();
 *
 * Options per response:
 *   - status (number, default 200)
 *   - body (serialized via JSON.stringify if contentType is application/json)
 *   - rawBody (raw string to send — overrides body)
 *   - contentType (default 'application/json')
 *   - headers (extra response headers)
 *   - closeSocket (boolean — server destroys the socket before replying)
 *   - delayMs (number — wait before replying)
 */
function startMockServer() {
    const responses = [];
    const requests = [];

    const server = http.createServer((req, res) => {
        let raw = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            raw += chunk;
        });
        req.on('end', async () => {
            const contentType = req.headers['content-type'] || '';
            let body = raw;
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
                await new Promise((r) => setTimeout(r, next.delayMs));
            }

            if (next.closeSocket) {
                req.socket.destroy();
                return;
            }

            const status = next.status || 200;
            const headers = {
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

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            const baseUrl = `http://127.0.0.1:${port}`;

            resolve({
                server,
                baseUrl,
                /** Queue a response for the next request. Can be called multiple times. */
                respondWith(spec) {
                    responses.push(spec);
                    return this;
                },
                /** Convenience: all pending requests captured so far. */
                get requests() {
                    return requests.slice();
                },
                /** The last captured request (or undefined). */
                get lastRequest() {
                    return requests[requests.length - 1];
                },
                /** Number of queued responses still unused. */
                get pendingResponses() {
                    return responses.length;
                },
                /** Stop the server and release the port. */
                close() {
                    return new Promise((res) => server.close(() => res()));
                },
                /** Reset captured requests and queued responses between subtests. */
                reset() {
                    requests.length = 0;
                    responses.length = 0;
                },
            });
        });
    });
}

module.exports = { startMockServer };
