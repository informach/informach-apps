import type { RecentDoc } from "@shared/types";
import { ClipboardPaste, FolderOpen, ImagePlus, Settings, Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { clearBitmaps } from "@/engine/bitmaps";
import { actions, attempt } from "@/lib/actions";
import { openPath, pasteImage } from "@/lib/files";
import { blankDoc } from "@/lib/ops";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";

const PRESETS = [
  { label: "Post quadrado", w: 1080, h: 1080 },
  { label: "Post retrato", w: 1080, h: 1350 },
  { label: "Stories / Reels", w: 1080, h: 1920 },
  { label: "Thumbnail", w: 1280, h: 720 },
  { label: "Full HD", w: 1920, h: 1080 },
  { label: "A4 300 dpi", w: 2480, h: 3508 },
];

const when = (t: number): string => {
  const d = Math.round((Date.now() - t) / 86400000);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
};

export function Home(): ReactNode {
  const [recent, setRecent] = useState<RecentDoc[]>([]);
  const [over, setOver] = useState(false);

  useEffect(() => {
    void window.api.recentDocs().then(setRecent);
    const onPaste = (e: ClipboardEvent): void => {
      if (!useUi.getState().newDocumentOpen) attempt(() => pasteImage(e));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const newBlank = (w: number, h: number, label: string): void => {
    clearBitmaps();
    useDoc.getState().load(blankDoc(w, h, label, "#ffffff"));
    useUi.setState((s) => ({ fitRequest: s.fitRequest + 1, tool: "brush" }));
  };

  return (
    <div className="home">
      <div className="topbar">
        <div className="brand">
          <div className="logo" />
          EdiFoto
        </div>
        <span className="spacer" />
        <button type="button" className="btn" onClick={actions.newDocument}>
          Novo… <span className="kbd">Ctrl+N</span>
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => useUi.setState({ settingsOpen: true })}
        >
          <Sparkles size={14} className="accent" /> Inteligência artificial
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Configurações"
          onClick={() => useUi.setState({ settingsOpen: true })}
        >
          <Settings size={16} />
        </button>
      </div>
      <div className="home-main">
        <div className="home-inner">
          <div className="home-hero">
            <div>
              <h1>O que vamos editar hoje?</h1>
              <p>
                Abra uma foto, arraste para cá ou cole com Ctrl+V. Camadas, modos de mesclagem e um
                agente de IA que edita junto com você.
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => attempt(actions.open)}>
              <FolderOpen size={15} /> Abrir imagem
            </button>
          </div>

          <button
            type="button"
            className={`home-drop${over ? " is-over" : ""}`}
            onClick={() => attempt(actions.open)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f) attempt(() => openPath(window.api.pathForFile(f)));
            }}
          >
            <ImagePlus size={30} />
            <div>
              <strong>Solte uma imagem aqui</strong>
              <br />
              <span>JPG, PNG, WebP, AVIF, GIF, BMP ou documentos .edifoto</span>
            </div>
            <span className="spacer" />
            <span className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ClipboardPaste size={14} /> Ctrl+V cola da área de transferência
            </span>
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="label">Começar do zero</span>
            <div className="presets">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  className="preset"
                  onClick={() => newBlank(p.w, p.h, p.label)}
                >
                  <strong>{p.label}</strong>
                  <span>
                    {p.w} × {p.h}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {recent.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span className="label">Recentes</span>
              <div className="recent-grid">
                {recent.map((r) => (
                  <div key={r.path} className="recent" title={r.path}>
                    <button
                      type="button"
                      className="card-open"
                      aria-label={`Abrir ${r.name}`}
                      onClick={() => attempt(() => openPath(r.path))}
                    />
                    <div
                      className="thumb"
                      style={{ backgroundImage: r.thumb ? `url(${r.thumb})` : undefined }}
                    />
                    <strong>{r.name}</strong>
                    <span>
                      {r.path.toLowerCase().endsWith(".edifoto") ? "Documento EdiFoto" : "Imagem"} ·{" "}
                      {when(r.openedAt)}
                    </span>
                    <button
                      type="button"
                      className="icon-btn remove"
                      style={{ zIndex: 2 }}
                      title="Tirar da lista"
                      onClick={(e) => {
                        e.stopPropagation();
                        void window.api
                          .removeRecent(r.path)
                          .then(() => setRecent((l) => l.filter((x) => x.path !== r.path)));
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
