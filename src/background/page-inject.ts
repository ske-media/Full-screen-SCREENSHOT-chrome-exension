/**
 * Fonctions injectées via chrome.scripting.executeScript.
 * Elles sont sérialisées par Chrome : aucune fermeture, tout le code
 * utile doit vivre dans le corps de la fonction.
 */

export type InjectedMetrics = {
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
  scrollX: number;
  scrollY: number;
};

export async function injectPrepare(): Promise<InjectedMetrics> {
  const STYLE_ID = "__fpc_style_v3";
  const STATE_KEY = "__fpc_state_v3";

  type Saved = { el: HTMLElement; visibility: string };
  type State = {
    scrollX: number;
    scrollY: number;
    scrollBehavior: string;
    htmlOverflow: string;
    bodyOverflow: string;
    fixed: Saved[];
  };

  const w = window as unknown as Record<string, State>;
  w[STATE_KEY] = {
    scrollX: window.scrollX,
    scrollY: window.scrollY || document.documentElement.scrollTop || 0,
    scrollBehavior: document.documentElement.style.scrollBehavior,
    htmlOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body?.style.overflow ?? "",
    fixed: [],
  };

  document.documentElement.style.scrollBehavior = "auto";

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}" +
      "html,body{scrollbar-width:none!important;-ms-overflow-style:none!important}";
    document.documentElement.appendChild(style);
  }

  const saved: Saved[] = [];
  for (const node of document.querySelectorAll("body *")) {
    if (!(node instanceof HTMLElement) || node.id === STYLE_ID) continue;
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") {
      saved.push({ el: node, visibility: node.style.visibility });
    }
  }
  w[STATE_KEY].fixed = saved;

  window.scrollTo(0, 0);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, 250));
    });
  });

  const html = document.documentElement;
  const body = document.body;
  return {
    pageWidth: Math.max(html.scrollWidth, body?.scrollWidth ?? 0, html.clientWidth),
    pageHeight: Math.max(html.scrollHeight, body?.scrollHeight ?? 0, html.clientHeight),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY || html.scrollTop || 0,
  };
}

export async function injectScrollTo(y: number): Promise<InjectedMetrics> {
  document.documentElement.style.scrollBehavior = "auto";
  window.scrollTo(0, y);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, 250));
    });
  });
  const html = document.documentElement;
  const body = document.body;
  return {
    pageWidth: Math.max(html.scrollWidth, body?.scrollWidth ?? 0, html.clientWidth),
    pageHeight: Math.max(html.scrollHeight, body?.scrollHeight ?? 0, html.clientHeight),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY || html.scrollTop || 0,
  };
}

export async function injectHideFixed(): Promise<void> {
  const STATE_KEY = "__fpc_state_v3";
  const w = window as unknown as Record<string, { fixed?: { el: HTMLElement }[] }>;
  const fixed = w[STATE_KEY]?.fixed ?? [];
  for (const item of fixed) {
    item.el.style.setProperty("visibility", "hidden", "important");
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
}

export function injectCleanup(): void {
  const STYLE_ID = "__fpc_style_v3";
  const STATE_KEY = "__fpc_state_v3";
  type State = {
    scrollX: number;
    scrollY: number;
    scrollBehavior: string;
    htmlOverflow: string;
    bodyOverflow: string;
    fixed: { el: HTMLElement; visibility: string }[];
  };
  const w = window as unknown as Record<string, State | undefined>;
  const state = w[STATE_KEY];
  if (state) {
    for (const item of state.fixed) {
      if (item.visibility) item.el.style.visibility = item.visibility;
      else item.el.style.removeProperty("visibility");
    }
    document.documentElement.style.scrollBehavior = state.scrollBehavior;
    document.documentElement.style.overflow = state.htmlOverflow;
    if (document.body) document.body.style.overflow = state.bodyOverflow;
    window.scrollTo(state.scrollX, state.scrollY);
    w[STATE_KEY] = undefined;
  }
  document.getElementById(STYLE_ID)?.remove();
}
