const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
  webServer: {
    command: 'npm run build && npm start',
    env: { PORT: '4173' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
