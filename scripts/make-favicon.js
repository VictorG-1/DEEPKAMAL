/** Pack existing PNG favicons into favicon.ico (PNG-compressed ICO). */
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const entries = [
  { size: 16, file: 'favicon-16.png' },
  { size: 32, file: 'favicon-32.png' },
  { size: 48, file: 'favicon-48.png' }
];

const frames = [];
for (const e of entries) {
  const p = path.join(pub, e.file);
  if (!fs.existsSync(p)) continue;
  frames.push({ size: e.size, data: fs.readFileSync(p) });
}
if (!frames.length) {
  console.error('No favicon PNGs found');
  process.exit(1);
}

const headerSize = 6 + 16 * frames.length;
let offset = headerSize;
const bufs = [Buffer.alloc(headerSize)];
bufs[0].writeUInt16LE(0, 0);
bufs[0].writeUInt16LE(1, 2);
bufs[0].writeUInt16LE(frames.length, 4);

frames.forEach((f, i) => {
  const o = 6 + i * 16;
  bufs[0].writeUInt8(f.size >= 256 ? 0 : f.size, o);
  bufs[0].writeUInt8(f.size >= 256 ? 0 : f.size, o + 1);
  bufs[0].writeUInt8(0, o + 2);
  bufs[0].writeUInt8(0, o + 3);
  bufs[0].writeUInt16LE(1, o + 4);
  bufs[0].writeUInt16LE(32, o + 6);
  bufs[0].writeUInt32LE(f.data.length, o + 8);
  bufs[0].writeUInt32LE(offset, o + 12);
  offset += f.data.length;
  bufs.push(f.data);
});

const out = Buffer.concat(bufs);
fs.writeFileSync(path.join(pub, 'favicon.ico'), out);
fs.copyFileSync(path.join(pub, 'favicon-32.png'), path.join(pub, 'favicon.png'));
console.log('Wrote favicon.ico', out.length, 'bytes ·', frames.length, 'frames');
