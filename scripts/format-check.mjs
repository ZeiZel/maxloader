import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs';
import { promisify } from 'node:util';

const matches = await promisify(glob)('src/**/*.{ts,css}', { nodir: true });
for (const file of matches) {
  const text = await readFile(file, 'utf8');
  if (!text.endsWith('\n')) throw new Error(`${file} must end with a newline`);
}
console.log(`Format check passed (${matches.length} source files)`);
