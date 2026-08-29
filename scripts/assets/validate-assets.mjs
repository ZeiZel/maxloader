#!/usr/bin/env node
/**
 * Portable, read-only validation for the checked-in icon assets.
 * Uses only Node.js built-ins: it never invokes a renderer or rewrites files.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const expected = {
  archive: {
    path: 'assets/vendor/max/max-colored.zip',
    sha256: 'bfb540772c667ba12a2e9052295cd91dad39ebd8d270038262f2f2404303c206',
  },
  vendorSvg: {
    path: 'assets/vendor/max/Max colored.svg',
    member: 'Max colored.svg',
    sha256: '5caa61a4b0731d0d89421b4fb24f41433025e5aea59155a14cf3a3fada6c9174',
  },
  pngs: [
    ['public/icons/icon-16.png', 16, 'b8e050e865034d2531294fc868f7280d8c068171d7350b00cabf98f26dff1e99'],
    ['public/icons/icon-32.png', 32, 'cfe9a2ff5f5bc1be5fce2aa0ecae1e3df26ccb3689efde182cb2cf2cc94f44db'],
    ['public/icons/icon-48.png', 48, '012ea43e1f7acbfeb12c68f090b17732eeb112e281b9db13d07849b45c3841a8'],
    ['public/icons/icon-128.png', 128, '98a16a74eaf38e52e53438df8157120d4cd487d88c39b5eaeb8905d85ea44dad'],
    ['assets/generated/max-loader-master-1024.png', 1024, '06a3b967d1b410a5e2c83d058dbc664bc512325aebd2175f16379338390b6536'],
  ],
};
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const forbiddenPngChunks = new Set(['eXIf', 'iTXt', 'tEXt', 'tIME', 'zTXt']);

function fail(message) {
  throw new Error(message);
}

function readRelative(relativePath) {
  try {
    return readFileSync(join(repositoryRoot, relativePath));
  } catch (error) {
    fail(`Cannot read ${relativePath}: ${error.message}`);
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function expectHash(relativePath, buffer, expectedHash) {
  const actualHash = sha256(buffer);
  if (actualHash !== expectedHash) {
    fail(`${relativePath}: SHA-256 ${actualHash}; expected ${expectedHash}`);
  }
}

function zipMembers(zip) {
  const eocdSignature = 0x06054b50;
  const minimumEocdLength = 22;
  const firstCandidate = Math.max(0, zip.length - 0xffff - minimumEocdLength);
  let eocd = -1;
  for (let offset = zip.length - minimumEocdLength; offset >= firstCandidate; offset -= 1) {
    if (zip.readUInt32LE(offset) === eocdSignature) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) fail('Vendor archive: ZIP end-of-central-directory record is missing.');
  if (zip.readUInt16LE(eocd + 4) !== 0 || zip.readUInt16LE(eocd + 6) !== 0) {
    fail('Vendor archive: multi-disk ZIP archives are unsupported.');
  }
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const members = new Map();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== 0x02014b50) {
      fail('Vendor archive: malformed central directory.');
    }
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    members.set(name, { flags, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return members;
}

function extractZipMember(zip, name, member) {
  if (member.flags & 0x1) fail(`Vendor archive: ${name} is encrypted.`);
  const offset = member.localOffset;
  if (offset + 30 > zip.length || zip.readUInt32LE(offset) !== 0x04034b50) {
    fail(`Vendor archive: local header for ${name} is malformed.`);
  }
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(start, start + member.compressedSize);
  if (compressed.length !== member.compressedSize) fail(`Vendor archive: ${name} is truncated.`);
  let content;
  if (member.method === 0) content = compressed;
  else if (member.method === 8) content = inflateRawSync(compressed);
  else fail(`Vendor archive: ${name} uses unsupported compression method ${member.method}.`);
  if (content.length !== member.uncompressedSize) fail(`Vendor archive: ${name} has an invalid uncompressed size.`);
  return content;
}

function validatePng(relativePath, size, expectedHash) {
  const png = readRelative(relativePath);
  expectHash(relativePath, png, expectedHash);
  if (!png.subarray(0, pngSignature.length).equals(pngSignature)) fail(`${relativePath}: invalid PNG signature.`);
  let offset = pngSignature.length;
  let ihdr = null;
  let sawIend = false;
  while (offset < png.length) {
    if (offset + 12 > png.length) fail(`${relativePath}: truncated PNG chunk.`);
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (end > png.length) fail(`${relativePath}: truncated ${type} chunk.`);
    if (type === 'IHDR') {
      if (ihdr || length !== 13 || offset !== pngSignature.length) fail(`${relativePath}: invalid IHDR.`);
      ihdr = png.subarray(offset + 8, offset + 8 + length);
    }
    if (forbiddenPngChunks.has(type)) fail(`${relativePath}: volatile or textual ${type} chunk is forbidden.`);
    if (type === 'IEND') {
      if (length !== 0 || end !== png.length) fail(`${relativePath}: invalid IEND chunk.`);
      sawIend = true;
    }
    offset = end;
  }
  if (!ihdr || !sawIend) fail(`${relativePath}: missing required PNG chunks.`);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compression = ihdr[10];
  const filter = ihdr[11];
  const interlace = ihdr[12];
  if (width !== size || height !== size || bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
    fail(`${relativePath}: expected ${size}x${size} PNG RGBA/8 (IHDR color type 6).`);
  }
}

try {
  const archive = readRelative(expected.archive.path);
  expectHash(expected.archive.path, archive, expected.archive.sha256);
  const members = zipMembers(archive);
  for (const required of ['Max colored.pdf', 'Max colored.png', expected.vendorSvg.member]) {
    if (!members.has(required)) fail(`Vendor archive: required member ${required} is missing.`);
  }
  const vendorSvg = readRelative(expected.vendorSvg.path);
  expectHash(expected.vendorSvg.path, vendorSvg, expected.vendorSvg.sha256);
  const archivedSvg = extractZipMember(archive, expected.vendorSvg.member, members.get(expected.vendorSvg.member));
  if (!archivedSvg.equals(vendorSvg)) fail('Vendor SVG does not byte-match the official archive member.');
  for (const [relativePath, size, expectedHash] of expected.pngs) validatePng(relativePath, size, expectedHash);
  console.log(`Asset validation passed (${expected.pngs.length} RGBA PNGs; official archive and SVG verified).`);
} catch (error) {
  console.error(`Asset validation failed: ${error.message}`);
  process.exitCode = 1;
}
