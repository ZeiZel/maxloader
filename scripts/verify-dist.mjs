import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const versionParts = String(packageJson.version).split('.');
if (versionParts.length > 4 || versionParts.some((part) => !/^\d+$/.test(part) || (part.length > 1 && part.startsWith('0')) || Number(part) > 65535)) throw new Error('Version must have 1-4 unambiguous Chrome components in range 0..65535');
const expected = new Set(['background.js', 'content.js', 'manifest.json', 'page-hook.js', 'styles.css', 'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png']);
if (manifest.version !== packageJson.version) throw new Error('Built manifest version differs from package.json');
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required');
if (JSON.stringify(manifest.permissions ?? []) !== JSON.stringify(['downloads'])) throw new Error('Unexpected permissions');
if (JSON.stringify(manifest.content_scripts?.flatMap((script) => script.matches ?? [])) !== JSON.stringify(['https://web.max.ru/*', 'https://web.max.ru/*'])) throw new Error('Unexpected content script match patterns');
async function collect(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await collect(path));
    else result.push(relative('dist', path).split('\\').join('/'));
  }
  return result;
}
const actual = new Set(await collect('dist'));
for (const path of expected) if (!actual.has(path)) throw new Error(`Missing dist file: ${path}`);
for (const path of actual) if (!expected.has(path)) throw new Error(`Unexpected dist file: ${path}`);
console.log(`Verified dist (${actual.size} files, version ${packageJson.version})`);
