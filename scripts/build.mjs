import { copyFile, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const sourceExtensions = new Set(['.js', '.css']);
const mediaExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.mp3', '.m4a', '.ogg', '.wav', '.woff', '.woff2']);

function isPublicFile(source) {
  const relative = path.relative(root, source);
  if (relative === 'index.html') return true;
  const [directory] = relative.split(path.sep);
  const extensions = directory === 'src' ? sourceExtensions : directory === 'assets' ? mediaExtensions : null;
  return extensions?.has(path.extname(source).toLowerCase()) ?? false;
}

async function copyPublic(source, destination) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Public files cannot be symbolic links: ${source}`);
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      await copyPublic(path.join(source, entry.name), path.join(destination, entry.name));
    }
  } else if (info.isFile() && isPublicFile(source)) {
    await copyFile(source, destination);
  }
}

try {
  // Check required sources before replacing the previous build.
  for (const relative of ['index.html', 'src']) await lstat(path.join(root, relative));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const relative of ['index.html', 'src', 'assets']) {
    const source = path.join(root, relative);
    try {
      await lstat(source);
    } catch (error) {
      if (relative === 'assets' && error.code === 'ENOENT') continue;
      throw error;
    }
    await copyPublic(source, path.join(output, relative));
  }
  await writeFile(path.join(output, '.nojekyll'), '');
  console.log('Built dist/ — static files ready for local preview or GitHub Pages.');
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
