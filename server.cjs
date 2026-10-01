'use strict';

const http    = require('node:http');
const path    = require('node:path');
const fs      = require('node:fs');
const handler = require('serve-handler');

// ── Logger Utility ────────────────────────────────────────────────────────────

/**
 * Simple logger utility with timestamps and log levels
 */
const logger = {
  info: (message, ...args) => console.log(`[${new Date().toISOString()}] INFO: ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[${new Date().toISOString()}] WARN: ${message}`, ...args),
  error: (message, ...args) => console.error(`[${new Date().toISOString()}] ERROR: ${message}`, ...args),
  debug: (message, ...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${new Date().toISOString()}] DEBUG: ${message}`, ...args);
    }
  }
};

// ── Configuration ────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 3000);
const isDevelopment = process.env.NODE_ENV === 'development';

// Validate port configuration
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  logger.error('PORT must be an integer between 1–65535.');
  process.exit(1);
}

// Validate that the build directory exists and contains required files
const requiredFiles = ['index.html'];
const missingFiles = requiredFiles.filter(file => 
  !fs.existsSync(path.join(publicDir, file))
);

if (missingFiles.length > 0) {
  logger.error(`Missing required files in ${publicDir}: ${missingFiles.join(', ')}. Run 'npm run build' first.`);
  process.exit(1);
}

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  logger.error(`Public directory ${publicDir} does not exist.`);
  process.exit(1);
}

logger.info(`Configuration validated - serving from ${publicDir} on port ${port}`);

// Read the custom 404 page once at startup
const page404 = (() => {
  const p = path.join(publicDir, '404.html');
  try {
    if (!fs.existsSync(p)) {
      logger.warn('dist/404.html not found; plain-text fallback will be used for 404s.');
      return null;
    }
    const content = fs.readFileSync(p, 'utf8');
    logger.info('Custom 404 page loaded successfully');
    return content;
  } catch (error) {
    logger.error('Failed to read 404.html:', error.message);
    return null;
  }
})();

// ── Rate Limiter Module (sliding-window, in-process) ────────────────────────
// Limits: 200 requests per IP in any 60-second window.
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '200', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10); // ms
const ipWindows = new Map(); // ip → [timestamp, …]

/**
 * Check if IP has exceeded rate limit
 * @param {string} ip - Client IP address
 * @returns {boolean} Whether IP is rate limited
 */
function isRateLimited(ip) {
  if (!ip || ip === 'unknown') return false;
  
  const now = Date.now();
  const hits = (ipWindows.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  hits.push(now);
  ipWindows.set(ip, hits);
  
  const limited = hits.length > RATE_LIMIT_MAX;
  if (limited) {
    logger.warn(`Rate limit exceeded for IP: ${ip} (${hits.length} requests in window)`);
  }
  
  return limited;
}

/**
 * Clean up stale IP entries to prevent memory growth
 */
function cleanupRateLimiter() {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW;
  const initialSize = ipWindows.size;
  
  for (const [ip, hits] of ipWindows) {
    const fresh = hits.filter(t => t > cutoff);
    if (fresh.length === 0) {
      ipWindows.delete(ip);
    } else {
      ipWindows.set(ip, fresh);
    }
  }
  
  logger.debug(`Rate limiter cleanup: ${initialSize} → ${ipWindows.size} entries`);
}

// Clean up stale entries every 5 minutes
const cleanupInterval = setInterval(cleanupRateLimiter, 300_000);
cleanupInterval.unref(); // Don't prevent process exit

// ── Security Headers Configuration ──────────────────────────────────────
// Content-Security-Policy is carefully scoped to only what the site actually needs:
//   • scripts:  same-origin only (theme-init.js + main.js)
//   • styles:   same-origin + Google Fonts CDN
//   • fonts:    same-origin + Google Fonts file CDN
//   • images:   same-origin + data URIs + CDN
//   • frames:   same-origin (PDF previews via <iframe>)
//   • connects: same-origin
//   • objects / base / forms: locked down

/**
 * Build Content Security Policy based on environment
 */
function buildCSP() {
  const imgSources = ["'self'", "data:"];
  
  // Add domain-specific image sources based on environment
  if (isDevelopment) {
    imgSources.push("http:", "https:");
  } else {
    imgSources.push("https://muhannadrafi.com", "https://*.muhannadrafi.com");
  }
  
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src ${imgSources.join(' ')}`,
    "frame-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ];
  
  return directives.join('; ');
}

