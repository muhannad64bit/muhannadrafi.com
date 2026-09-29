# Muhannad Rafi portfolio

A static HTML, CSS, and JavaScript website. Deploy `index.html`, `assets/`,
`robots.txt`, and the sitemap files to a static web host. No Node.js runtime
or build step is needed in production. The existing PHP hosting page is separate.

## Local preview

Run `python3 -m http.server 4173 --bind 127.0.0.1` and open
http://127.0.0.1:4173.

## Development checks

With Node.js, npm, and Python 3 installed:

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
