import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const svgPath = resolve("public/icons/seizn-mark.svg");
const svg = readFileSync(svgPath);

const sizes = [
  { name: "favicon-16.png", size: 16 },
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-48.png", size: 48 },
  { name: "favicon-192.png", size: 192 },
  { name: "favicon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of sizes) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(resolve("public", name));
  console.log(`generated public/${name} (${size}x${size})`);
}
