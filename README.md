# Muhannad Rafi portfolio

A static HTML, CSS, and JavaScript website. Deploy `index.html`, `assets/`,
`robots.txt`, and the sitemap files to a static web host. No Node.js runtime
or build step is needed on a static host. Railpack deployments use the Node server below. The existing PHP hosting page is separate.

## Local preview

Run `python3 -m http.server 4173 --bind 127.0.0.1` and open
http://127.0.0.1:4173.

## Development checks

With Node.js 24 and npm installed:

```sh
npm ci
npx playwright install chromium
npm test
```

Tests start their own local server on port 4173. They cover navigation and history,
responsive menu accessibility, dialog focus and cleanup, theme persistence,
unavailable storage, disabled JavaScript, reduced motion, and printing.
External fonts and maps are blocked during tests so they run independently of
third-party services.

## Editing

- `index.html`: portfolio content, SEO metadata, and dialog templates.
- `assets/css/style.css`: responsive layout, theme tokens, and print styles.
- `assets/js/main.js`: isolated controllers for navigation, themes, dialogs,
  and the footer clock. Dialog content comes from the existing
  `data-modal-*` attributes and is rendered as text.

Navigation uses native fragment URLs and browser history. Closed mobile menus
and modal backgrounds are inert. Core content remains visible without JavaScript;
the design uses local system fonts and displays content without reveal animations.

## Railway / Railpack deployment

Railpack detects the root `package.json` and runs:

- Install: `npm ci`
- Build: `npm run build`
- Start: `npm start`

The server listens on `0.0.0.0` using the platform's `PORT` (3000 locally).
Set the health-check path to `/` if configuring a Railway health check.
No custom start command or SPA output variable is required.
Commit `package.json`, `package-lock.json`, `server.cjs`, `scripts/build.cjs`,
and `.dockerignore` along with the website files, then redeploy.

Only public website assets are copied into `dist/`; development files and the
legacy PHP page are not served. `.dockerignore` excludes local dependencies and
browser artifacts from the build context. Tests use this production server.
