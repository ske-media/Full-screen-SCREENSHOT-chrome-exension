export type Tool = "crop" | "pen" | "arrow" | "rect" | "mask" | "text";

export type Point = { x: number; y: number };

export type Annotation =
  | {
      id: string;
      kind: "pen";
      points: Point[];
      color: string;
      width: number;
    }
  | {
      id: string;
      kind: "arrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
    }
  | {
      id: string;
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      width: number;
    }
  | {
      id: string;
      kind: "mask";
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
    }
  | {
      id: string;
      kind: "text";
      x: number;
      y: number;
      text: string;
      color: string;
      size: number;
    };

export type CropRect = { x: number; y: number; w: number; h: number };

export const COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f8fafc",
  "#0f172a",
];
