'use strict';
const http    = require('node:http');
const path    = require('node:path');
const fs      = require('node:fs');
const handler = require('serve-handler');

// ── Configuration ────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, 'dist');
const port      = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1–65535.');
}
if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  throw new Error('Missing dist/index.html — run `npm run build` first.');
}

// Read the custom 404 page once at startup (fail fast if it's missing).
const page404 = (() => {
  const p = path.join(publicDir, '404.html');
  if (!fs.existsSync(p)) {
    console.warn('[warn] dist/404.html not found; plain-text fallback will be used for 404s.');
    return null;
  }
  return fs.readFileSync(p, 'utf8');
})();

// ── Rate limiter (sliding-window, in-process) ────────────────────────────────
// Limits: 200 requests per IP in any 60-second window.
const RATE_LIMIT_MAX    = 200;
const RATE_LIMIT_WINDOW = 60_000; // ms
const ipWindows = new Map(); // ip → [timestamp, …]

function isRateLimited(ip) {
  const now  = Date.now();
  const hits = (ipWindows.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  hits.push(now);
  ipWindows.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

// Prune stale IP entries every 5 minutes to prevent memory growth.
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW;
  for (const [ip, hits] of ipWindows) {
    const fresh = hits.filter(t => t > cutoff);
    if (fresh.length === 0) ipWindows.delete(ip);
    else ipWindows.set(ip, fresh);
  }
}, 300_000).unref();

// ── Security headers ──────────────────────────────────────────────────────────
// Content-Security-Policy is carefully scoped to only what the site actually needs:
//   • scripts:  same-origin only (theme-init.js + main.js)
//   • styles:   same-origin + Google Fonts CDN
//   • fonts:    same-origin + Google Fonts file CDN
//   • images:   same-origin + data URIs
//   • frames:   same-origin (PDF previews via <iframe>)
//   • connects: same-origin
//   • objects / base / forms: locked down
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://muhannadrafi.com",
  "frame-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

// Flat list of [name, value] pairs — injected via serve-handler's headers config
// and also applied manually for 404 / 429 / 500 responses.
const SECURITY_PAIRS = [
  ['Content-Security-Policy',     CSP],
  ['X-Content-Type-Options',      'nosniff'],
  ['X-Frame-Options',             'SAMEORIGIN'],
  ['X-XSS-Protection',            '1; mode=block'],
  ['Referrer-Policy',             'strict-origin-when-cross-origin'],
  ['Permissions-Policy',          'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'],
  ['Strict-Transport-Security',   'max-age=63072000; includeSubDomains; preload'],
  ['Cross-Origin-Opener-Policy',  'same-origin'],
  ['Cross-Origin-Resource-Policy','same-origin'],
];

// serve-handler `headers` format: [{source, headers:[{key,value}]}]
const SERVE_HEADERS = [{
  source: '**/*',
  headers: SECURITY_PAIRS.map(([key, value]) => ({ key, value })),
}];

function addSecurityHeaders(response, extraHeaders = {}) {
  for (const [key, value] of SECURITY_PAIRS) {
    response.setHeader(key, value);
  }
  for (const [key, value] of Object.entries(extraHeaders)) {
    response.setHeader(key, value);
  }
}

// ── 404 / error helpers ───────────────────────────────────────────────────────
function send404(response) {
  addSecurityHeaders(response, { 'Cache-Control': 'no-store' });
  if (page404) {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(page404);
  } else {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('404 Not Found');
  }
}

// ── Request handler ───────────────────────────────────────────────────────────
const server = http.createServer((request, response) => {
  // Resolve client IP (trust X-Forwarded-For only one hop; falls back to socket).
  const rawIp   = (request.headers['x-forwarded-for'] || '').split(',')[0].trim()
               || request.socket.remoteAddress
               || 'unknown';
  // Normalise IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4).
  const clientIp = rawIp.replace(/^::ffff:/, '');

  // Rate-limit check.
  if (isRateLimited(clientIp)) {
    response.writeHead(429, {
      'Content-Type':  'text/plain',
      'Retry-After':   '60',
      'Cache-Control': 'no-store',
    });
    response.end('429 Too Many Requests — please slow down.');
    return;
  }

  // Strip query string / fragment for file-system lookup.
  const rawPath = (request.url || '/').split('?')[0].split('#')[0];

  // Decode percent-encoding safely.
  let decodedPath = rawPath;
  try { decodedPath = decodeURIComponent(rawPath); } catch { /* leave as-is */ }

  // Build the candidate filesystem path.
  const filePath     = path.join(publicDir, decodedPath);
  const normFilePath = path.normalize(filePath);

  // ── Path traversal guard ───────────────────────────────────────────────────
  // Reject anything that resolves outside publicDir.
  if (normFilePath !== publicDir &&
      !normFilePath.startsWith(publicDir + path.sep)) {
    response.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    response.end('400 Bad Request');
    return;
  }

  // ── File-existence check ───────────────────────────────────────────────────
  // Determine whether there is anything to serve before handing off to
  // serve-handler, so we can return our branded 404 page instead.
  let fileExists = false;
  try {
    const stat = fs.statSync(normFilePath);
    fileExists = stat.isDirectory()
      ? fs.existsSync(path.join(normFilePath, 'index.html'))
      : true;
  } catch {
    fileExists = false;
  }

  if (!fileExists) {
    send404(response);
    return;
  }

  // ── Delegate to serve-handler ──────────────────────────────────────────────
  // Security headers are injected via serve-handler's `headers` option so they
  // are merged correctly with the Content-Type it sets.
  // The `rewrites` rule fixes a serve-handler 6.x bug where '/' returns 404
  // instead of serving the directory index.
  handler(request, response, {
    public:           publicDir,
    directoryListing: false,
    cleanUrls:        false,
    rewrites:         [{ source: '/', destination: '/index.html' }],
    headers:          SERVE_HEADERS,
  }).catch(error => {
    console.error('[error] Static response failed:', error.message);
    if (!response.headersSent) {
      addSecurityHeaders(response);
      response.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    response.end('500 Internal Server Error');
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
server.listen(port, '0.0.0.0', () => {
  console.log(`[portfolio] Listening on port ${port}`);
  console.log(`[portfolio] Serving from:  ${publicDir}`);
  console.log(`[portfolio] Rate limit:    ${RATE_LIMIT_MAX} req / ${RATE_LIMIT_WINDOW / 1000}s per IP`);
  console.log(`[portfolio] CSP:           enabled`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[portfolio] ${signal} received — shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
