// Generate the local icon with Node's standard library. No downloaded artwork.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const data = Buffer.concat([Buffer.from(type), bytes]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(data));
  return Buffer.concat([length, data, checksum]);
}
const rows = [];
for (let y = 0; y < 80; y++) {
  const row = Buffer.alloc(1 + 80 * 3);
  for (let x = 0; x < 80; x++) {
    let color = [0, 0, 0];
    if (x >= 14 && x < 66 && y >= 14 && y < 66) color = [245, 240, 230];
    if (x >= 21 && x < 59 && y >= 21 && y < 59) color = [0, 0, 0];
    if (x >= 29 && x < 51 && y >= 29 && y < 51) color = [246, 162, 60];
    row.set(color, 1 + x * 3);
  }
  rows.push(row);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(80, 0);
header.writeUInt32BE(80, 4);
header[8] = 8;
header[9] = 2;
fs.writeFileSync(path.join(__dirname, '..', 'app', 'icon.png'), Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))
]));
