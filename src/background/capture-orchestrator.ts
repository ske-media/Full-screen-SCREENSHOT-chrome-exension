/**
 * Orchestre la capture pleine page :
 * 1. injecte le content script
 * 2. prépare le DOM (scroll en haut, masquage scrollbars)
 * 3. capture chaque viewport via chrome.tabs.captureVisibleTab
 * 4. masque header/footer fixed après la 1re tranche
 * 5. enregistre les tranches dans IndexedDB (l'éditeur fait le stitch)
 */
import { saveCapture } from "../shared/idb";
import type { Slice } from "../shared/stitch";
import { FPC_CHANNEL, MAX_SLICES, type ContentRequest, type PageMetrics } from "../shared/types";
import { isRestrictedUrl } from "../shared/urls";

async function sendToTab<T>(tabId: number, message: ContentRequest): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return (await chrome.tabs.sendMessage(tabId, message)) as T;
    } catch (err) {
      lastError = err;
      await delay(150);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Le script de capture n'a pas pu communiquer avec la page.");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** data: URLs : fetch() est parfois bloqué dans un service worker. */
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

async function captureVisible(windowId: number, tabId: number): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      if (attempt > 0) await delay(350 * attempt);
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      if (dataUrl && dataUrl.startsWith("data:")) return dataUrl;
      lastError = new Error("Capture vide.");
    } catch (err) {
      lastError = err;
      try {
        const fallbackWin = await chrome.windows.getLastFocused();
        if (fallbackWin.id !== undefined && fallbackWin.id !== windowId) {
          const fallback = await chrome.tabs.captureVisibleTab(fallbackWin.id, {
            format: "png",
          });
          if (fallback && fallback.startsWith("data:")) return fallback;
        }
      } catch (fallbackErr) {
        lastError = fallbackErr;
      }
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
      "Cette page ne peut pas être capturée (page système Chrome ou Web Store).",
    );
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });

  const metrics = await sendToTab<PageMetrics>(tabId, {
    channel: FPC_CHANNEL,
    type: "PREPARE",
  });
  if (metrics.error) {
    throw new Error(metrics.error);
  }

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

        await chrome.tabs.update(tabId, { active: true });
        const scrolled = await sendToTab<PageMetrics>(tabId, {
          channel: FPC_CHANNEL,
          type: "SCROLL_TO",
          y,
        });
        if (scrolled.pageHeight) {
          pageHeight = scrolled.pageHeight;
        }

        if (index > 0 && !fixedHidden) {
          await sendToTab(tabId, { channel: FPC_CHANNEL, type: "HIDE_FIXED" });
          fixedHidden = true;
        }

        const dataUrl = await captureVisible(windowId, tabId);
        slices.push({ blob: dataUrlToBlob(dataUrl), y });
        index += 1;

        if (y + viewportHeight >= pageHeight - 1) {
          break;
        }

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
      await sendToTab(tabId, { channel: FPC_CHANNEL, type: "CLEANUP" });
    } catch {
      // La page a pu naviguer pendant la capture.
    }
  }
}
