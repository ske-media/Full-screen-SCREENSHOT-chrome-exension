import { jsPDF } from "jspdf";
import { renderExportCanvas } from "./draw";
import type { Annotation } from "./types";

function isExtensionPage() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

export function slugifyFilename(title: string) {
  const base = title
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || "capture";
}

export async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    if (isExtensionPage() && chrome.downloads?.download) {
      await chrome.downloads.download({ url, filename, saveAs: true });
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Export canvas impossible."));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

export async function exportPng(
  image: HTMLImageElement,
  annotations: Annotation[],
  filename: string,
) {
  const canvas = renderExportCanvas(image, annotations);
  const blob = await canvasToBlob(canvas, "image/png");
  await downloadBlob(blob, `${filename}.png`);
}

export async function exportJpg(
  image: HTMLImageElement,
  annotations: Annotation[],
  filename: string,
) {
  const canvas = renderExportCanvas(image, annotations);
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  await downloadBlob(blob, `${filename}.jpg`);
}

/**
 * PDF multi-pages A4 : les captures très hautes sont découpées
 * en tranches successives plutôt que forcées dans une seule page.
 */
export async function exportPdf(
  image: HTMLImageElement,
  annotations: Annotation[],
  filename: string,
) {
  const canvas = renderExportCanvas(image, annotations);
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const scale = usableW / canvas.width;
  const sliceSrcH = usableH / scale;

  let sy = 0;
  let first = true;
  while (sy < canvas.height - 0.5) {
    const h = Math.min(sliceSrcH, canvas.height - sy);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.ceil(h));
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible.");
    ctx.drawImage(canvas, 0, -sy);
    const data = slice.toDataURL("image/jpeg", 0.86);
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(data, "JPEG", margin, margin, usableW, h * scale);
    sy += h;
  }

  const blob = pdf.output("blob");
  await downloadBlob(blob, `${filename}.pdf`);
}
