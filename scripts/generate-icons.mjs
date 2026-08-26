/**
 * Génère les icônes PNG de l'extension (16 / 32 / 48 / 128).
 * Dessin vectoriel rasterisé : carré arrondi indigo + cadre de capture.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function rgbaToPng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(width * 4 + 1) * y] = 0;
    rgba.copy(raw, (width * 4 + 1) * y + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(rgba, size, x, y, r, g, b, a = 255) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= size || yi >= size) return;
  const i = (yi * size + xi) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

function inRoundedRect(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const cx = x < x0 + radius ? x0 + radius : x > x1 - radius ? x1 - radius : x;
  const cy = y < y0 + radius ? y0 + radius : y > y1 - radius ? y1 - radius : y;
  if (cx === x || cy === y) return true;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const pad = size * 0.06;
  const radius = size * 0.22;
  const bg = [79, 70, 229];
  const white = [255, 255, 255];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y, pad, pad, size - 1 - pad, size - 1 - pad, radius)) {
        setPixel(rgba, size, x, y, ...bg);
      }
    }
  }

  // Cadre de capture (rectangle intérieur)
  const fx0 = size * 0.24;
  const fy0 = size * 0.3;
  const fx1 = size * 0.76;
  const fy1 = size * 0.74;
  const t = Math.max(2, Math.round(size * 0.07));
  for (let y = fy0; y <= fy1; y++) {
    for (let x = fx0; x <= fx1; x++) {
      const onBorder =
        x < fx0 + t || x > fx1 - t || y < fy0 + t || y > fy1 - t;
      if (onBorder) setPixel(rgba, size, x, y, ...white);
    }
  }

  // Coins de viseur
  const c = Math.max(3, Math.round(size * 0.14));
  const corners = [
    [fx0 - t, fy0 - t],
    [fx1 - c + t, fy0 - t],
    [fx0 - t, fy1 - c + t],
    [fx1 - c + t, fy1 - c + t],
  ];
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + c; y++) {
      for (let x = cx; x < cx + c; x++) {
        const on =
          x < cx + t || x > cx + c - t || y < cy + t || y > cy + c - t;
        if (on) setPixel(rgba, size, x, y, ...white);
      }
    }
  }

  return rgbaToPng(size, size, rgba);
}

mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon${size}.png`), drawIcon(size));
}
console.log("Icônes générées dans", outDir);
