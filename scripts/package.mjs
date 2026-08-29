import { mkdir, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { execFileSync } from 'child_process';

const dist = 'dist';
const zip = 'maxloader-0.1.0.zip';
await mkdir(dist, { recursive: true });
await rm(zip, { force: true });
await rm(join(dist, zip), { force: true });
const files = await readdir(dist);
if (!files.includes('manifest.json') || !files.includes('content.js')) throw new Error('dist is missing extension files');
execFileSync('zip', ['-r', '-q', `../${zip}`, '.'], { cwd: dist, stdio: 'inherit' });
console.log(`Created ${join(process.cwd(), zip)}`);
