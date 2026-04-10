/**
 * Fix sporadic test failures caused by IPv4/IPv6 port collisions.
 *
 * Root cause: Node.js `server.listen(0)` binds to `::` (IPv6 dual-stack) by
 * default, but supertest always connects to `127.0.0.1` (IPv4). On macOS,
 * when another process (Tailscale, OpenClaw, etc.) holds the same port on
 * IPv4, the OS routes the IPv4 connection to that process instead of the
 * test server — producing sporadic 404s, 401s, or socket hang-ups.
 *
 * Fix: monkey-patch supertest's Test.serverAddress to use the address the
 * server actually bound to (`[::1]` for IPv6) instead of hardcoded
 * `127.0.0.1`.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Server: TlsServer } = require('tls');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Test = require('supertest/lib/test');

Test.prototype.serverAddress = function (app: any, path: string) {
  const addr = app.address();
  if (!addr) {
    this._server = app.listen(0);
  }

  const resolved = app.address();
  const port = resolved.port;
  const protocol = app instanceof TlsServer ? 'https' : 'http';

  // Use the actual bound address instead of always 127.0.0.1
  const host = resolved.family === 'IPv6' ? `[::1]` : '127.0.0.1';
  return `${protocol}://${host}:${port}${path}`;
};
