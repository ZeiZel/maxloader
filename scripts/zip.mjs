import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

export const RUNTIME_FILES = Object.freeze([
  'background.js', 'content.js', 'manifest.json', 'page-hook.js', 'styles.css',
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png'
]);

// DOS timestamps (used by Chrome's ZIP importer) start at 1980-01-01 UTC.
// Keep this fixed and explicit so SOURCE_DATE_EPOCH=0 can never produce a
// Unix-epoch/UT extra field that some ZIP consumers reject.
export const MIN_ZIP_EPOCH = 315532800;

export async function writeZip({ cwd, output, epoch = MIN_ZIP_EPOCH }) {
  const buffers = await Promise.all(RUNTIME_FILES.map((path) => readFile(joinPath(cwd, path))));
  const zip = new yazl.ZipFile();
  const stream = createWriteStream(output);
  const writing = pipeline(zip.outputStream, stream);
  try {
    RUNTIME_FILES.forEach((path, index) => {
      zip.addBuffer(buffers[index], path, {
        mtime: dosTimestampDate(epoch), mode: 0o100644, forceDosTimestamp: true
      });
    });
    zip.end();
    await writing;
  } catch (error) {
    zip.outputStream.destroy(error);
    stream.destroy();
    try { await writing; } catch { /* preserve the original write/add error */ }
    throw error;
  }
}

function dosTimestampDate(epoch) {
  const utc = new Date(epoch * 1000);
  // yazl intentionally reads local Date fields for DOS encoding. Shift the
  // Date so those fields represent UTC, independent of the host timezone.
  return new Date(utc.getTime() + utc.getTimezoneOffset() * 60_000);
}

function joinPath(cwd, path) { return `${cwd}/${path}`; }
