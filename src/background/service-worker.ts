/**
 * Service worker Manifest V3.
 * Le canal onMessage reste ouvert (return true) jusqu'à la fin de la capture
 * pour empêcher Chrome de tuer le worker dès que le popup se ferme.
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
    void chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
    void chrome.action.setBadgeText({ text: "…" });

    runCapture(message.tabId)
      .then((captureId) => {
        sendResponse({ ok: true, captureId });
      })
      .catch((err: unknown) => {
        const text = err instanceof Error ? err.message : String(err);
        void chrome.storage.local.set({ lastCaptureError: text });
        void chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
        void chrome.action.setBadgeText({ text: "ERR" });
        void openEditor({ error: text });
        sendResponse({ ok: false, error: text });
      })
      .finally(() => {
        capturing = false;
        setTimeout(() => {
          void chrome.action.setBadgeText({ text: "" });
        }, 4000);
      });

    return true;
  },
);

async function runCapture(tabId?: number) {
  const tab = tabId ? await chrome.tabs.get(tabId) : await resolveTargetTab();
  if (!tab?.id) {
    throw new Error("Aucun onglet actif à capturer.");
  }

  const result = await captureFullPage(tab, ({ current, total, message }) => {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    void chrome.action.setBadgeText({ text: `${Math.min(99, pct)}` });
    void chrome.runtime
      .sendMessage({
        type: "CAPTURE_PROGRESS",
        current,
        total,
        message,
      })
      .catch(() => undefined);
  });

  await openEditor({ id: result.id });
  return result.id;
}

function editorPageUrl(params: { id?: string; error?: string }) {
  const base = chrome.runtime.getURL("editor.html");
  const url = new URL(base);
  if (params.id) url.searchParams.set("id", params.id);
  if (params.error) url.searchParams.set("error", params.error);
  return url.href;
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
