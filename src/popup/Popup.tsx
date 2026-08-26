import { Camera, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { isRestrictedUrl } from "../shared/urls";

type Phase = "idle" | "running" | "error" | "done";

const isExtension = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);

export function Popup() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("L’onglet actif sera parcouru de haut en bas, puis l’éditeur s’ouvrira.");
  const [progress, setProgress] = useState({ current: 0, total: 1 });
  const [tabLabel, setTabLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isExtension) return;

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab) return;
      setTabLabel(tab.title ?? tab.url ?? null);
      if (tab.url && isRestrictedUrl(tab.url)) {
        setPhase("error");
        setMessage("Cette page système ne peut pas être capturée.");
      }
    });

    const listener = (msg: {
      type?: string;
      current?: number;
      total?: number;
      message?: string;
    }) => {
      if (msg.type === "CAPTURE_PROGRESS") {
        setPhase("running");
        setProgress({ current: msg.current ?? 0, total: msg.total ?? 1 });
        if (msg.message) setMessage(msg.message);
      }
      if (msg.type === "CAPTURE_DONE") {
        setPhase("done");
        setMessage("Capture assemblée. Ouverture de l’éditeur…");
        window.close();
      }
      if (msg.type === "CAPTURE_ERROR") {
        setPhase("error");
        setMessage(msg.message ?? "La capture a échoué.");
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATUS" }).then((res) => {
      if (res?.capturing) {
        setPhase("running");
        setMessage("Capture en cours…");
      }
    }).catch(() => undefined);

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function startCapture() {
    if (!isExtension) {
      setPhase("error");
      setMessage(
        "Le popup fonctionne dans Chrome une fois l’extension chargée (chrome://extensions → Mode développeur → Charger l’extension non empaquetée).",
      );
      return;
    }
    setPhase("running");
    setMessage("Préparation de la page…");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const res = await chrome.runtime.sendMessage({
        type: "START_CAPTURE",
        tabId: tab?.id,
      });
      if (res && res.ok === false) {
        setPhase("error");
        setMessage(res.error ?? "Impossible de démarrer la capture.");
      }
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const ratio =
    progress.total > 0 ? Math.min(1, progress.current / progress.total) : 0;

  return (
    <div className="popup-root bg-[#0c0e14] p-4 text-zinc-100">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600">
          <Camera className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">Full Page Capture</h1>
          <p className="text-xs text-zinc-400">Capture intégrale · annotation · export</p>
        </div>
      </div>

      {tabLabel && (
        <p className="mb-3 truncate rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-zinc-400" title={tabLabel}>
          {tabLabel}
        </p>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={phase === "running" || (phase === "error" && message.includes("système"))}
        onClick={() => void startCapture()}
      >
        {phase === "running" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Capture en cours…
          </>
        ) : (
          "Capturer la page entière"
        )}
      </Button>

      {phase === "running" && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-zinc-500">
            {progress.current}/{progress.total || "?"} · Ne changez pas d’onglet
          </p>
        </div>
      )}

      <p
        className={
          phase === "error"
            ? "mt-3 text-xs leading-relaxed text-red-300"
            : "mt-3 text-xs leading-relaxed text-zinc-500"
        }
      >
        {message}
      </p>
    </div>
  );
}
