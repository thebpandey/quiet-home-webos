const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

function validateManifest(entries, { allowPartial = false } = {}) {
  if (!Array.isArray(entries) || (allowPartial ? entries.length < 1 || entries.length > 24 : entries.length !== 24)) {
    throw new Error(allowPartial ? 'Preview manifest must contain 1 through 24 wallpapers.' : 'Manifest must contain exactly 24 wallpapers.');
  }
  const ids = new Set();
  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid wallpaper entry.');
    if (Object.keys(entry).sort().join(',') !== 'id,location,src,title') throw new Error('Unexpected manifest fields.');
    if (typeof entry.id !== 'string' || !/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id)) {
      throw new Error('Wallpaper IDs must be safe and unique.');
    }
    if (!entry.id.startsWith(String(index + 1).padStart(2, '0') + '-')) throw new Error('Wallpaper order must be 01 through 24.');
    ids.add(entry.id);
    if (entry.src !== `wallpapers/${entry.id}.jpg`) throw new Error('Wallpaper src path must match its ID.');
    for (const field of ['title', 'location']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim() || /[\x00-\x1f]/.test(entry[field])) {
        throw new Error(`Wallpaper ${field} must be nonempty text.`);
      }
    }
  });
}

// Read JPEG frame markers without adding a production image-library dependency.
// The conversion step separately decodes each source and final JPEG with Pillow.
function jpegDimensions(bytes) {
  const invalid = () => { throw new Error('Invalid or truncated JPEG.'); };
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) invalid();
  let offset = 2;
  let dimensions;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0 || marker === 0xd8 || marker === 0xd9) invalid();
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) invalid();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length - 2) invalid();
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) invalid();
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      const components = bytes[offset + 7];
      if (!width || !height || !components || length !== 8 + 3 * components) invalid();
      dimensions = { width, height };
    }
    if (marker === 0xda) {
      if (!dimensions || length < 6) invalid();
      return dimensions;
    }
    offset += length;
  }
  invalid();
}

async function regularFile(file) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Wallpaper files must be regular files, without links.');
  return stat;
}

async function checkWallpapers(root = path.join(__dirname, '..', 'app'), { allowPartial = false } = {}) {
  const directory = path.join(root, 'wallpapers');
  const directoryStat = await fs.lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new Error('Wallpaper directory must not be a link.');
  const manifestPath = path.join(root, 'wallpapers.json');
  await regularFile(manifestPath);
  const entries = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  validateManifest(entries, { allowPartial });
  const expected = new Set(entries.map(entry => path.basename(entry.src)));
  const files = await fs.readdir(directory);
  if (files.some(file => !expected.has(file))) throw new Error('Unexpected wallpaper files.');
  if (files.length !== expected.size) throw new Error('Missing wallpaper files.');
  const hashes = new Set();
  const assets = [];
  let totalBytes = 0;
  for (const entry of entries) {
    const file = path.join(root, entry.src);
    const stat = await regularFile(file);
    if (stat.size > 1500000) throw new Error(`${entry.id} exceeds 1.5 MB.`);
    const bytes = await fs.readFile(file);
    const dimensions = jpegDimensions(bytes);
    if (dimensions.width < 1280) throw new Error(`${entry.id} width must be at least 1280.`);
    if (Math.abs(dimensions.width / dimensions.height - 16 / 9) > 0.04) throw new Error(`${entry.id} must be near 16:9.`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (hashes.has(sha256)) throw new Error(`${entry.id} has duplicate content.`);
    hashes.add(sha256);
    totalBytes += bytes.length;
    assets.push({ ...entry, ...dimensions, bytes: bytes.length, sha256 });
  }
  if (totalBytes > 24000000) throw new Error('Wallpaper total exceeds 24 MB.');
  return { assets, totalBytes };
}

if (require.main === module) {
  checkWallpapers(undefined, { allowPartial: process.argv.includes('--preview') }).then(result => {
    console.log(`Wallpapers: ${result.assets.length} distinct JPEGs, ${result.totalBytes} bytes.`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { validateManifest, jpegDimensions, checkWallpapers };