const CSP = buildCSP();

/**
 * Security headers as [name, value] pairs
 * Applied via serve-handler's headers config and manually for error responses
 */
const SECURITY_PAIRS = [
  ['Content-Security-Policy',     CSP],
  ['X-Content-Type-Options',      'nosniff'],
  ['X-Frame-Options',             'SAMEORIGIN'],
  ['X-XSS-Protection',            '1; mode=block'],
  ['Referrer-Policy',             'strict-origin-when-cross-origin'],
  ['Permissions-Policy',          'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'],
  ['Strict-Transport-Security',   'max-age=63072000; includeSubDomains; preload'],
  ['Cross-Origin-Opener-Policy',  'same-origin'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
];

// Add additional security headers for development environment
if (isDevelopment) {
  SECURITY_PAIRS.push(['Cache-Control', 'no-cache, no-store, must-revalidate']);
}

// serve-handler `headers` format: [{source, headers:[{key,value}]}]
const SERVE_HEADERS = [{
  source: '**/*',
  headers: SECURITY_PAIRS.map(([key, value]) => ({ key, value })),
}];

/**
 * Apply security headers to response
 * @param {http.ServerResponse} response - HTTP response object
 * @param {Object} extraHeaders - Additional headers to apply
 */
function addSecurityHeaders(response, extraHeaders = {}) {
  try {
    // Apply security headers
    for (const [key, value] of SECURITY_PAIRS) {
      response.setHeader(key, value);
    }
    
    // Apply additional headers
    for (const [key, value] of Object.entries(extraHeaders)) {
      response.setHeader(key, value);
    }
  } catch (error) {
    logger.error('Failed to set security headers:', error.message);
  }
}

// ── Error Response Helpers ────────────────────────────────────────────────

/**
 * Send 404 Not Found response
 * @param {http.ServerResponse} response - HTTP response object
 * @param {string} message - Custom error message (optional)
 */
function send404(response, message = null) {
  try {
    addSecurityHeaders(response, { 'Cache-Control': 'no-store' });
    
    if (page404) {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page404);
      logger.info('404 response sent with custom page');
    } else {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end(message || '404 Not Found');
      logger.info('404 response sent with plain text');
    }
  } catch (error) {
    logger.error('Failed to send 404 response:', error.message);
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('500 Internal Server Error');
  }
}

/**
 * Send generic error response
 * @param {http.ServerResponse} response - HTTP response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
function sendError(response, statusCode = 500, message = 'Internal Server Error') {
  try {
    addSecurityHeaders(response, { 'Cache-Control': 'no-store' });
    response.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    response.end(`${statusCode} ${message}`);
    logger.error(`Error ${statusCode}: ${message}`);
  } catch (error) {
    logger.error('Failed to send error response:', error.message);
    response.end(`${statusCode} ${message}`);
  }
}

// ── Request Handler ─────────────────────────────────────────────────────────

const server = http.createServer((request, response) => {
  const startTime = Date.now();
  
  /**
   * Log request details for debugging
   */
  function logRequest(method, url, statusCode) {
    const duration = Date.now() - startTime;
    logger.info(`${method} ${url} - ${statusCode} - ${duration}ms`);
  }

  try {
    // Resolve client IP (trust X-Forwarded-For only one hop; falls back to socket).
    const forwardedHeader = request.headers['x-forwarded-for'] || '';
    const rawIp = forwardedHeader.split(',')[0].trim() || 
                 request.socket.remoteAddress || 
                 'unknown';
    
    // Normalise IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4).
    const clientIp = rawIp.replace(/^::ffff:/, '');

    // Rate-limit check
    if (isRateLimited(clientIp)) {
      logger.warn(`Rate limited request from ${clientIp}`);
      addSecurityHeaders(response, {
        'Content-Type': 'text/plain',
        'Retry-After': String(Math.ceil(RATE_LIMIT_WINDOW / 1000)),
        'Cache-Control': 'no-store'
      });
      response.writeHead(429);
      response.end('429 Too Many Requests — please slow down.');
      logRequest(request.method, request.url, 429);
      return;
    }

    // Strip query string / fragment for file-system lookup
    const url = request.url || '/';
    const rawPath = url.split('?')[0].split('#')[0];

    // Decode percent-encoding safely
    let decodedPath = rawPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch (error) {
      logger.warn(`Failed to decode path: ${rawPath}`, error.message);
      // Leave as-is if decoding fails
    }

    // Build the candidate filesystem path
    const filePath = path.join(publicDir, decodedPath);
    const normFilePath = path.normalize(filePath);

    // Path traversal guard - reject anything that resolves outside publicDir
    if (normFilePath !== publicDir && 
        !normFilePath.startsWith(publicDir + path.sep)) {
      logger.warn(`Path traversal attempt: ${url} -> ${normFilePath}`);
      sendError(response, 400, '400 Bad Request');
      logRequest(request.method, url, 400);
      return;
    }

    // File-existence check
    let fileExists = false;
    try {
      const stat = fs.statSync(normFilePath);
      fileExists = stat.isDirectory()
        ? fs.existsSync(path.join(normFilePath, 'index.html'))
        : true;
    } catch (error) {
      logger.debug(`File not found: ${normFilePath}`, error.message);
      fileExists = false;
    }

    // Handle missing files with custom 404
    if (!fileExists) {
      send404(response);
      logRequest(request.method, url, 404);
      return;
    }

    // Delegate to serve-handler
    // Security headers are injected via serve-handler's `headers` option
    // The `rewrites` rule fixes a serve-handler 6.x bug where '/' returns 404
    handler(request, response, {
      public: publicDir,
      directoryListing: false,
      cleanUrls: false,
      rewrites: [{ source: '/', destination: '/index.html' }],
      headers: SERVE_HEADERS,
    }).catch(error => {
      logger.error('Static response failed:', error.message);
      if (!response.headersSent) {
        addSecurityHeaders(response);
        response.writeHead(500, { 'Content-Type': 'text/plain' });
      }
      response.end('500 Internal Server Error');
      logRequest(request.method, url, 500);
    });

  } catch (error) {
    logger.error('Unhandled request error:', error.message);
    if (!response.headersSent) {
      addSecurityHeaders(response);
      response.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    response.end('500 Internal Server Error');
    logRequest(request.method, request.url || '/', 500);
  }
});

