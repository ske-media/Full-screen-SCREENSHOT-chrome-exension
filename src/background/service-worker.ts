/**
 * Service worker Manifest V3.
 * Reçoit la commande du popup, lance la capture, ouvre l'éditeur.
 */
import { captureFullPage } from "./capture-orchestrator";

let capturing = false;

type StartMessage = { type: "START_CAPTURE"; tabId?: number };
type StatusMessage = { type: "GET_CAPTURE_STATUS" };

chrome.runtime.onMessage.addListener(
  (message: StartMessage | StatusMessage, _sender, sendResponse) => {
    if (!message?.type) return;

    if (message.type === "GET_CAPTURE_STATUS") {
      sendResponse({ capturing });
      return;
    }

    if (message.type !== "START_CAPTURE") return;

    if (capturing) {
      sendResponse({ ok: false, error: "Une capture est déjà en cours." });
      return;
    }

    capturing = true;
    runCapture(message.tabId)
      .catch((err: unknown) => {
        const text = err instanceof Error ? err.message : String(err);
        void chrome.storage.local.set({ lastCaptureError: text });
        void notify({ type: "CAPTURE_ERROR", message: text });
        void openEditor({ error: text });
        void chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
        void chrome.action.setBadgeText({ text: "ERR" });
      })
      .finally(() => {
        capturing = false;
        setTimeout(() => {
          void chrome.action.setBadgeText({ text: "" });
        }, 4000);
      });

    sendResponse({ ok: true });
  },
);

async function runCapture(tabId?: number) {
  const tab = tabId ? await chrome.tabs.get(tabId) : await resolveTargetTab();
  if (!tab) {
    throw new Error("Aucun onglet actif à capturer.");
  }

  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  if (tab.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true });
  }

  await chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });

  const result = await captureFullPage(tab, ({ current, total, message }) => {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    void chrome.action.setBadgeText({ text: `${Math.min(99, pct)}` });
    void notify({
      type: "CAPTURE_PROGRESS",
      current,
      total,
      message,
    });
  });

  await notify({ type: "CAPTURE_DONE", captureId: result.id });
  await openEditor({ id: result.id });
}

function editorPageUrl(params: { id?: string; error?: string }) {
  const url = new URL(chrome.runtime.getURL("editor.html"));
  if (params.id) url.searchParams.set("id", params.id);
  if (params.error) url.searchParams.set("error", params.error);
  return url.toString();
}

async function openEditor(params: { id?: string; error?: string }) {
  await chrome.tabs.create({ url: editorPageUrl(params), active: true });
}

async function resolveTargetTab() {
  const [active] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (active && !active.url?.startsWith("chrome-extension://")) {
    return active;
  }
  const all = await chrome.tabs.query({ lastFocusedWindow: true });
  return all.find((t) => t.active && !t.url?.startsWith("chrome-extension://")) ?? active;
}

function notify(payload: Record<string, unknown>) {
  return chrome.runtime.sendMessage(payload).catch(() => {
    // Le popup est souvent fermé pendant la capture : ignorer.
  });
}
