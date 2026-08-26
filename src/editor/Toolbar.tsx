import {
  ArrowUpRight,
  Crop,
  Download,
  Highlighter,
  Minus,
  Pencil,
  Plus,
  Redo2,
  Square,
  Type,
  Undo2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/cn";
import { COLORS, type Tool } from "./types";

const TOOLS: { id: Tool; label: string; icon: typeof Pencil }[] = [
  { id: "crop", label: "Recadrer", icon: Crop },
  { id: "pen", label: "Dessiner", icon: Pencil },
  { id: "arrow", label: "Flèche", icon: ArrowUpRight },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "mask", label: "Masquer", icon: Highlighter },
  { id: "text", label: "Texte", icon: Type },
];

type ToolbarProps = {
  tool: Tool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  exporting: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onStrokeWidth: (n: number) => void;
  onFontSize: (n: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoom: (n: number) => void;
  onExport: (format: "png" | "jpg" | "pdf") => void;
};

export function Toolbar({
  tool,
  color,
  strokeWidth,
  fontSize,
  zoom,
  canUndo,
  canRedo,
  exporting,
  onTool,
  onColor,
  onStrokeWidth,
  onFontSize,
  onUndo,
  onRedo,
  onZoom,
  onExport,
}: ToolbarProps) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-[#12141c] px-3 py-2">
      <div className="mr-2 hidden items-center gap-2 sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-xs font-bold">
          FP
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Full Page Capture</p>
          <p className="text-[11px] text-zinc-500">Éditeur</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white/4 p-1">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            size="icon"
            variant={tool === id ? "toolActive" : "tool"}
            title={label}
            aria-label={label}
            aria-pressed={tool === id}
            onClick={() => onTool(id)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1 rounded-xl bg-white/4 px-2 py-1">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onColor(c)}
            className={cn(
              "h-6 w-6 rounded-full border border-white/20",
              color === c && "ring-2 ring-white ring-offset-1 ring-offset-[#12141c]",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {tool === "text" ? (
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Taille
          <input
            type="range"
            min={16}
            max={72}
            value={fontSize}
            onChange={(e) => onFontSize(Number(e.target.value))}
            className="w-24 accent-indigo-500"
          />
        </label>
      ) : (
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Trait
          <input
            type="range"
            min={2}
            max={18}
            value={strokeWidth}
            onChange={(e) => onStrokeWidth(Number(e.target.value))}
            className="w-24 accent-indigo-500"
          />
        </label>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button size="icon" variant="ghost" title="Annuler" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" title="Rétablir" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="mx-1 flex items-center gap-1 rounded-lg bg-white/4 px-1">
          <Button
            size="icon"
            variant="ghost"
            title="Zoom −"
            onClick={() => onZoom(Math.max(0.25, zoom - 0.1))}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-zinc-400">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            title="Zoom +"
            onClick={() => onZoom(Math.min(3, zoom + 0.1))}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <details className="group">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-500 [&::-webkit-details-marker]:hidden">
              <Download className="h-4 w-4" />
              {exporting ? "Export…" : "Exporter"}
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-white/10 bg-[#1a1d27] py-1 shadow-xl">
              {(["png", "jpg", "pdf"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  disabled={exporting}
                  onClick={() => onExport(format)}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/8"
                >
                  Télécharger {format.toUpperCase()}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
