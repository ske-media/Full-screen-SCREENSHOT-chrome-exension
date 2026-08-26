/**
 * Assemblage (stitch) des captures viewport en une image pleine page.
 *
 * Préfère un <canvas> DOM (éditeur) : plus stable qu'OffscreenCanvas dans
 * le service worker, qui peut tuer le SW sur une image trop lourde.
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

function createCanvas(width: number, height: number) {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible.");
    return { canvas, ctx };
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D indisponible.");
  return { canvas, ctx };
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (!blob) reject(new Error("Export PNG du canvas impossible."));
      else resolve(blob);
    }, "image/png");
  });
}

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

    const { canvas, ctx } = createCanvas(outW, outH);
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

    const blob = await canvasToBlob(canvas);
    return { blob, width: outW, height: outH, scaled: scale < 0.999 };
  } finally {
    for (const { bmp } of bitmaps) {
      bmp.close();
    }
  }
}
