/** Génère une fausse capture de page article pour l'aperçu hors extension. */
export async function createDemoImage(): Promise<HTMLImageElement> {
  const width = 900;
  const height = 2400;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible.");

  ctx.fillStyle = "#f6f4ef";
  ctx.fillRect(0, 0, width, height);

  // En-tête
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, width, 88);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 28px 'Segoe UI', sans-serif";
  ctx.fillText("Le Journal du Web", 48, 54);
  ctx.font = "500 13px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#a5b4fc";
  ctx.fillText("Tech  ·  Design  ·  Capture", 430, 54);

  // Hero
  ctx.fillStyle = "#111827";
  ctx.font = "800 42px 'Segoe UI', sans-serif";
  wrapText(ctx, "Capturer une page web entière, sans couture visible.", 48, 160, 800, 50);

  ctx.fillStyle = "#4f46e5";
  ctx.fillRect(48, 268, 72, 4);

  ctx.fillStyle = "#3f3f46";
  ctx.font = "400 18px 'Segoe UI', sans-serif";
  const intro =
    "Cette image de démonstration simule une capture pleine page. Recadrez, annotez avec le crayon, les flèches, les rectangles ou le texte, puis exportez en PNG, JPG ou PDF.";
  wrapText(ctx, intro, 48, 300, 800, 28);

  // Carte
  roundRect(ctx, 48, 430, 804, 180, 16);
  ctx.fillStyle = "#eef2ff";
  ctx.fill();
  ctx.fillStyle = "#312e81";
  ctx.font = "700 20px 'Segoe UI', sans-serif";
  ctx.fillText("Comment ça marche", 76, 478);
  ctx.font = "400 16px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#3730a3";
  wrapText(
    ctx,
    "L'extension fait défiler l'onglet, photographie chaque viewport, masque les en-têtes fixed, puis assemble les tranches au pixel près.",
    76,
    512,
    748,
    24,
  );

  // Graphique factice
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 48, 650, 804, 320, 16);
  ctx.fill();
  ctx.strokeStyle = "#e4e4e7";
  ctx.stroke();
  ctx.fillStyle = "#18181b";
  ctx.font = "700 18px 'Segoe UI', sans-serif";
  ctx.fillText("Hauteur de page vs. limite canvas", 76, 698);

  const bars = [0.35, 0.55, 0.72, 0.48, 0.9, 0.62];
  bars.forEach((h, i) => {
    const x = 100 + i * 120;
    const bh = h * 180;
    const y = 900 - bh;
    ctx.fillStyle = i === 4 ? "#4f46e5" : "#818cf8";
    roundRect(ctx, x, y, 64, bh, 8);
    ctx.fill();
  });

  // Article
  ctx.fillStyle = "#18181b";
  ctx.font = "700 26px 'Segoe UI', sans-serif";
  ctx.fillText("Cas limites gérés", 48, 1040);
  ctx.fillStyle = "#3f3f46";
  ctx.font = "400 17px 'Segoe UI', sans-serif";
  const body = [
    "Les pages très longues peuvent dépasser la taille maximale d'un canvas (souvent 16 384 px). Dans ce cas, l'image est automatiquement mise à l'échelle avant assemblage, et un bandeau prévient dans l'éditeur.",
    "Les en-têtes position: fixed ou sticky sont masqués après la première tranche afin d'éviter les répétitions. Les barres de défilement sont temporairement masquées.",
    "Les pages chrome://, le Chrome Web Store et les PDF internes ne peuvent pas être capturés : l'API captureVisibleTab l'interdit.",
    "Utilisez le recadrage pour extraire une zone, le masque opaque pour cacher une donnée sensible, et la flèche pour pointer un détail.",
  ];
  let y = 1080;
  for (const p of body) {
    y = wrapText(ctx, p, 48, y, 800, 26) + 28;
  }

  // Citation
  roundRect(ctx, 48, y + 10, 804, 140, 16);
  ctx.fillStyle = "#111827";
  ctx.fill();
  ctx.fillStyle = "#c7d2fe";
  ctx.font = "italic 20px 'Segoe UI', sans-serif";
  wrapText(
    ctx,
    "« Une capture utile n'est pas une photo : c'est un argument, annoté et exportable. »",
    76,
    y + 50,
    748,
    28,
  );

  // Pied
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, height - 90, width, 90);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "500 14px 'Segoe UI', sans-serif";
  ctx.fillText("Aperçu Full Page Capture  ·  Image de démonstration", 48, height - 40);

  return canvasToImage(canvas);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Démo : export canvas impossible."));
        return;
      }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => reject(new Error("Démo : chargement image impossible."));
      img.src = url;
    }, "image/png");
  });
}
