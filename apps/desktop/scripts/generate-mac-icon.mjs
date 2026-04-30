import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const buildDir = path.join(desktopRoot, "build");
const svgPath = path.join(buildDir, "icon.svg");
const iconsetDir = path.join(buildDir, "icon.iconset");
const previewDir = path.join(buildDir, ".icon-preview");
const renderedPng = path.join(previewDir, "icon.svg.png");
const iconPath = path.join(buildDir, "icon.icns");

const iconSizes = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}`);
  }
}

if (!fs.existsSync(svgPath)) {
  throw new Error(`Icon source not found: ${svgPath}`);
}

fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.rmSync(previewDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

run("qlmanage", ["-t", "-s", "1024", "-o", previewDir, svgPath]);

if (!fs.existsSync(renderedPng)) {
  throw new Error(`Quick Look did not render expected PNG: ${renderedPng}`);
}

for (const [filename, size] of iconSizes) {
  run("sips", ["-z", String(size), String(size), renderedPng, "--out", path.join(iconsetDir, filename)]);
}

run("iconutil", ["-c", "icns", iconsetDir, "-o", iconPath]);
fs.rmSync(previewDir, { recursive: true, force: true });
