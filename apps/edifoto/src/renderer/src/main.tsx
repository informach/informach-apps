import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/base.css";
import "./styles/editor.css";
import "./styles/ai.css";
import "./styles/simple.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Development-only handle used by automated UI checks (see EDIFOTO_SNAPSHOT in the main process).
if (import.meta.env.DEV) {
  void Promise.all([
    import("./state/doc"),
    import("./state/ui"),
    import("./lib/ops"),
    import("./lib/files"),
    import("./lib/aiTools"),
    import("./lib/actions"),
    import("./engine/compositor"),
    import("./engine/bitmaps"),
    import("./lib/vector"),
    import("./lib/selection"),
    import("./lib/paint"),
    import("./lib/layout"),
    import("./lib/styles"),
  ]).then(([d, u, o, f, ai, a, c, b, v, s, paint, layout, styles]) => {
    (window as unknown as Record<string, unknown>).__edifoto = {
      useDoc: d.useDoc,
      useUi: u.useUi,
      ops: o,
      files: f,
      runAiTool: ai.runAiTool,
      actions: a.actions,
      compositor: c.compositor,
      bitmaps: b,
      vector: v,
      selection: s,
      paint,
      layout,
      styles,
    };
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
