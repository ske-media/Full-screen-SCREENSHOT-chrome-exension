/**
 * Empaquette dist/ dans full-page-capture.zip (prêt à décompresser
 * puis à charger via chrome://extensions).
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const stagingRoot = join(root, ".pack-staging");
const staging = join(stagingRoot, "full-page-capture");
const zipPath = join(root, "full-page-capture.zip");

if (!existsSync(dist)) {
  throw new Error("Le dossier dist/ est absent. Lancez `npm run build`.");
}

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

const keep = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "editor.html",
  "assets",
  "icons",
];

for (const name of keep) {
  const from = join(dist, name);
  if (!existsSync(from)) {
    throw new Error(`Fichier manquant dans dist/ : ${name}`);
  }
  cpSync(from, join(staging, name), { recursive: true });
}

writeFileSync(
  join(staging, "INSTALL.txt"),
  [
    "Full Page Capture — installation Chrome",
    "",
    "Chrome n'installe pas un fichier .zip par glisser-déposer.",
    "Décompressez cette archive, puis :",
    "",
    "1. Ouvrez chrome://extensions",
    "2. Activez le Mode développeur (en haut à droite)",
    "3. Cliquez sur « Charger l'extension non empaquetée »",
    "4. Sélectionnez CE dossier (celui qui contient manifest.json)",
    "",
    "Cliquez ensuite sur l'icône de l'extension, puis sur",
    "« Capturer la page entière ».",
    "",
  ].join("\n"),
  "utf8",
);

if (existsSync(zipPath)) {
  rmSync(zipPath);
}

execFileSync("zip", ["-r", "-q", zipPath, "full-page-capture"], {
  cwd: stagingRoot,
});

rmSync(stagingRoot, { recursive: true, force: true });
console.log("Archive créée :", zipPath);
