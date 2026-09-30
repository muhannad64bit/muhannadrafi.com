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

const SECURITY_HEADERS = {
  'Content-Security-Policy':           CSP,
  'X-Content-Type-Options':            'nosniff',
  'X-Frame-Options':                   'DENY',
  'X-XSS-Protection':                  '1; mode=block',
  'Referrer-Policy':                   'strict-origin-when-cross-origin',
  'Permissions-Policy':                [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'interest-cohort=()',
  ].join(', '),
  'Strict-Transport-Security':         'max-age=63072000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy':        'same-origin',
  'Cross-Origin-Resource-Policy':      'same-origin',
};

// Cache durations per asset type (in seconds).
function cacheFor(urlPath) {
  if (/\.(woff2?|ttf|otf|eot)$/i.test(urlPath))   return 'public, max-age=31536000, immutable'; // fonts: 1 yr
  if (/\.(css|js)$/i.test(urlPath))                 return 'public, max-age=86400';               // css/js: 1 day
  if (/\.(jpe?g|png|gif|svg|webp|avif|ico)$/i.test(urlPath)) return 'public, max-age=604800';    // images: 1 wk
  if (/\.(pdf)$/i.test(urlPath))                    return 'public, max-age=3600';                // PDFs: 1 hr
  return 'public, max-age=0, must-revalidate';                                                    // HTML: always revalidate
}

function applySecurityHeaders(response, urlPath) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(key, value);
  }
  response.setHeader('Cache-Control', cacheFor(urlPath));
}

// ── 404 helper ───────────────────────────────────────────────────────────────
function send404(response, urlPath) {
  applySecurityHeaders(response, urlPath);
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

  // Apply security headers to every response.
  applySecurityHeaders(response, request.url || '/');

  // serve-handler resolves the file and streams it.  We intercept the 404
  // case by checking whether the resolved file actually exists first.
  const urlPath   = (request.url || '/').split('?')[0].split('#')[0];
  const filePath  = path.join(publicDir, urlPath);

  // Directory index: rewrite to index.html (serve-handler already does this,
  // but we need to know whether to 404 before invoking it).
  let resolvedPath = filePath;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) resolvedPath = path.join(filePath, 'index.html');
  } catch {
    // File doesn't exist — fall through to 404.
  }

  if (!fs.existsSync(resolvedPath) && !urlPath.endsWith('/')) {
    // Nothing on disk for this URL → serve our custom 404.
    send404(response, urlPath);
    return;
  }

  // Let serve-handler stream the file.
  handler(request, response, {
    public:           publicDir,
    directoryListing: false,
    cleanUrls:        false,
    // Deliberately no 'headers' here — we've already set them above.
  }).catch(error => {
    console.error('[error] Static response failed:', error.message);
    if (!response.headersSent) {
      applySecurityHeaders(response, urlPath);
      response.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    response.end('500 Internal Server Error');
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
server.listen(port, '0.0.0.0', () => {
  console.log(`[portfolio] Listening on port ${port}`);
  console.log(`[portfolio] Serving from: ${publicDir}`);
  console.log(`[portfolio] Rate limit: ${RATE_LIMIT_MAX} req / ${RATE_LIMIT_WINDOW / 1000}s per IP`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[portfolio] ${signal} received — shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
