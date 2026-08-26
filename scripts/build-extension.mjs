/**
 * Bundles le service worker (ESM) et le content script (IIFE)
 * après le build Vite des pages HTML/React.
 */
import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

if (!existsSync(dist)) {
  throw new Error("Le dossier dist/ est absent. Lancez d'abord `vite build`.");
}

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/background/service-worker.ts"],
  bundle: true,
  outfile: "dist/background.js",
  format: "iife",
  platform: "browser",
  target: "chrome120",
  logLevel: "info",
});

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/content/capture.ts"],
  bundle: true,
  outfile: "dist/content.js",
  format: "iife",
  platform: "browser",
  target: "chrome120",
  logLevel: "info",
});

const required = ["manifest.json", "background.js", "content.js", "popup.html", "editor.html"];
for (const file of required) {
  if (!existsSync(join(dist, file))) {
    throw new Error(`Fichier manquant après build : dist/${file}`);
  }
}

const pack = spawnSync(process.execPath, [join(root, "scripts/pack-zip.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (pack.status !== 0) {
  process.exit(pack.status ?? 1);
}

console.log("Extension assemblée dans dist/ et full-page-capture.zip");
