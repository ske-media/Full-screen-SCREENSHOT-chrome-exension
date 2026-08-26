import { Camera, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { isRestrictedUrl } from "../shared/urls";

type Phase = "idle" | "running" | "error" | "done";

const isExtension = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);

export function Popup() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState(
    "Cliquez, ne changez pas d’onglet : la page défile puis l’éditeur s’ouvre.",
  );
  const [tabLabel, setTabLabel] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    if (!isExtension) return;

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab) return;
      setTabLabel(tab.title ?? tab.url ?? null);
      if (tab.url && isRestrictedUrl(tab.url)) {
        setRestricted(true);
        setMessage("Ouvrez un site web (http/https), pas une page chrome://.");
      }
    });
  }, []);

  async function startCapture() {
    if (!isExtension) {
      setPhase("error");
      setMessage(
        "Chargez le dossier décompressé via chrome://extensions → Mode développeur → Charger l’extension non empaquetée.",
      );
      return;
    }
    if (restricted) {
      setPhase("error");
      setMessage("Ouvrez un site web (http/https), pas une page chrome://.");
      return;
    }

    setPhase("running");
    setMessage("Démarrage de la capture…");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const res = await chrome.runtime.sendMessage({
        type: "START_CAPTURE",
        tabId: tab?.id,
      });
      if (res && res.ok === false) {
        setPhase("error");
        setMessage(res.error ?? "Impossible de démarrer la capture.");
        return;
      }
      window.close();
    } catch (err) {
      setPhase("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Le service worker ne répond pas. Sur chrome://extensions, cliquez sur Recharger.",
      );
    }
  }

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
        disabled={phase === "running"}
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
