import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8"));
const arch = process.arch === "arm64" ? "arm64" : "x64";
const releaseDir = path.join(desktopRoot, "release");
const appPath = path.join(releaseDir, `mac-${arch}`, "Termira.app");
const stagingDir = path.join(releaseDir, "dmg-staging");
const dmgPath = path.join(releaseDir, `Termira-${packageJson.version}-${arch}.dmg`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}`);
  }
}

if (!fs.existsSync(appPath)) {
  throw new Error(`Packaged app not found: ${appPath}`);
}

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

run("ditto", [appPath, path.join(stagingDir, "Termira.app")]);
fs.symlinkSync("/Applications", path.join(stagingDir, "Applications"));

fs.rmSync(dmgPath, { force: true });
run("hdiutil", [
  "create",
  "-volname",
  "Termira",
  "-srcfolder",
  stagingDir,
  "-ov",
  "-format",
  "UDZO",
  dmgPath
]);

fs.rmSync(stagingDir, { recursive: true, force: true });
