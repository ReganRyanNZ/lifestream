// Generates PWA icons (public/icons/*.png) from inline SVG definitions.
// Run once: npm run icons
import sharp from "sharp";
import fs from "node:fs/promises";

function iconSvg({ rounded = true, barScale = 1.0, bgOpacity = "1" }) {
  const rx = rounded ? 112 : 0;
  // bars centered in the 512 canvas; barScale shrinks them for maskable safe zone
  const bars = [
    { x: 136, h: 160 },
    { x: 232, h: 288 },
    { x: 328, h: 208 },
  ];
  const cy = 256;
  const rects = bars
    .map(({ x, h }) => {
      const hh = h * barScale;
      const y = cy - hh / 2;
      return `<rect x="${x}" y="${y.toFixed(1)}" width="48" height="${hh.toFixed(
        1,
      )}" rx="24" fill="url(#bars)"/>`;
    })
    .join("\n  ");
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0c4a6e"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="bars" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)" opacity="${bgOpacity}"/>
  ${rects}
</svg>`;
}

const out = [
  ["icon-192.png", iconSvg({}), 192],
  ["icon-512.png", iconSvg({}), 512],
  ["icon-maskable-512.png", iconSvg({ rounded: false, barScale: 0.7 }), 512],
  ["apple-touch-icon.png", iconSvg({ rounded: false, barScale: 0.85 }), 180],
];

await fs.mkdir("public/icons", { recursive: true });
for (const [name, svg, size] of out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
