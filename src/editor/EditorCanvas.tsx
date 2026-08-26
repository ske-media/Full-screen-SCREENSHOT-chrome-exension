import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "../lib/cn";
import { drawAnnotation, normalizeRect, uid } from "./draw";
import type { Annotation, CropRect, Point, Tool } from "./types";

type Props = {
  image: HTMLImageElement;
  annotations: Annotation[];
  tool: Tool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  zoom: number;
  crop: CropRect | null;
  onCropChange: (crop: CropRect | null) => void;
  onCommit: (item: Annotation) => void;
};

type Draft =
  | { kind: "pen"; points: Point[] }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "mask"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "crop"; x0: number; y0: number; x1: number; y1: number };

export function EditorCanvas({
  image,
  annotations,
  tool,
  color,
  strokeWidth,
  fontSize,
  zoom,
  crop,
  onCropChange,
  onCommit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textPrompt, setTextPrompt] = useState<{
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    value: string;
  } | null>(null);

  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  const maxView = 2800;
  const viewScale = Math.min(1, maxView / naturalW, maxView / naturalH);
  const bufferW = Math.max(1, Math.round(naturalW * viewScale));
  const bufferH = Math.max(1, Math.round(naturalH * viewScale));

  const toImagePoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * naturalW;
      const y = ((clientY - rect.top) / rect.height) * naturalH;
      return {
        x: Math.min(naturalW, Math.max(0, x)),
        y: Math.min(naturalH, Math.max(0, y)),
      };
    },
    [naturalH, naturalW],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = bufferW;
    canvas.height = bufferH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, naturalW, naturalH);
    ctx.drawImage(image, 0, 0, naturalW, naturalH);

    for (const item of annotations) {
      drawAnnotation(ctx, item);
    }

    if (draft) {
      if (draft.kind === "pen") {
        drawAnnotation(ctx, {
          id: "draft",
          kind: "pen",
          points: draft.points,
          color,
          width: strokeWidth,
        });
      } else if (draft.kind === "arrow") {
        drawAnnotation(ctx, {
          id: "draft",
          kind: "arrow",
          x1: draft.x1,
          y1: draft.y1,
          x2: draft.x2,
          y2: draft.y2,
          color,
          width: strokeWidth,
        });
      } else if (draft.kind === "rect" || draft.kind === "mask" || draft.kind === "crop") {
        const r = normalizeRect(draft.x0, draft.y0, draft.x1, draft.y1);
        if (draft.kind === "mask") {
          drawAnnotation(ctx, { id: "draft", kind: "mask", ...r, color });
        } else if (draft.kind === "rect") {
          drawAnnotation(ctx, {
            id: "draft",
            kind: "rect",
            ...r,
            color,
            width: strokeWidth,
          });
        } else {
          ctx.save();
          ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
          ctx.fillRect(0, 0, naturalW, naturalH);
          ctx.clearRect(r.x, r.y, r.w, r.h);
          ctx.drawImage(image, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
          ctx.strokeStyle = "#818cf8";
          ctx.lineWidth = 2 / viewScale;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          ctx.restore();
        }
      }
    }

    if (crop && tool === "crop" && !draft) {
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.fillRect(0, 0, naturalW, naturalH);
      ctx.clearRect(crop.x, crop.y, crop.w, crop.h);
      ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, crop.x, crop.y, crop.w, crop.h);
      ctx.strokeStyle = "#818cf8";
      ctx.lineWidth = 2 / viewScale;
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.restore();
    }
  }, [
    annotations,
    bufferH,
    bufferW,
    color,
    crop,
    draft,
    image,
    naturalH,
    naturalW,
    strokeWidth,
    tool,
    viewScale,
  ]);

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    if (textPrompt) return;
    const pt = toImagePoint(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "text") {
      const rect = e.currentTarget.getBoundingClientRect();
      setTextPrompt({
        x: pt.x,
        y: pt.y,
        screenX: e.clientX - rect.left,
        screenY: e.clientY - rect.top,
        value: "",
      });
      return;
    }
    if (tool === "pen") {
      setDraft({ kind: "pen", points: [pt] });
    } else if (tool === "arrow") {
      setDraft({ kind: "arrow", x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    } else if (tool === "rect") {
      setDraft({ kind: "rect", x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
    } else if (tool === "mask") {
      setDraft({ kind: "mask", x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
    } else if (tool === "crop") {
      setDraft({ kind: "crop", x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
    }
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!draft) return;
    const pt = toImagePoint(e.clientX, e.clientY);
    if (!pt) return;
    if (draft.kind === "pen") {
      setDraft({ kind: "pen", points: [...draft.points, pt] });
    } else if (draft.kind === "arrow") {
      setDraft({ ...draft, x2: pt.x, y2: pt.y });
    } else {
      setDraft({ ...draft, x1: pt.x, y1: pt.y });
    }
  }

  function onPointerUp() {
    if (!draft) return;
    if (draft.kind === "pen" && draft.points.length > 0) {
      onCommit({
        id: uid(),
        kind: "pen",
        points: draft.points,
        color,
        width: strokeWidth,
      });
    } else if (draft.kind === "arrow") {
      if (Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 4) {
        onCommit({
          id: uid(),
          kind: "arrow",
          x1: draft.x1,
          y1: draft.y1,
          x2: draft.x2,
          y2: draft.y2,
          color,
          width: strokeWidth,
        });
      }
    } else if (draft.kind === "rect" || draft.kind === "mask" || draft.kind === "crop") {
      const r = normalizeRect(draft.x0, draft.y0, draft.x1, draft.y1);
      if (r.w > 3 && r.h > 3) {
        if (draft.kind === "crop") onCropChange(r);
        else if (draft.kind === "rect") {
          onCommit({ id: uid(), kind: "rect", ...r, color, width: strokeWidth });
        } else {
          onCommit({ id: uid(), kind: "mask", ...r, color });
        }
      }
    }
    setDraft(null);
  }

  function commitText() {
    if (!textPrompt) return;
    const text = textPrompt.value.trim();
    if (text) {
      onCommit({
        id: uid(),
        kind: "text",
        x: textPrompt.x,
        y: textPrompt.y,
        text,
        color,
        size: fontSize,
      });
    }
    setTextPrompt(null);
  }

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        className={cn(
          "block max-w-none origin-top-left shadow-2xl shadow-black/40",
          tool === "text" ? "cursor-text" : "cursor-crosshair",
        )}
        style={{
          width: bufferW * zoom,
          height: bufferH * zoom,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {textPrompt && (
        <input
          autoFocus
          value={textPrompt.value}
          placeholder="Texte + Entrée"
          onChange={(e) => setTextPrompt({ ...textPrompt, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText();
            if (e.key === "Escape") setTextPrompt(null);
          }}
          onBlur={commitText}
          className="absolute z-10 min-w-48 rounded-md border border-indigo-400 bg-[#12141c] px-2 py-1 text-sm text-white outline-none"
          style={{
            left: textPrompt.screenX,
            top: textPrompt.screenY,
            color,
            fontSize,
          }}
        />
      )}
    </div>
  );
}
