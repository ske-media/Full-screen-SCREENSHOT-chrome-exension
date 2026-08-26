/**
 * Orchestre la capture pleine page :
 * 1. injecte le content script
 * 2. prépare le DOM (scroll en haut, masquage scrollbars)
 * 3. capture chaque viewport via chrome.tabs.captureVisibleTab
 * 4. masque header/footer fixed après la 1re tranche
 * 5. assemble les PNG, stocke le résultat dans IndexedDB
 */
import { saveCapture } from "../shared/idb";
import { stitchSlices, type Slice } from "../shared/stitch";
import { FPC_CHANNEL, MAX_SLICES, type ContentRequest, type PageMetrics } from "../shared/types";
import { isRestrictedUrl } from "../shared/urls";

async function sendToTab<T>(tabId: number, message: ContentRequest): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return (await chrome.tabs.sendMessage(tabId, message)) as T;
    } catch (err) {
      lastError = err;
      await delay(120);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Le script de capture n'a pas pu communiquer avec la page.");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

      const scrolled = await sendToTab<PageMetrics>(tabId, {
        channel: FPC_CHANNEL,
        type: "SCROLL_TO",
        y,
      });
      if (scrolled.pageHeight) {
        pageHeight = scrolled.pageHeight;
      }

      // Les éléments sticky/fixed ne doivent apparaître que sur la 1re tranche.
      if (index > 0 && !fixedHidden) {
        await sendToTab(tabId, { channel: FPC_CHANNEL, type: "HIDE_FIXED" });
        fixedHidden = true;
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "png",
      });
      const blob = await (await fetch(dataUrl)).blob();
      slices.push({ blob, y });
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

    if (index >= MAX_SLICES && y + viewportHeight < pageHeight - 1) {
      truncated = true;
    }

    onProgress({
      current: slices.length,
      total: slices.length,
      message: "Assemblage de l'image…",
    });

    const stitched = await stitchSlices(slices, {
      viewportWidth: metrics.viewportWidth,
      viewportHeight,
      pageWidth: metrics.pageWidth,
      pageHeight,
    });

    const id = await saveCapture({
      blob: stitched.blob,
      width: stitched.width,
      height: stitched.height,
      scaled: stitched.scaled,
      truncated,
      title: tab.title || "capture",
      url,
    });

    return {
      id,
      width: stitched.width,
      height: stitched.height,
      scaled: stitched.scaled,
      truncated,
    };
  } finally {
    try {
      await sendToTab(tabId, { channel: FPC_CHANNEL, type: "CLEANUP" });
    } catch {
      // La page a pu naviguer pendant la capture.
    }
  }
}
