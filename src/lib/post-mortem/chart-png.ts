import { deflateSync } from 'node:zlib';
import type { PostMortemStoryPoint } from './types';

interface ChartRow {
  date: string;
  consistency: number;
  canonDensity: number;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function rgba(hex: string) {
  const normalized = hex.replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  };
}

function aggregate(points: PostMortemStoryPoint[]) {
  const byDate = new Map<string, { date: string; consistency: number; canonDensity: number; count: number }>();
  for (const point of points) {
    const current = byDate.get(point.snapshotDate) || {
      date: point.snapshotDate,
      consistency: 0,
      canonDensity: 0,
      count: 0,
    };
    current.consistency += point.consistencyScore;
    current.canonDensity += point.canonDensity;
    current.count += 1;
    byDate.set(point.snapshotDate, current);
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-16)
    .map((row) => ({
      date: row.date,
      consistency: row.consistency / Math.max(row.count, 1),
      canonDensity: row.canonDensity / Math.max(row.count, 1),
    }));
}

function setPixel(buffer: Buffer, width: number, x: number, y: number, color: ReturnType<typeof rgba>) {
  if (x < 0 || y < 0 || x >= width) return;
  const offset = (Math.floor(y) * width + Math.floor(x)) * 4;
  if (offset < 0 || offset + 3 >= buffer.length) return;
  buffer[offset] = color.r;
  buffer[offset + 1] = color.g;
  buffer[offset + 2] = color.b;
  buffer[offset + 3] = color.a;
}

function fillRect(
  buffer: Buffer,
  width: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  color: ReturnType<typeof rgba>
) {
  for (let yy = Math.max(0, Math.floor(y)); yy < Math.floor(y + rectHeight); yy += 1) {
    for (let xx = Math.max(0, Math.floor(x)); xx < Math.floor(x + rectWidth); xx += 1) {
      setPixel(buffer, width, xx, yy, color);
    }
  }
}

function drawLine(
  buffer: Buffer,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: ReturnType<typeof rgba>
) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - x);
  const sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y);
  const sy = y < endY ? 1 : -1;
  let error = dx + dy;

  while (true) {
    fillRect(buffer, width, x - 1, y - 1, 3, 3, color);
    if (x === endX && y === endY) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function encodePng(width: number, height: number, pixels: Buffer) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (stride + 1)] = 0;
    pixels.copy(scanlines, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function createStoryHealthChartPng(points: PostMortemStoryPoint[], width = 900, height = 360) {
  const rows: ChartRow[] = aggregate(points);
  const pixels = Buffer.alloc(width * height * 4);
  const bg = rgba('#0a0a12');
  const panel = rgba('#101022');
  const grid = rgba('#24243c');
  const line = rgba('#a78bfa');
  const bar = rgba('#f59e0b');
  const muted = rgba('#6e6e85');
  const top = 34;
  const left = 56;
  const right = width - 34;
  const bottom = height - 44;
  const chartWidth = right - left;
  const chartHeight = bottom - top;

  fillRect(pixels, width, 0, 0, width, height, bg);
  fillRect(pixels, width, 16, 16, width - 32, height - 32, panel);

  for (let index = 0; index <= 4; index += 1) {
    const y = top + (chartHeight / 4) * index;
    drawLine(pixels, width, left, y, right, y, grid);
  }
  drawLine(pixels, width, left, top, left, bottom, muted);
  drawLine(pixels, width, left, bottom, right, bottom, muted);

  const data = rows.length > 0 ? rows : [{ date: 'empty', consistency: 0, canonDensity: 0 }];
  const maxCanon = Math.max(1, ...data.map((row) => row.canonDensity));
  const step = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;
  const barWidth = Math.max(10, Math.min(32, chartWidth / Math.max(data.length, 1) / 2));

  data.forEach((row, index) => {
    const x = data.length > 1 ? left + step * index : left + chartWidth / 2;
    const barHeight = (row.canonDensity / maxCanon) * chartHeight * 0.55;
    fillRect(pixels, width, x - barWidth / 2, bottom - barHeight, barWidth, barHeight, bar);
  });

  for (let index = 0; index < data.length - 1; index += 1) {
    const current = data[index];
    const next = data[index + 1];
    const x0 = left + step * index;
    const x1 = left + step * (index + 1);
    const y0 = bottom - (Math.max(0, Math.min(100, current.consistency)) / 100) * chartHeight;
    const y1 = bottom - (Math.max(0, Math.min(100, next.consistency)) / 100) * chartHeight;
    drawLine(pixels, width, x0, y0, x1, y1, line);
  }

  if (data.length === 1) {
    const y = bottom - (Math.max(0, Math.min(100, data[0].consistency)) / 100) * chartHeight;
    drawLine(pixels, width, left, y, right, y, line);
  }

  return encodePng(width, height, pixels);
}
