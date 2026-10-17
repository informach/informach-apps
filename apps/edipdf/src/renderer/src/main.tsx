import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/textlayer.css";
import "./styles/viewer.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Development-only handle used by automated UI checks (see EDIPDF_SNAPSHOT in the main process).
if (import.meta.env.DEV) {
  void Promise.all([
    import("./lib/actions"),
    import("./lib/editing"),
    import("./state/store"),
  ]).then(([actions, editing, store]) => {
    (window as unknown as Record<string, unknown>).__edipdf = { actions, editing, store };
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
