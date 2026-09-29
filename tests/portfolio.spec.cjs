const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
});

test('navigation retains fragment history and handles malformed fragments', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#%invalid');
  await page.locator('.site-nav__link[href="#education"]').click();
  await expect(page).toHaveURL(/#education$/);
  await expect(page.locator('#education')).toBeFocused();
  await page.locator('.site-nav__link[href="#skills"]').click();
  await page.goBack();
  await expect(page).toHaveURL(/#education$/);
  expect(errors).toEqual([]);
});

test('mobile menu is inert when closed and accessible after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.locator('#siteNavMenu');
  await expect(menu).toHaveJSProperty('inert', true);
  await page.locator('#navToggle').click();
  await expect(menu).toHaveJSProperty('inert', false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#navToggle')).toBeFocused();
  await expect(menu).toHaveJSProperty('inert', true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(menu).toHaveJSProperty('inert', false);
  await expect(menu).toHaveAttribute('aria-hidden', 'false');
  await page.locator('.site-nav__link[href="#education"]').click();
  await expect(menu).toHaveAttribute('aria-hidden', 'false');
});

test('dialogs isolate background, trap focus, restore trigger and reopen reliably', async ({ page }) => {
  await page.goto('/');
  const trigger = page.locator('.js-modal-trigger').first();
  const dialog = page.locator('#contentDialog');
  await trigger.click();
  await expect(dialog).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('main')).toHaveJSProperty('inert', true);
  await expect(page.locator('#dialogClose')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement.closest('#contentDialog') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('main')).toHaveJSProperty('inert', false);
  await trigger.click();
  await expect(dialog).toHaveAttribute('aria-hidden', 'false');
  await page.locator('#dialogClose').click();
  await expect(dialog).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#dialogMedia')).toBeEmpty();
  await page.locator('#profileTrigger').click();
  await expect(page.locator('#imageDialog')).toHaveAttribute('aria-hidden', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('#profileTrigger')).toBeFocused();
});

test('theme persists and remains usable when storage is unavailable', async ({ page }) => {
  await page.goto('/');
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('#themeToggle')).toHaveAttribute('aria-pressed', 'true');
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
    Storage.prototype.getItem = () => { throw new Error('Storage disabled'); };
  });
  await page.reload();
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('content and mobile navigation work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route('https://**/*', route => route.abort());
  await page.goto('http://127.0.0.1:4173');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.hero__content')).toHaveCSS('opacity', '1');
  await expect(page.locator('.site-nav__link').first()).toBeVisible();
  await expect(page.locator('#siteLoader')).toHaveCount(0);
  await context.close();
});

test('reduced motion and printing expose all sections', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.reveal-pending')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await page.emulateMedia({ media: 'print' });
  for (const element of await page.locator('.reveal').all()) {
    await expect(element).toHaveCSS('opacity', '1');
  }
});

test('short mobile menus scroll and section headings clear the sticky header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#navToggle').click();
  const menu = page.locator('#siteNavMenu');
  expect(await menu.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await page.locator('.site-nav__link[href="#contact"]').click();
  await expect(page).toHaveURL(/#contact$/);
  await expect.poll(() => page.evaluate(() => {
    const heading = document.querySelector('#contact .section-heading').getBoundingClientRect();
    return heading.top >= document.querySelector('.site-header').getBoundingClientRect().bottom;
  })).toBe(true);
});

test('reopening a long dialog starts at its heading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto('/');
  const trigger = page.locator('.js-modal-trigger').first();
  await trigger.click();
  const panel = page.locator('#contentDialog .dialog__panel');
  await expect.poll(() => page.locator("#dialogMedia img").evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await panel.evaluate(node => { node.scrollTop = node.scrollHeight; });
  expect(await panel.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await trigger.click();
  await expect(panel).toHaveJSProperty('scrollTop', 0);
});

test('layout fits narrow mobile and desktop screens in both themes', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('h1')).toBeVisible();
      if (width === 390 || width === 1440) {
        await page.screenshot({ path: testInfo.outputPath(`${width}-${theme}.png`) });
      }
    }
  }
});

test('document failures retain an original-file link and readable summary', async ({ page }) => {
  await page.route('**/assets/education/bachelor-degree.jpg', route => route.abort());
  await page.goto('/');
  await page.locator('.js-modal-trigger').first().click();
  await expect(page.locator('#dialogMedia [role="status"]')).toContainText('Preview unavailable');
  await expect(page.locator('#dialogDescription')).toBeVisible();
  const original = page.locator('#dialogMedia .document-link');
  await expect(original).toHaveAttribute('href', 'assets/education/bachelor-degree.jpg');
  await expect(original).toHaveAttribute('target', '_blank');
  await expect(page.locator('#dialogMedia img')).toHaveCount(0);
});

test('mobile section indicator follows navigation and resize preserves focus', async ({ page }) => {
  await page.goto('/');
  await page.locator('.site-nav__link[href="#education"]').focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#navToggle')).toBeFocused();
  await page.locator('#navToggle').click();
  await page.locator('.site-nav__link[href="#skills"]').click();
  await expect(page.locator('#navCurrent')).toHaveText('Skills');
  await expect(page.locator('#navToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#skills')).toBeFocused();
});
