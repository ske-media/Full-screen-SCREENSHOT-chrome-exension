/**
 * Content script injecté dans l'onglet actif.
 *
 * Rôle : scroller la page, masquer les barres de défilement et les éléments
 * fixed/sticky (après la première tranche) pour éviter qu'ils se répètent
 * dans l'image assemblée, puis restaurer l'état d'origine.
 *
 * Fichier volontairement autonome (aucune import runtime) : bundlé en IIFE.
 */

type SavedStyle = {
  el: HTMLElement;
  visibility: string;
};

type CaptureState = {
  originalScrollX: number;
  originalScrollY: number;
  originalScrollBehavior: string;
  originalHtmlOverflow: string;
  originalBodyOverflow: string;
  fixedEls: SavedStyle[];
  scroller: Element | null;
};

const STYLE_ID = "__fpc_capture_style";
const STATE_KEY = "__fpcCaptureState";
const LISTENER_KEY = "__fpcListenerInstalled";
const CHANNEL = "fpc";

type ContentWindow = Window &
  Record<typeof STATE_KEY, CaptureState | undefined> &
  Record<typeof LISTENER_KEY, boolean | undefined>;

const w = window as unknown as ContentWindow;

function getState(): CaptureState {
  if (!w[STATE_KEY]) {
    w[STATE_KEY] = {
      originalScrollX: 0,
      originalScrollY: 0,
      originalScrollBehavior: "",
      originalHtmlOverflow: "",
      originalBodyOverflow: "",
      fixedEls: [],
      scroller: null,
    };
  }
  return w[STATE_KEY];
}

/** Identifie le conteneur qui scrolle réellement (html/body ou layout SPA). */
function findScroller(): Element {
  const scrolling = document.scrollingElement ?? document.documentElement;
  if (scrolling.scrollHeight > scrolling.clientHeight + 8) {
    return scrolling;
  }

  const candidates = document.querySelectorAll("html, body, #root, #__next, #app, main");
  let best: Element = scrolling;
  let bestDelta = scrolling.scrollHeight - scrolling.clientHeight;
  for (const el of candidates) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    const canScroll =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    const delta = el.scrollHeight - el.clientHeight;
    if ((canScroll || el === document.body || el === document.documentElement) && delta > bestDelta) {
      best = el;
      bestDelta = delta;
    }
  }
  return best;
}

function getPageMetrics() {
  const scroller = getState().scroller ?? findScroller();
  const html = document.documentElement;
  const body = document.body;
  const pageWidth = Math.max(
    html.scrollWidth,
    body?.scrollWidth ?? 0,
    scroller.scrollWidth,
    html.clientWidth,
  );
  const pageHeight = Math.max(
    html.scrollHeight,
    body?.scrollHeight ?? 0,
    scroller.scrollHeight,
    html.clientHeight,
  );
  return {
    pageWidth,
    pageHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: getScrollY(),
  };
}

function getScrollY(): number {
  const scroller = getState().scroller;
  if (
    scroller &&
    scroller !== document.documentElement &&
    scroller !== document.body &&
    scroller !== document.scrollingElement
  ) {
    return (scroller as HTMLElement).scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function scrollToY(y: number) {
  const scroller = getState().scroller ?? findScroller();
  if (
    scroller !== document.documentElement &&
    scroller !== document.body &&
    scroller !== document.scrollingElement
  ) {
    (scroller as HTMLElement).scrollTop = y;
    return;
  }
  window.scrollTo(0, y);
}

function hideScrollbars() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; }
    *, *::before, *::after { scroll-behavior: auto !important; }
  `;
  document.documentElement.appendChild(style);
}

function collectFixedElements(): SavedStyle[] {
  const saved: SavedStyle[] = [];
  const nodes = document.querySelectorAll("body *");
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.id === STYLE_ID) continue;
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") {
      saved.push({ el: node, visibility: node.style.visibility });
    }
  }
  return saved;
}

function waitForPaint(ms: number): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, ms);
      });
    });
  });
}

async function handleMessage(
  msg: { channel?: string; type?: string; y?: number },
): Promise<unknown> {
  if (!msg || msg.channel !== CHANNEL) return undefined;
  const state = getState();

  switch (msg.type) {
    case "PREPARE": {
      state.originalScrollX = window.scrollX;
      state.originalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      state.originalScrollBehavior = document.documentElement.style.scrollBehavior;
      state.originalHtmlOverflow = document.documentElement.style.overflow;
      state.originalBodyOverflow = document.body?.style.overflow ?? "";
      document.documentElement.style.scrollBehavior = "auto";
      hideScrollbars();
      state.scroller = findScroller();
      state.fixedEls = collectFixedElements();
      scrollToY(0);
      await waitForPaint(220);
      return getPageMetrics();
    }
    case "SCROLL_TO": {
      scrollToY(msg.y ?? 0);
      await waitForPaint(280);
      return getPageMetrics();
    }
    case "HIDE_FIXED": {
      for (const item of state.fixedEls) {
        item.el.style.setProperty("visibility", "hidden", "important");
      }
      await waitForPaint(60);
      return { ok: true };
    }
    case "CLEANUP": {
      for (const item of state.fixedEls) {
        if (item.visibility) {
          item.el.style.visibility = item.visibility;
        } else {
          item.el.style.removeProperty("visibility");
        }
      }
      document.getElementById(STYLE_ID)?.remove();
      document.documentElement.style.scrollBehavior = state.originalScrollBehavior;
      document.documentElement.style.overflow = state.originalHtmlOverflow;
      if (document.body) {
        document.body.style.overflow = state.originalBodyOverflow;
      }
      window.scrollTo(state.originalScrollX, state.originalScrollY);
      if (
        state.scroller &&
        state.scroller !== document.documentElement &&
        state.scroller !== document.body
      ) {
        (state.scroller as HTMLElement).scrollTop = state.originalScrollY;
      }
      state.fixedEls = [];
      return { ok: true };
    }
    default:
      return undefined;
  }
}

if (!w[LISTENER_KEY]) {
  w[LISTENER_KEY] = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.channel !== CHANNEL) return;
    handleMessage(msg)
      .then((result) => sendResponse(result))
      .catch((err: unknown) =>
        sendResponse({ error: err instanceof Error ? err.message : String(err) }),
      );
    return true;
  });
}
