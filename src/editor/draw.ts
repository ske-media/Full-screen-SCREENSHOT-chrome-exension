import type { Annotation, Point } from "./types";

export function normalizeRect(x0: number, y0: number, x1: number, y1: number) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function drawPen(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
) {
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
) {
  const head = Math.max(14, width * 3.6);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - head * Math.cos(angle - Math.PI / 6),
    y2 - head * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - head * Math.cos(angle + Math.PI / 6),
    y2 - head * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, item: Annotation) {
  switch (item.kind) {
    case "pen":
      drawPen(ctx, item.points, item.color, item.width);
      break;
    case "arrow":
      drawArrow(ctx, item.x1, item.y1, item.x2, item.y2, item.color, item.width);
      break;
    case "rect": {
      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.width;
      ctx.strokeRect(item.x, item.y, item.w, item.h);
      ctx.restore();
      break;
    }
    case "mask": {
      ctx.save();
      ctx.fillStyle = item.color;
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.restore();
      break;
    }
    case "text": {
      ctx.save();
      ctx.fillStyle = item.color;
      ctx.font = `600 ${item.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(item.text, item.x, item.y);
      ctx.restore();
      break;
    }
  }
}

export function renderExportCanvas(
  image: HTMLImageElement,
  annotations: Annotation[],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const item of annotations) {
    drawAnnotation(ctx, item);
  }
  return canvas;
}

export function cropImage(
  image: HTMLImageElement,
  crop: { x: number; y: number; w: number; h: number },
): Promise<HTMLImageElement> {
  const canvas = document.createElement("canvas");
  const w = Math.max(1, Math.round(crop.w));
  const h = Math.max(1, Math.round(crop.h));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas 2D indisponible."));
  ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  return canvasToImage(canvas);
}

export function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Impossible d'exporter le canvas."));
        return;
      }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Chargement de l'image recadrée impossible."));
      };
      img.src = url;
    }, "image/png");
  });
}

export function translateAnnotations(
  annotations: Annotation[],
  dx: number,
  dy: number,
  bounds: { w: number; h: number },
): Annotation[] {
  const next: Annotation[] = [];
  for (const item of annotations) {
    if (item.kind === "pen") {
      const points = item.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      if (points.some((p) => p.x >= 0 && p.y >= 0 && p.x <= bounds.w && p.y <= bounds.h)) {
        next.push({ ...item, points });
      }
    } else if (item.kind === "arrow") {
      const shifted = {
        ...item,
        x1: item.x1 + dx,
        y1: item.y1 + dy,
        x2: item.x2 + dx,
        y2: item.y2 + dy,
      };
      next.push(shifted);
    } else if (item.kind === "text") {
      next.push({ ...item, x: item.x + dx, y: item.y + dy });
    } else {
      next.push({ ...item, x: item.x + dx, y: item.y + dy });
    }
  }
  return next;
}

export function uid() {
  return crypto.randomUUID();
}
