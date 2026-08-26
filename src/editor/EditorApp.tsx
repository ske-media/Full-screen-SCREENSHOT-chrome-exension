import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "../components/ui/button";
import { getCapture, getLatestCapture } from "../shared/idb";
import { createDemoImage } from "./demo-image";
import { cropImage, translateAnnotations } from "./draw";
import { EditorCanvas } from "./EditorCanvas";
import { exportJpg, exportPdf, exportPng, slugifyFilename } from "./export";
import { Toolbar } from "./Toolbar";
import type { Annotation, CropRect, Tool } from "./types";

type Props = {
  captureId?: string | null;
  demo?: boolean;
  banner?: string | null;
};

export function EditorApp({ captureId, demo = false, banner = null }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [meta, setMeta] = useState<{
    title: string;
    scaled: boolean;
    truncated: boolean;
    width: number;
    height: number;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fontSize, setFontSize] = useState(28);
  const [zoom, setZoom] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [past, setPast] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setStatus("loading");
        if (demo && !captureId) {
          const img = await createDemoImage();
          if (cancelled) return;
          setImage(img);
          setMeta({
            title: "demonstration",
            scaled: false,
            truncated: false,
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
          setStatus("ready");
          return;
        }

        const id = captureId;
        const record = id ? await getCapture(id) : await getLatestCapture();
        if (cancelled) return;
        if (!record) {
          setStatus("empty");
          return;
        }
        const img = await blobToImage(record.blob);
        if (cancelled) return;
        setImage(img);
        setMeta({
          title: record.title,
          scaled: record.scaled,
          truncated: record.truncated,
          width: record.width,
          height: record.height,
        });
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [captureId, demo]);

  const filename = useMemo(
    () => slugifyFilename(meta?.title ?? "capture"),
    [meta?.title],
  );

  const commit = useCallback((item: Annotation) => {
    setPast((p) => [...p, annotations]);
    setFuture([]);
    setAnnotations((a) => [...a, item]);
  }, [annotations]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [annotations, ...f]);
      setAnnotations(prev);
      return p.slice(0, -1);
    });
  }, [annotations]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const [next, ...rest] = f;
      setPast((p) => [...p, annotations]);
      setAnnotations(next);
      return rest;
    });
  }, [annotations]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const metaKey = e.metaKey || e.ctrlKey;
      if (metaKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  async function applyCrop() {
    if (!image || !crop) return;
    const cropped = await cropImage(image, crop);
    setImage(cropped);
    setAnnotations(
      translateAnnotations(annotations, -crop.x, -crop.y, {
        w: crop.w,
        h: crop.h,
      }),
    );
    setPast([]);
    setFuture([]);
    setCrop(null);
    setNotice("Recadrage appliqué.");
  }

  async function onExport(format: "png" | "jpg" | "pdf") {
    if (!image) return;
    setExporting(true);
    setNotice(null);
    try {
      if (format === "png") await exportPng(image, annotations, filename);
      else if (format === "jpg") await exportJpg(image, annotations, filename);
      else await exportPdf(image, annotations, filename);
      setNotice(`Export ${format.toUpperCase()} lancé.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-[#0c0e14] text-zinc-100">
      {banner && (
        <div className="border-b border-indigo-500/30 bg-indigo-950/60 px-4 py-2 text-center text-sm text-indigo-100">
          {banner}{" "}
          <a href="./popup.html" className="underline decoration-indigo-400 underline-offset-2">
            Voir le popup
          </a>
        </div>
      )}

      <Toolbar
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        fontSize={fontSize}
        zoom={zoom}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        exporting={exporting}
        onTool={(t) => {
          setTool(t);
          if (t !== "crop") setCrop(null);
        }}
        onColor={setColor}
        onStrokeWidth={setStrokeWidth}
        onFontSize={setFontSize}
        onUndo={undo}
        onRedo={redo}
        onZoom={setZoom}
        onExport={onExport}
      />

      {meta?.scaled || meta?.truncated ? (
        <div className="border-b border-amber-500/20 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-200">
          {meta.truncated
            ? "La page était trop longue : la capture a été tronquée après 100 sections."
            : `Image réduite pour respecter la limite canvas (${meta.width}×${meta.height} px).`}
        </div>
      ) : null}

      {tool === "crop" && crop && (
        <div className="flex items-center justify-center gap-2 border-b border-white/8 bg-[#12141c] px-4 py-2">
          <p className="text-xs text-zinc-400">
            Zone {Math.round(crop.w)} × {Math.round(crop.h)} px
          </p>
          <Button size="sm" onClick={() => void applyCrop()}>
            Appliquer le recadrage
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCrop(null)}>
            Annuler
          </Button>
        </div>
      )}

      {notice && (
        <div className="border-b border-white/8 bg-white/4 px-4 py-1.5 text-center text-xs text-zinc-300">
          {notice}
        </div>
      )}

      <main className="checkerboard relative min-h-0 flex-1 overflow-auto">
        {status === "loading" && (
          <Centered>
            <Spinner />
            <p className="mt-3 text-sm text-zinc-400">Chargement de la capture…</p>
          </Centered>
        )}
        {status === "error" && (
          <Centered>
            <p className="text-sm text-red-300">{error}</p>
          </Centered>
        )}
        {status === "empty" && (
          <Centered>
            <p className="max-w-md text-center text-sm text-zinc-400">
              Aucune capture disponible. Cliquez sur l’icône de l’extension puis sur
              « Capturer la page entière ».
            </p>
          </Centered>
        )}
        {status === "ready" && image && (
          <div className="flex min-h-full justify-center p-6">
            <EditorCanvas
              image={image}
              annotations={annotations}
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
              fontSize={fontSize}
              zoom={zoom}
              crop={crop}
              onCropChange={setCrop}
              onCommit={commit}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
  );
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire l'image capturée."));
    };
    img.src = url;
  });
}
