import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EditorApp } from "../editor/EditorApp";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EditorApp
      demo
      banner="Aperçu de l’éditeur avec une image de démonstration. Pour capturer une vraie page, chargez le dossier dist/ comme extension Chrome."
    />
  </StrictMode>,
);
