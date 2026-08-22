import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, drawPixelFn) {
  // RGBA buffer
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT Chunk
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }

  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const toCrc = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcVal = crc32(toCrc);
  buf.writeUInt32BE(crcVal, 8 + len);
  return buf;
}

function drawHospitalIcon(x, y, w, h, isMaskable = false) {
  // Normalize coordinates 0 to 1
  const nx = x / w;
  const ny = y / h;

  // Background teal color #0F766E -> #115E59
  const gradT = (nx + ny) / 2;
  const bgR = Math.round(15 + gradT * (17 - 15));
  const bgG = Math.round(118 + gradT * (94 - 118));
  const bgB = Math.round(110 + gradT * (89 - 110));

  if (!isMaskable) {
    // Rounded corner check
    const radius = 0.22;
    let outside = false;
    if (nx < radius && ny < radius) {
      if (Math.hypot(nx - radius, ny - radius) > radius) outside = true;
    } else if (nx > 1 - radius && ny < radius) {
      if (Math.hypot(nx - (1 - radius), ny - radius) > radius) outside = true;
    } else if (nx < radius && ny > 1 - radius) {
      if (Math.hypot(nx - radius, ny - (1 - radius)) > radius) outside = true;
    } else if (nx > 1 - radius && ny > 1 - radius) {
      if (Math.hypot(nx - (1 - radius), ny - (1 - radius)) > radius) outside = true;
    }
    if (outside) return [0, 0, 0, 0];
  }

  // Centered cross geometry
  const cx = 0.5;
  const cy = 0.5;
  const dx = Math.abs(nx - cx);
  const dy = Math.abs(ny - cy);

  // Outer circle shield
  const distCenter = Math.hypot(dx, dy);
  const inCircle = distCenter < 0.38;

  // White Cross: vertical bar dx < 0.11 & dy < 0.30; horizontal bar dy < 0.11 & dx < 0.30
  const inWhiteCross = (dx < 0.11 && dy < 0.30) || (dy < 0.11 && dx < 0.30);

  // Inner Teal Cross: vertical bar dx < 0.055 & dy < 0.24; horizontal bar dy < 0.055 & dx < 0.24
  const inInnerCross = (dx < 0.055 && dy < 0.24) || (dy < 0.055 && dx < 0.24);

  if (inInnerCross) {
    return [15, 118, 110, 255]; // #0F766E
  }
  if (inWhiteCross) {
    return [255, 255, 255, 255]; // Pure white
  }
  if (inCircle) {
    return [Math.min(255, bgR + 25), Math.min(255, bgG + 25), Math.min(255, bgB + 25), 255];
  }

  return [bgR, bgG, bgB, 255];
}

const iconsDir = path.resolve('icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate 192x192
const png192 = createPNG(192, 192, (x, y, w, h) => drawHospitalIcon(x, y, w, h, false));
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), png192);

// Generate 512x512
const png512 = createPNG(512, 512, (x, y, w, h) => drawHospitalIcon(x, y, w, h, false));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), png512);

// Generate 512x512 Maskable
const pngMaskable512 = createPNG(512, 512, (x, y, w, h) => drawHospitalIcon(x, y, w, h, true));
fs.writeFileSync(path.join(iconsDir, 'icon-maskable-512.png'), pngMaskable512);

// Generate 180x180 Apple Touch Icon
const pngApple = createPNG(180, 180, (x, y, w, h) => drawHospitalIcon(x, y, w, h, false));
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), pngApple);

// Generate 64x64 Favicon
const pngFavicon = createPNG(64, 64, (x, y, w, h) => drawHospitalIcon(x, y, w, h, false));
fs.writeFileSync(path.resolve('favicon.ico'), pngFavicon);
fs.writeFileSync(path.join(iconsDir, 'favicon.png'), pngFavicon);

console.log('Successfully generated all PWA PNG icons and favicons!');
