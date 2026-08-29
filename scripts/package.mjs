import { chmod, mkdir, rm, stat, utimes } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { MIN_ZIP_EPOCH, RUNTIME_FILES, writeZip } from './zip.mjs';

const root = resolve('.');
const dist = resolve('dist');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const archive = resolve(`maxloader-${packageJson.version}.zip`);
const checksum = `${archive}.sha256`;
const epoch = Number(process.env.SOURCE_DATE_EPOCH ?? MIN_ZIP_EPOCH);
if (!Number.isSafeInteger(epoch) || epoch < MIN_ZIP_EPOCH) {
  throw new Error(`SOURCE_DATE_EPOCH must be an integer >= ${MIN_ZIP_EPOCH} (1980-01-01T00:00:00Z)`);
}
await mkdir(dist, { recursive: true });
for (const path of RUNTIME_FILES) {
  const target = join(dist, path);
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new Error(`Missing required dist file: ${path}`);
  await utimes(target, epoch, epoch);
  await chmod(target, 0o644);
}
await rm(archive, { force: true });
await rm(checksum, { force: true });
await writeZip({ cwd: dist, output: archive, epoch });
await import('./verify-zip.mjs').then(({ verifyZip }) => verifyZip({ archive, expectedFiles: RUNTIME_FILES }));
const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(checksum, `${digest}  ${archive.split('/').pop()}\n`);
console.log(`Created ${archive}\nSHA256 ${digest}`);
