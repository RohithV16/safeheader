import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ICONS_DIR = path.resolve('public/icons');
fs.mkdirSync(ICONS_DIR, { recursive: true });

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size, paused) {
  const buf = Buffer.alloc(size * size * 4);
  const bg = paused ? [100, 116, 139, 255] : [46, 125, 50, 255];
  const bgDark = paused ? [71, 85, 105, 255] : [27, 94, 32, 255];
  const fg = [255, 255, 255, 255];
  const accent = paused ? [203, 213, 225, 255] : [165, 214, 167, 255];

  const radius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(0, radius - x, x - (size - 1 - radius));
      const dy = Math.max(0, radius - y, y - (size - 1 - radius));
      const dist = Math.hypot(dx, dy);
      const idx = (y * size + x) * 4;

      if (dist > radius + 0.5) {
        buf[idx + 3] = 0;
        continue;
      }

      const alpha = dist > radius - 0.5 ? Math.round((radius + 0.5 - dist) * 255) : 255;
      const t = y / size;
      const r = Math.round(bg[0] * (1 - t) + bgDark[0] * t);
      const g = Math.round(bg[1] * (1 - t) + bgDark[1] * t);
      const b = Math.round(bg[2] * (1 - t) + bgDark[2] * t);

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = alpha;
    }
  }

  const fillRect = (rx, ry, rw, rh, color) => {
    const x0 = Math.max(0, Math.round(rx * size));
    const y0 = Math.max(0, Math.round(ry * size));
    const x1 = Math.min(size, Math.round((rx + rw) * size));
    const y1 = Math.min(size, Math.round((ry + rh) * size));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * size + x) * 4;
        if (buf[idx + 3] > 0) {
          buf[idx] = color[0];
          buf[idx + 1] = color[1];
          buf[idx + 2] = color[2];
          buf[idx + 3] = 255;
        }
      }
    }
  };

  // Three crisp horizontal "header" bars with a left accent dot/tag
  fillRect(0.20, 0.24, 0.14, 0.12, accent);
  fillRect(0.39, 0.24, 0.41, 0.12, fg);

  fillRect(0.20, 0.44, 0.14, 0.12, accent);
  fillRect(0.39, 0.44, 0.34, 0.12, fg);

  fillRect(0.20, 0.64, 0.14, 0.12, accent);
  fillRect(0.39, 0.64, 0.41, 0.12, fg);

  return encodePng(size, size, buf);
}

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(ICONS_DIR, `icon${size}.png`), drawIcon(size, false));
  fs.writeFileSync(path.join(ICONS_DIR, `icon${size}-paused.png`), drawIcon(size, true));
}

console.log('Generated PNG icons in public/icons');
