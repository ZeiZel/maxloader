import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import yazl from 'yazl';

export const RUNTIME_FILES = Object.freeze([
  'background.js', 'content.js', 'manifest.json', 'page-hook.js', 'styles.css',
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png'
]);

export async function writeZip({ cwd, output, epoch = 0 }) {
  const buffers = await Promise.all(RUNTIME_FILES.map((path) => readFile(joinPath(cwd, path))));
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const stream = createWriteStream(output);
    stream.on('error', reject);
    stream.on('close', resolve);
    RUNTIME_FILES.forEach((path, index) => {
      zip.addBuffer(buffers[index], path, {
        mtime: new Date(epoch * 1000), mode: 0o100644
      });
    });
    zip.outputStream.pipe(stream);
    zip.end();
  });
}

function joinPath(cwd, path) { return `${cwd}/${path}`; }
