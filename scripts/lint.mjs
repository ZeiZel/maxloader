import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs';
import { promisify } from 'node:util';

const files = await promisify(glob)('src/**/*.{ts,css}', { nodir: true });
for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (/svelte-[A-Za-z0-9_-]+/.test(text)) throw new Error(`${file} contains a forbidden generated CSS hash`);
}
console.log(`Lint check passed (${files.length} source files)`);
