/**
 * Rebundle popup + éditeur en IIFE, fichiers stables à la racine.
 * Évite ERR_FILE_NOT_FOUND : les scripts type=module hashés cassent
 * souvent le popup Chrome une fois le service worker endormi (~30 min).
 */
import * as esbuild from "esbuild";
import { copyFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const skipCss = {
  name: "skip-css",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
  },
};

const cssFile = readdirSync(join(dist, "assets")).find((name) => name.endsWith(".css"));
if (!cssFile) {
  throw new Error("CSS Vite introuvable dans dist/assets");
}
copyFileSync(join(dist, "assets", cssFile), join(dist, "ui.css"));

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/popup/main.tsx"],
  bundle: true,
  outfile: "dist/popup.js",
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  minify: true,
  plugins: [skipCss],
  logLevel: "info",
});

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/editor/main.tsx"],
  bundle: true,
  outfile: "dist/editor.js",
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  minify: true,
  plugins: [skipCss],
  logLevel: "info",
});

writeFileSync(
  join(dist, "popup.html"),
  `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Full Page Capture</title>
    <link rel="stylesheet" href="ui.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="popup.js"></script>
  </body>
</html>
`,
  "utf8",
);

writeFileSync(
  join(dist, "editor.html"),
  `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Éditeur — Full Page Capture</title>
    <link rel="icon" type="image/png" href="icons/icon32.png" />
    <link rel="stylesheet" href="ui.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="editor.js"></script>
  </body>
</html>
`,
  "utf8",
);

console.log("UI stabilisée : popup.js / editor.js / ui.css (sans hash, sans module)");
