import "./zodConfig";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/editor.css";
import "./styles/timeline.css";
import "./styles/dialog.css";
import "./styles/transcript.css";
import "./styles/ai.css";
import "./styles/visual.css";
import "./styles/script.css";
import "./styles/review.css";
import "./styles/recorder.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadBundledFonts } from "./lib/fonts";
import { startKeying } from "./lib/keying";
import { usePalettes } from "./lib/palettes";
import { RecorderOverlay } from "./recorder/RecorderOverlay";

if (location.hash !== "#recorder") {
  startKeying();
  // Bundled fonts (annotations, templates, captions) are registered up front so the preview has them.
  void loadBundledFonts();
  void usePalettes.getState().load();
}

// Development-only handle used by automated UI checks (see EDIAULA_SNAPSHOT in the main process).
if (import.meta.env.DEV) {
  void Promise.all([
    import("./lib/actions"),
    import("./lib/importMedia"),
    import("./state/project"),
    import("./state/app"),
    import("./state/playback"),
    import("@shared/cleanup"),
    import("./state/assistant"),
  ]).then(([a, i, p, s, pb, cl, as]) => {
    (window as unknown as Record<string, unknown>).__ediaula = {
      actions: a.actions,
      importMedia: i.importMedia,
      useProject: p.useProject,
      useApp: s.useApp,
      playback: pb.playback,
      usePlayback: pb.usePlayback,
      cleanup: cl,
      useAssistant: as.useAssistant,
    };
  });
}

// The recorder overlay is the same app loaded with #recorder in its own transparent window.
const isRecorder = location.hash === "#recorder";
createRoot(document.getElementById("root")!).render(
  <StrictMode>{isRecorder ? <RecorderOverlay /> : <App />}</StrictMode>,
);