// ── Startup ─────────────────────────────────────────────────────────────────

/**
 * Server startup with validation and logging
 */
function startServer() {
  const serverConfig = {
    port: port,
    host: '0.0.0.0',
    publicDir: publicDir,
    rateLimit: `${RATE_LIMIT_MAX} req / ${RATE_LIMIT_WINDOW / 1000}s per IP`,
    cspEnabled: true,
    development: isDevelopment
  };

  server.listen(port, '0.0.0.0', () => {
    logger.info('Server started successfully');
    logger.info(`Configuration:`);
    logger.info(`  • Listening on: ${serverConfig.host}:${serverConfig.port}`);
    logger.info(`  • Serving from: ${serverConfig.publicDir}`);
    logger.info(`  • Rate limit:   ${serverConfig.rateLimit}`);
    logger.info(`  • CSP:          ${serverConfig.cspEnabled ? 'enabled' : 'disabled'}`);
    logger.info(`  • Environment:  ${serverConfig.development ? 'development' : 'production'}`);
    
    // Log server config to stdout for container orchestration
    console.log(JSON.stringify({
      status: 'started',
      port: serverConfig.port,
      host: serverConfig.host,
      publicDir: serverConfig.publicDir,
      environment: serverConfig.development ? 'development' : 'production'
    }));
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use`);
    } else if (error.code === 'EACCES') {
      logger.error(`Permission denied to bind to port ${port}`);
    } else {
      logger.error('Server error:', error.message);
    }
    process.exit(1);
  });

  server.on('connection', (socket) => {
    // Set timeout for sockets to prevent hanging connections
    socket.setTimeout(30000); // 30 seconds
    socket.on('timeout', () => {
      logger.warn('Socket timeout - closing connection');
      socket.destroy();
    });
  });
}

// ── Graceful Shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false;

/**
 * Handle graceful shutdown
 * @param {string} signal - The signal received
 */
function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info(`${signal} received — initiating graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('Server closed gracefully');
    cleanupRateLimiter(); // Final cleanup
    process.exit(0);
  });
  
  // Force exit after grace period
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out - forcing exit');
    process.exit(1);
  }, 10_000);
  
  forceExitTimeout.unref();
}

// Set up signal handlers
for (const signal of ['SIGTERM', 'SIGINT', 'SIGQUIT']) {
  process.on(signal, () => handleShutdown(signal));
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error.message, error.stack);
  handleShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();
