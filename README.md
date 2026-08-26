# Full Page Capture

Extension Google Chrome (Manifest V3) pour capturer une **page web entière**, l’annoter dans un éditeur Canvas, puis l’exporter en PNG, JPG ou PDF.

## Fonctionnalités

- Capture pleine page par défilement automatique et assemblage (stitch) des viewports
- Masquage temporaire des barres de défilement et des éléments `position: fixed` / `sticky` (après la première tranche) pour éviter les répétitions
- Éditeur : recadrage, crayon, flèches, rectangles, masque opaque, texte
- Export PNG, JPG, PDF (PDF multi-pages A4 pour les captures très hautes)
- Pages trop longues : plafond de 100 tranches et réduction automatique si le canvas dépasse ~16 384 px / 40 Mpx

## Installation dans Chrome

1. Installez les dépendances et construisez l’extension :

```bash
npm install
npm run build
```

2. Ouvrez `chrome://extensions`
3. Activez le **Mode développeur**
4. Cliquez sur **Charger l’extension non empaquetée** et sélectionnez le dossier `dist/`

Cliquez ensuite sur l’icône de l’extension, puis sur **Capturer la page entière**. L’éditeur s’ouvre dans un nouvel onglet.

## Aperçu local de l’éditeur (sans Chrome)

```bash
npm install
npm run dev
```

Ouvre l’éditeur avec une image de démonstration sur [http://127.0.0.1:43123](http://127.0.0.1:43123). Le popup est visible sur `/popup.html`.

La capture d’un onglet réel n’est disponible que dans l’extension (API `chrome.tabs.captureVisibleTab`).

## Architecture

| Fichier | Rôle |
| --- | --- |
| `public/manifest.json` | Manifest V3 (`activeTab`, `scripting`, `tabs`, `storage`, `downloads`, `unlimitedStorage`) |
| `src/content/capture.ts` | Scroll DOM, masquage scrollbar / sticky / fixed, restauration |
| `src/background/service-worker.ts` | Orchestration, `captureVisibleTab`, ouverture de l’éditeur |
| `src/shared/stitch.ts` | Assemblage OffscreenCanvas + réduction si image trop grande |
| `src/shared/idb.ts` | Stockage du PNG final (IndexedDB, origine de l’extension) |
| `src/popup/` | Menu React + Tailwind |
| `src/editor/` | Éditeur Canvas React (crop, annotations, export jsPDF) |

## Limites

- Pages `chrome://`, Web Store, et certains PDF internes : capture interdite par Chrome
- Ne changez pas d’onglet pendant la capture
- Les layouts qui ne scrollent que dans un iframe interne peuvent être incomplets

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur d’aperçu de l’éditeur |
| `npm run build` | Bundle `dist/` prêt à charger dans Chrome |
| `npm run icons` | Régénère `public/icons/*.png` |
| `npm run typecheck` | Vérification TypeScript |
