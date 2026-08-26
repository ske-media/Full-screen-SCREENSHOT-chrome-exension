/** Canal interne des messages content-script ↔ service worker. */
export const FPC_CHANNEL = "fpc" as const;

export type PageMetrics = {
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
  scrollX: number;
  scrollY: number;
  error?: string;
};

export type ContentRequest =
  | { channel: typeof FPC_CHANNEL; type: "PREPARE" }
  | { channel: typeof FPC_CHANNEL; type: "SCROLL_TO"; y: number }
  | { channel: typeof FPC_CHANNEL; type: "HIDE_FIXED" }
  | { channel: typeof FPC_CHANNEL; type: "CLEANUP" };

export type CaptureProgress = {
  type: "CAPTURE_PROGRESS";
  current: number;
  total: number;
  message: string;
};

export type BackgroundMessage =
  | { type: "START_CAPTURE" }
  | { type: "GET_CAPTURE_STATUS" };

export type SliceRecord = {
  blob: Blob;
  y: number;
};

export type StitchMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  pageWidth: number;
  pageHeight: number;
};

export type StoredCapture = {
  id: string;
  /** Image assemblée (remplie par l'éditeur, ou par un stitch réussi). */
  blob?: Blob;
  /** Tranches brutes si l'assemblage n'a pas encore eu lieu. */
  slices?: SliceRecord[];
  metrics?: StitchMetrics;
  width: number;
  height: number;
  scaled: boolean;
  truncated: boolean;
  title: string;
  url: string;
  createdAt: number;
  error?: string;
};

export const MAX_CANVAS_DIM = 16384;
export const MAX_CANVAS_PIXELS = 40_000_000;
export const MAX_SLICES = 100;
