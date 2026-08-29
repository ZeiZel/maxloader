import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { MIN_ZIP_EPOCH } from './zip.mjs';

const source = process.cwd();
const epoch = process.env.SOURCE_DATE_EPOCH ?? String(MIN_ZIP_EPOCH);
if (!/^\d+$/.test(epoch) || Number(epoch) < MIN_ZIP_EPOCH) {
  throw new Error(`SOURCE_DATE_EPOCH must be an integer >= ${MIN_ZIP_EPOCH} (1980-01-01T00:00:00Z)`);
}
const packageJson = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const hashes = [];
const temps = [];
try {
  for (const timezone of ['UTC', 'Europe/Moscow']) {
    for (let index = 0; index < 2; index += 1) {
      const temp = await mkdtemp(join(tmpdir(), `maxloader-repro-${timezone.replaceAll('/', '_')}-${index}-`));
      temps.push(temp);
      await cp(source, temp, { recursive: true, filter: (path) => !path.includes('/node_modules') && !path.includes('/dist') && !path.endsWith('.zip') && !path.endsWith('.zip.sha256') });
      const env = { ...process.env, TZ: timezone, SOURCE_DATE_EPOCH: epoch, npm_config_loglevel: 'error' };
      execFileSync('npm', ['ci'], { cwd: temp, env, stdio: 'inherit' });
      execFileSync('npm', ['run', 'package'], { cwd: temp, env, stdio: 'inherit' });
      const archive = join(temp, `maxloader-${packageJson.version}.zip`);
      hashes.push({ timezone, digest: createHash('sha256').update(await readFile(archive)).digest('hex') });
    }
  }
} finally {
  await Promise.all(temps.map((temp) => rm(temp, { recursive: true, force: true })));
}
const digests = new Set(hashes.map(({ digest }) => digest));
if (digests.size !== 1) throw new Error(`Non-reproducible package across builds/timezones: ${JSON.stringify(hashes)}`);
console.log(`Reproducible package SHA256 ${hashes[0].digest} (UTC and Europe/Moscow)`);
