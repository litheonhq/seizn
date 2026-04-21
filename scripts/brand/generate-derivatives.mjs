import { mkdir, writeFile, copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const brandDir = path.join(root, "brand");
const publicDir = path.join(root, "public");
const publicBrandDir = path.join(publicDir, "brand");

const markSource = path.join(brandDir, "seizn-mark-source.png");
const stackedSource = path.join(brandDir, "seizn-stacked-source-4k.png");
const horizontalSource = path.join(brandDir, "seizn-horizontal-source-4k.png");

async function ensureDirs() {
  await mkdir(publicBrandDir, { recursive: true });
  await mkdir(path.join(root, "packages", "seizn-sdk-js"), { recursive: true });
  await mkdir(path.join(root, "packages", "seizn-mcp"), { recursive: true });
  await mkdir(path.join(root, "cli", "seizn"), { recursive: true });
}

function pngToIco(pngEntries) {
  const headerSize = 6;
  const entrySize = 16;
  const directorySize = pngEntries.length * entrySize;
  const header = Buffer.alloc(headerSize + directorySize);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngEntries.length, 4);

  let imageOffset = headerSize + directorySize;
  for (let index = 0; index < pngEntries.length; index += 1) {
    const { size, buffer } = pngEntries[index];
    const entryOffset = headerSize + index * entrySize;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset);
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(buffer.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += buffer.length;
  }

  return Buffer.concat([header, ...pngEntries.map((entry) => entry.buffer)]);
}

async function squarePng(input, output, size) {
  await sharp(input)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toColorspace("srgb")
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function widthPng(input, output, width) {
  await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .toColorspace("srgb")
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function normalizeRasterSource(input, label) {
  const header = await readFile(input, { encoding: null });
  const signature = header.subarray(0, 4).toString("ascii");
  if (signature !== "8BPS") return { input, cleanup: async () => {} };

  const tempDir = await mkdtemp(path.join(os.tmpdir(), `seizn-${label}-`));
  const normalized = path.join(tempDir, `${label}.png`);
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-frames:v",
    "1",
    normalized,
  ]);

  return {
    input: normalized,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

async function buildOgImage() {
  const mark = await sharp(markSource)
    .resize(470, 470, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toColorspace("srgb")
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: "#0a0a12",
    },
  })
    .composite([{ input: mark, gravity: "center" }])
    .toColorspace("srgb")
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, "og-image.png"));
}

async function buildIco() {
  const entries = [];
  for (const size of [16, 32, 48]) {
    const buffer = await sharp(markSource)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toColorspace("srgb")
      .png({ compressionLevel: 9 })
      .toBuffer();
    entries.push({ size, buffer });
  }
  await writeFile(path.join(publicDir, "favicon.ico"), pngToIco(entries));
}

async function main() {
  await ensureDirs();
  const horizontal = await normalizeRasterSource(horizontalSource, "horizontal-source");

  try {
    for (const size of [256, 512, 1024]) {
      await squarePng(markSource, path.join(publicBrandDir, `seizn-mark-${size}.png`), size);
    }

    for (const size of [16, 32, 192, 512]) {
      await squarePng(markSource, path.join(publicDir, `favicon-${size}.png`), size);
    }
    await squarePng(markSource, path.join(publicDir, "apple-touch-icon.png"), 180);
    await buildIco();
    await buildOgImage();

    await widthPng(stackedSource, path.join(publicBrandDir, "seizn-stacked-1024.png"), 1024);
    await widthPng(stackedSource, path.join(publicBrandDir, "seizn-stacked-512.png"), 512);

    for (const width of [512, 1024, 2048]) {
      await widthPng(horizontal.input, path.join(publicBrandDir, `seizn-horizontal-${width}.png`), width);
    }

    for (const packageDir of [
      path.join(root, "packages", "seizn-sdk-js"),
      path.join(root, "packages", "seizn-mcp"),
      path.join(root, "cli", "seizn"),
    ]) {
      await copyFile(path.join(publicBrandDir, "seizn-mark-512.png"), path.join(packageDir, "logo.png"));
      await copyFile(path.join(publicBrandDir, "seizn-horizontal-1024.png"), path.join(packageDir, "banner.png"));
    }

    console.log("Generated Seizn brand derivatives.");
  } finally {
    await horizontal.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
