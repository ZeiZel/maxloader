import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const source = process.cwd();
const epoch = process.env.SOURCE_DATE_EPOCH ?? '0';
const packageJson = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const hashes = [];
const temps = [];
try {
  for (let index = 0; index < 2; index += 1) {
    const temp = await mkdtemp(join(tmpdir(), `maxloader-repro-${index}-`));
    temps.push(temp);
    await cp(source, temp, { recursive: true, filter: (path) => !path.includes('/node_modules') && !path.includes('/dist') && !path.endsWith('.zip') && !path.endsWith('.zip.sha256') });
    const env = { ...process.env, SOURCE_DATE_EPOCH: epoch, npm_config_loglevel: 'error' };
    execFileSync('npm', ['ci'], { cwd: temp, env, stdio: 'inherit' });
    execFileSync('npm', ['run', 'package'], { cwd: temp, env, stdio: 'inherit' });
    const archive = join(temp, `maxloader-${packageJson.version}.zip`);
    hashes.push(createHash('sha256').update(await readFile(archive)).digest('hex'));
  }
} finally {
  await Promise.all(temps.map((temp) => rm(temp, { recursive: true, force: true })));
}
if (hashes[0] !== hashes[1]) throw new Error(`Non-reproducible package: ${hashes.join(' != ')}`);
console.log(`Reproducible package SHA256 ${hashes[0]}`);
