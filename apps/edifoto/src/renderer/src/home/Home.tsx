import { IMAGE_TEMPLATES } from "@shared/templates";
import type { RecentDoc } from "@shared/types";
import { ClipboardPaste, FolderOpen, ImagePlus, Settings, Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { actions, attempt } from "@/lib/actions";
import { pasteImage } from "@/lib/files";
import { discardRecovery, type RecoveryDraft, readRecovery, restoreRecovery } from "@/lib/recovery";
import { useUi } from "@/state/ui";

const PRESETS = [
  { label: "Quadrado", w: 1080, h: 1080 },
  { label: "Retrato", w: 1080, h: 1350 },
  { label: "Vertical", w: 1080, h: 1920 },
  { label: "Paisagem", w: 1280, h: 720 },
  { label: "Widescreen", w: 1920, h: 1080 },
  { label: "Página A4", w: 1240, h: 1754 },
];

const when = (t: number): string => {
  const d = Math.round((Date.now() - t) / 86400000);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
};

export function Home(): ReactNode {
  const [recent, setRecent] = useState<RecentDoc[]>([]);
  const [over, setOver] = useState(false);
  const [draft, setDraft] = useState<RecoveryDraft>();

  useEffect(() => {
    void window.api.recentDocs().then(setRecent);
    let active = true;
    void readRecovery()
      .then((value) => {
        if (active) setDraft(value);
      })
      .catch((error: unknown) =>
        useUi
          .getState()
          .toast(
            error instanceof Error ? error.message : "Não foi possível ler a recuperação.",
            "error",
          ),
      );
    const onPaste = (e: ClipboardEvent): void => {
      if (!useUi.getState().newDocumentOpen) attempt(() => pasteImage(e));
    };
    window.addEventListener("paste", onPaste);
    return () => {
      active = false;
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  const newBlank = (w: number, h: number, label: string): void => {
    attempt(() => actions.createDocument(label, w, h, "#ffffff"));
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
          {draft && (
            <div className="recovery-banner" role="status">
              <div>
                <strong>Continuar de onde parou</strong>
                <p>
                  {draft.name} · cópia local de {new Date(draft.savedAt).toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => attempt(restoreRecovery)}
              >
                Recuperar trabalho
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  attempt(async () => {
                    if (
                      await useUi
                        .getState()
                        .ask(
                          "Descartar cópia?",
                          "Seu projeto salvo não será alterado.",
                          "Descartar",
                        )
                    ) {
                      await discardRecovery();
                      setDraft(undefined);
                    }
                  })
                }
              >
                Descartar cópia
              </button>
            </div>
          )}
          <div className="home-hero">
            <div>
              <h1>Uma ideia, uma imagem.</h1>
              <p>
                Comece com um modelo ou abra uma foto. Combine imagens, texto e formas, com ajuda
                quando precisar.
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
              if (f) attempt(() => actions.openPath(window.api.pathForFile(f)));
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

          <section className="template-section" aria-label="Modelos">
            <div className="section-head">
              <strong>Modelos para começar</strong>
              <span className="muted">Tudo pode ser editado</span>
            </div>
            <div className="template-grid">
              {IMAGE_TEMPLATES.map((template) => (
                <button
                  type="button"
                  className="template-card"
                  key={template.id}
                  onClick={() => attempt(() => actions.template(template.id))}
                >
                  <div className={`template-preview template-${template.id}`} aria-hidden="true">
                    <span />
                    <strong>
                      Seu título
                      <br />
                      aqui
                    </strong>
                    <i />
                  </div>
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
          </section>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="label">Imagem em branco</span>
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
                      onClick={() => attempt(() => actions.openPath(r.path))}
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
