import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { EditorApp } from "./EditorApp";

const params = new URLSearchParams(window.location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EditorApp captureId={params.get("id")} demo={params.get("demo") === "1"} />
  </StrictMode>,
);
