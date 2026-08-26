/**
 * Orchestre la capture pleine page via executeScript (pas de content script
 * persistant : ça reste fiable après un rechargement de l'extension).
 */
import { saveCapture } from "../shared/idb";
import type { Slice } from "../shared/stitch";
import { MAX_SLICES } from "../shared/types";
import { isRestrictedUrl } from "../shared/urls";
import {
  injectCleanup,
  injectHideFixed,
  injectPrepare,
  injectScrollTo,
  type InjectedMetrics,
} from "./page-inject";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function runInPage<T>(
  tabId: number,
  func: () => T | Promise<T>,
): Promise<T> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
  });
  const first = results[0];
  if (!first) throw new Error("La page n'a pas répondu.");
  return first.result as T;
}

async function runInPageArg<A, T>(
  tabId: number,
  func: (arg: A) => T | Promise<T>,
  arg: A,
): Promise<T> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args: [arg],
  });
  const first = results[0];
  if (!first) throw new Error("La page n'a pas répondu.");
  return first.result as T;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Capture d'écran invalide.");
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function captureVisible(windowId: number): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(400 * attempt);
    try {
      const dataUrl = await withTimeout(
        chrome.tabs.captureVisibleTab(windowId, { format: "png" }),
        2500,
        "Délai dépassé pendant la photo de l'onglet.",
      );
      if (dataUrl && dataUrl.startsWith("data:")) return dataUrl;
      lastError = new Error("Capture vide.");
    } catch (err) {
      lastError = err;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "");
  throw new Error(
    detail
      ? `Impossible de photographier l'onglet (${detail}).`
      : "Impossible de photographier l'onglet.",
  );
}

export type CaptureProgressCb = (info: {
  current: number;
  total: number;
  message: string;
}) => void;

export async function captureFullPage(
  tab: chrome.tabs.Tab,
  onProgress: CaptureProgressCb,
) {
  if (tab.id === undefined || tab.windowId === undefined) {
    throw new Error("Onglet introuvable.");
  }
  const tabId = tab.id;
  const windowId = tab.windowId;
  const url = tab.url ?? "";

  if (!url || isRestrictedUrl(url)) {
    throw new Error(
      "Cette page ne peut pas être capturée (page système Chrome ou Web Store). Ouvrez un site http(s).",
    );
  }

  onProgress({ current: 0, total: 1, message: "Préparation de la page…" });

  const metrics = await runInPage<InjectedMetrics>(tabId, injectPrepare);
  const slices: Slice[] = [];
  let truncated = false;

  try {
    let y = 0;
    let pageHeight = metrics.pageHeight;
    const viewportHeight = metrics.viewportHeight;
    let index = 0;
    let fixedHidden = false;

    if (viewportHeight <= 0) {
      throw new Error("Hauteur de viewport invalide.");
    }

    try {
      while (index < MAX_SLICES) {
        const estimatedTotal = Math.max(
          1,
          Math.ceil(pageHeight / viewportHeight),
          index + 1,
        );
        onProgress({
          current: index + 1,
          total: estimatedTotal,
          message: `Capture de la section ${index + 1}…`,
        });

        const scrolled = await runInPageArg(tabId, injectScrollTo, y);
        if (scrolled.pageHeight) pageHeight = scrolled.pageHeight;

        if (index > 0 && !fixedHidden) {
          await runInPage(tabId, injectHideFixed);
          fixedHidden = true;
        }

        const dataUrl = await captureVisible(windowId);
        slices.push({ blob: dataUrlToBlob(dataUrl), y });
        index += 1;

        if (y + viewportHeight >= pageHeight - 1) break;

        const nextY = y + viewportHeight;
        if (nextY + viewportHeight > pageHeight) {
          const bottomY = Math.max(0, pageHeight - viewportHeight);
          if (bottomY > y) {
            y = bottomY;
            continue;
          }
          break;
        }
        y = nextY;
      }
    } catch (err) {
      if (slices.length === 0) throw err;
      truncated = true;
    }

    if (index >= MAX_SLICES && y + viewportHeight < pageHeight - 1) {
      truncated = true;
    }

    if (slices.length === 0) {
      throw new Error("Aucune capture n'a pu être enregistrée.");
    }

    onProgress({
      current: slices.length,
      total: slices.length,
      message: "Ouverture de l'éditeur…",
    });

    const id = await saveCapture({
      slices,
      metrics: {
        viewportWidth: metrics.viewportWidth,
        viewportHeight,
        pageWidth: metrics.pageWidth,
        pageHeight,
      },
      width: 0,
      height: 0,
      scaled: false,
      truncated,
      title: tab.title || "capture",
      url,
    });

    return { id, truncated, sliceCount: slices.length };
  } finally {
    try {
      await runInPage(tabId, injectCleanup);
    } catch {
      // La page a pu naviguer pendant la capture.
    }
  }
}
