import { readFile } from 'node:fs/promises';
import { MIN_ZIP_EPOCH } from './zip.mjs';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export async function verifyZip({ archive, expectedFiles }) {
  const bytes = await readFile(archive);
  const eocd = findEocd(bytes);
  const count = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (centralOffset + centralSize > bytes.length) {
    throw new Error(`ZIP central directory is invalid: ${archive}`);
  }

  const names = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(cursor) !== CENTRAL) throw new Error(`Invalid central entry ${index}`);
    const dosTime = bytes.readUInt16LE(cursor + 12);
    const dosDate = bytes.readUInt16LE(cursor + 14);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (extraLength !== 0) throw new Error(`ZIP entry has extra fields (UT timestamp likely present): ${name}`);
    if (dosYear(dosDate) < 1980) throw new Error(`ZIP entry timestamp predates 1980: ${name}`);
    if (bytes.readUInt32LE(localOffset) !== LOCAL) throw new Error(`Invalid local entry: ${name}`);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    if (localExtraLength !== 0) throw new Error(`ZIP local entry has extra fields: ${name}`);
    if (bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8') !== name) {
      throw new Error(`ZIP local/central filename mismatch: ${name}`);
    }
    names.push(name);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('ZIP central directory has trailing bytes');
  const expected = expectedFiles ? [...expectedFiles].sort() : null;
  const actualFiles = names.filter((name) => !name.endsWith('/')).sort();
  if (expected && JSON.stringify(actualFiles) !== JSON.stringify(expected)) {
    throw new Error('ZIP entries do not match the runtime file set');
  }
  return true;
}

function findEocd(bytes) {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (bytes.readUInt32LE(offset) === EOCD) return offset;
  }
  throw new Error('ZIP end-of-central-directory record not found');
}

function dosYear(date) { return 1980 + (date >>> 9); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const archive = process.argv[2];
  if (!archive) throw new Error('Usage: node scripts/verify-zip.mjs <archive>');
  await verifyZip({ archive });
  console.log(`ZIP validation passed: ${archive} (minimum epoch ${MIN_ZIP_EPOCH})`);
}
