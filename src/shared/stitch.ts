/**
 * Assemblage (stitch) des captures viewport en une image pleine page.
 *
 * Chaque tranche est dessinée à la position Y correspondant au scroll CSS,
 * convertie en pixels device. La dernière tranche, souvent recouverte d'un
 * chevauchement, est collée par-dessus : c'est elle qui porte le bas réel
 * de la page.
 *
 * Si le canvas dépasse les limites du moteur (dimension ou nombre de pixels),
 * l'image est réduite proportionnellement.
 */
import { MAX_CANVAS_DIM, MAX_CANVAS_PIXELS } from "./types";

export type Slice = {
  blob: Blob;
  y: number;
};

export type StitchMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  pageWidth: number;
  pageHeight: number;
};

export type StitchResult = {
  blob: Blob;
  width: number;
  height: number;
  scaled: boolean;
};

export async function stitchSlices(
  slices: Slice[],
  metrics: StitchMetrics,
): Promise<StitchResult> {
  if (slices.length === 0) {
    throw new Error("Aucune tranche à assembler.");
  }

  const bitmaps = await Promise.all(
    slices.map(async (slice) => {
      const bmp = await createImageBitmap(slice.blob);
      return { bmp, y: slice.y };
    }),
  );

  try {
    const sample = bitmaps[0].bmp;
    const viewportHeight = Math.max(1, metrics.viewportHeight);
    const pxPerCssY = sample.height / viewportHeight;

    const fullWidth = sample.width;
    const fullHeight = Math.max(sample.height, Math.round(metrics.pageHeight * pxPerCssY));

    let scale = 1;
    if (fullWidth > MAX_CANVAS_DIM || fullHeight > MAX_CANVAS_DIM) {
      scale = Math.min(MAX_CANVAS_DIM / fullWidth, MAX_CANVAS_DIM / fullHeight, 1);
    }
    if (fullWidth * fullHeight * scale * scale > MAX_CANVAS_PIXELS) {
      scale = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (fullWidth * fullHeight)));
    }

    const outW = Math.max(1, Math.round(fullWidth * scale));
    const outH = Math.max(1, Math.round(fullHeight * scale));

    const canvas = new OffscreenCanvas(outW, outH);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("OffscreenCanvas 2D indisponible dans le service worker.");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);

    for (const { bmp, y } of bitmaps) {
      const destY = y * pxPerCssY * scale;
      const destW = bmp.width * scale;
      const destH = bmp.height * scale;
      ctx.drawImage(bmp, 0, destY, destW, destH);
    }

    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { blob, width: outW, height: outH, scaled: scale < 0.999 };
  } finally {
    for (const { bmp } of bitmaps) {
      bmp.close();
    }
  }
}
