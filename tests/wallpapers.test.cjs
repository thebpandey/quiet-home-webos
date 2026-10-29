const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateManifest, jpegDimensions, checkWallpapers } = require('../scripts/check-wallpapers.cjs');

const manifest = () => Array.from({ length: 24 }, (_, index) => {
  const id = String(index + 1).padStart(2, '0') + '-scene';
  return { id, title: 'Painted scene', location: 'Nature', src: `wallpapers/${id}.jpg` };
});
// A minimal marker stream exercises the header parser, not an image decoder.
function jpeg(width = 1536, height = 864, seed = 0) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 3, seed,
    0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255,
    1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, seed, 0xff, 0xd9]);
}

test('manifest rejects count, unsafe paths, duplicate IDs and unstable order', () => {
  assert.doesNotThrow(() => validateManifest(manifest()));
  assert.throws(() => validateManifest(manifest().slice(1)), /24/);
  for (const src of ['../outside.jpg', 'wallpapers/../outside.jpg', 'https://host/image.jpg',
    'wallpapers\\01-scene.jpg', '/wallpapers/01-scene.jpg']) {
    const entries = manifest(); entries[0].src = src;
    assert.throws(() => validateManifest(entries), /path|src/);
  }
  const duplicate = manifest(); duplicate[1] = duplicate[0];
  assert.throws(() => validateManifest(duplicate), /ID|order|unique/);
  const reversed = manifest().reverse();
  assert.throws(() => validateManifest(reversed), /order/);
});

test('preview accepts a partial manifest while release still rejects it', async t => {
  const entries = manifest().slice(0, 17);
  assert.throws(() => validateManifest(entries), /24/);
  assert.doesNotThrow(() => validateManifest(entries, { allowPartial: true }));
  assert.throws(() => validateManifest([], { allowPartial: true }), /1.*24/);
  const { root } = await fixture(t);
  await fs.writeFile(path.join(root, 'wallpapers.json'), JSON.stringify(entries));
  await Promise.all(manifest().slice(17).map(entry => fs.unlink(path.join(root, entry.src))));
  await assert.rejects(checkWallpapers(root), /24/);
  const result = await checkWallpapers(root, { allowPartial: true });
  assert.equal(result.assets.length, 17);
  await fs.writeFile(path.join(root, entries[1].src), jpeg(1536, 864, 0));
  await assert.rejects(checkWallpapers(root, { allowPartial: true }), /duplicate content/i);
});

test('JPEG parser reads dimensions and rejects renamed, truncated or malformed files', () => {
  assert.deepEqual(jpegDimensions(jpeg()), { width: 1536, height: 864 });
  for (const bytes of [Buffer.from('not jpeg'), jpeg().subarray(0, 20),
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0xff, 0xd9])]) {
    assert.throws(() => jpegDimensions(bytes), /JPEG/);
  }
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'quiet-wallpapers-'));
  await fs.mkdir(path.join(root, 'wallpapers'));
  const entries = manifest();
  await fs.writeFile(path.join(root, 'wallpapers.json'), JSON.stringify(entries));
  await Promise.all(entries.map((entry, index) => fs.writeFile(path.join(root, entry.src), jpeg(1536, 864, index))));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, entries };
}

test('asset check accepts a complete set and reports dimensions, hashes and bytes', async t => {
  const { root } = await fixture(t);
  const result = await checkWallpapers(root);
  assert.equal(result.assets.length, 24);
  assert.equal(result.totalBytes, 24 * jpeg().length);
  assert.equal(new Set(result.assets.map(asset => asset.sha256)).size, 24);
  assert.equal(result.assets[0].width, 1536);
});

test('asset check rejects duplicate content, missing and unknown files', async t => {
  const { root, entries } = await fixture(t);
  await fs.copyFile(path.join(root, entries[0].src), path.join(root, entries[1].src));
  await assert.rejects(checkWallpapers(root), /duplicate content/i);
  await fs.writeFile(path.join(root, entries[1].src), jpeg(1536, 864, 1));
  await fs.writeFile(path.join(root, 'wallpapers', 'unknown.txt'), 'unexpected');
  await assert.rejects(checkWallpapers(root), /unexpected|unknown/i);
  await fs.unlink(path.join(root, 'wallpapers', 'unknown.txt'));
  await fs.unlink(path.join(root, entries[0].src));
  await assert.rejects(checkWallpapers(root), /missing|files/i);
});

test('asset check rejects small, wrong-shape and oversized images', async t => {
  const { root, entries } = await fixture(t);
  const first = path.join(root, entries[0].src);
  await fs.writeFile(first, jpeg(1024, 576));
  await assert.rejects(checkWallpapers(root), /1280/);
  await fs.writeFile(first, jpeg(1536, 1024));
  await assert.rejects(checkWallpapers(root), /16:9/);
  await fs.writeFile(first, Buffer.alloc(1500001));
  await assert.rejects(checkWallpapers(root), /1.5 MB/);
});

test('asset check rejects a linked wallpaper directory', async t => {
  const { root } = await fixture(t);
  await fs.rename(path.join(root, 'wallpapers'), path.join(root, 'originals'));
  await fs.symlink(path.join(root, 'originals'), path.join(root, 'wallpapers'), 'junction');
  await assert.rejects(checkWallpapers(root), /link/i);
});

test('asset check rejects linked files and aggregate size over the package budget', async t => {
  const { root, entries } = await fixture(t);
  const first = path.join(root, entries[0].src);
  await fs.unlink(first);
  await fs.mkdir(path.join(root, 'linked-target'));
  // Junctions work without elevated Windows symlink permission and must also be denied.
  await fs.symlink(path.join(root, 'linked-target'), first, 'junction');
  await assert.rejects(checkWallpapers(root), /link/i);
  await fs.rmdir(first);
  await Promise.all(entries.map((entry, index) => {
    const header = jpeg(1536, 864, index);
    const bytes = Buffer.concat([header.subarray(0, -2), Buffer.alloc(1000001 - header.length), header.subarray(-2)]);
    return fs.writeFile(path.join(root, entry.src), bytes);
  }));
  await assert.rejects(checkWallpapers(root), /24 MB/);
});
