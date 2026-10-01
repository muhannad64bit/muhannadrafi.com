/**
 * Playwright Test Configuration
 * Configured for comprehensive portfolio testing
 */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  
  // Global test configuration
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000, // 10 seconds for expect assertions
  },
  
  // Browser configuration
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true, // Run tests headless by default
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry', // Capture trace on first retry
    video: 'retain-on-failure', // Keep video on failure
    screenshot: 'only-on-failure', // Screenshots only on failure
  },
  
  // Web server configuration for development
  webServer: {
    command: 'npm run build && npm start',
    env: { 
      PORT: '4173',
      NODE_ENV: 'test'
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120000, // 2 minutes for server startup
    cwd: process.cwd(),
  },
  
  // Test retries and parallelism
  retries: process.env.CI ? 2 : 0, // Retry twice in CI, no retries locally
  workers: process.env.CI ? 2 : undefined, // 2 workers in CI
  
  // Reporting
  reporter: [
    ['list'], // Simple list reporter
    ['html', { outputFolder: 'test-results/html' }], // HTML report
    ['json', { outputFolder: 'test-results/json' }] // JSON report
  ],
  
  // Artifacts directory
  outputDir: 'test-results/',
  
  // Global setup and teardown
  globalSetup: './tests/global-setup.cjs',
  globalTeardown: './tests/global-teardown.cjs',
});
