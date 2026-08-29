import { readFile, writeFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const manifestPath = process.argv[2] ?? 'dist/manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const versionParts = String(packageJson.version).split('.');
if (versionParts.length > 4 || versionParts.some((part) => !/^\d+$/.test(part) || (part.length > 1 && part.startsWith('0')) || Number(part) > 65535)) throw new Error(`Unsupported Chrome version: ${packageJson.version}`);
manifest.version = packageJson.version;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
