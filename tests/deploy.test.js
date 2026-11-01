import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('static release ships runtime media while excluding local records and development files', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'chongzhen-release-'));
  try {
    for (const directory of ['scripts', 'src', 'assets/technology', 'assets/portraits', 'assets/audio', 'artifacts']) {
      await mkdir(path.join(fixture, directory), { recursive: true });
    }
    await copyFile(path.join(root, 'scripts/build.mjs'), path.join(fixture, 'scripts/build.mjs'));
    const publicFiles = ['index.html', 'src/app.js', 'src/title.css', 'assets/technology/iron.jpg', 'assets/portraits/math.jpg', 'assets/audio/score.mp3', 'assets/audio/score.m4a', 'assets/ming-gear.svg'];
    const privateFiles = ['src/checkpoint.txt', 'src/.private.js', 'assets/technology/industry-prompts.json', 'assets/portraits/prompts.json', 'assets/ARTWORK.txt', 'assets/.draft.png', 'artifacts/preview.png', 'PROGRESS.txt'];
    for (const relative of [...publicFiles, ...privateFiles]) await writeFile(path.join(fixture, relative), relative);
    const { stdout } = await execFileAsync(process.execPath, ['scripts/build.mjs'], { cwd: fixture });
    assert.match(stdout, /Built dist/);
    for (const relative of publicFiles) assert.equal(await readFile(path.join(fixture, 'dist', relative), 'utf8'), relative);
    for (const relative of privateFiles) await assert.rejects(stat(path.join(fixture, 'dist', relative)), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(fixture, 'dist/.nojekyll'), 'utf8'), '');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('runtime file references remain inside a GitHub Pages project subpath', async () => {
  const site = new URL('https://example.github.io/chongzhen-industry/');
  const files = ['index.html', ...(await readdir(path.join(root, 'src'))).filter(name => /\.(js|css)$/.test(name)).map(name => `src/${name}`)];
  let checked = 0;
  for (const relative of files) {
    const source = await readFile(path.join(root, relative), 'utf8');
    const patterns = relative.endsWith('.html')
      ? [/\b(?:src|href)=["']([^"']+)["']/g]
      : relative.endsWith('.css')
        ? [/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g]
        : [/\bfrom\s+["']([^"']+)["']/g, /\bnew URL\(\s*["']([^"']+)["']/g, /(?:src|href)=["'](\.?\.?\/assets\/[^"']+)["']/g];
    for (const pattern of patterns) for (const [, reference] of source.matchAll(pattern)) {
      if (reference.startsWith('#') || /^(?:data:|https?:)/.test(reference) || reference.includes('${')) continue;
      const resolved = new URL(reference, new URL(relative, site));
      assert.equal(resolved.origin, site.origin, `${relative}: ${reference}`);
      assert.ok(resolved.pathname.startsWith(site.pathname), `${relative} escapes the project path: ${reference}`);
      checked++;
    }
  }
  assert.ok(checked >= 20, 'the check should inspect actual runtime resources');
});
