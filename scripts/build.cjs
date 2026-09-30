const { cpSync, mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ['index.html', '404.html', 'assets', 'robots.txt', 'sitemap_com.xml', 'sitemap_info.xml']) {
  cpSync(path.join(root, file), path.join(output, file), {
    recursive: true,
    filter: source => !path.basename(source).startsWith('.'),
  });
}
console.log('Built static website in dist/');
