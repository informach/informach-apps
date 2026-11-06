import { clock } from "@shared/ranges";
import { Film, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { fail, openPaths, refreshRecents, useStore } from "../state/store";
import { Logo } from "./Logo";

export function Home() {
  const recents = useStore((s) => s.recents);
  const [over, setOver] = useState(false);
  useEffect(() => {
    void refreshRecents().catch(fail);
  }, []);
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
    void openPaths(paths).catch(fail);
  };
  return (
    <main className="home">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target for files dragged from Explorer; keyboard users have the "Abrir arquivo" button inside it. */}
      <section
        className={`drop${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <Logo size={64} />
        <h1>Arraste um vídeo para assistir</h1>
        <p>
          Toca quase tudo. Para cortar, juntar ou converter, aperte <kbd>E</kbd> com o vídeo aberto.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 6 }}>
          <button
            type="button"
            className="btn primary big"
            onClick={() => void window.api.pickFiles().then(openPaths).catch(fail)}
          >
            <FolderOpen size={18} />
            Abrir arquivo <kbd>Ctrl+O</kbd>
          </button>
          <button
            type="button"
            className="btn big"
            onClick={() => void window.api.pickFolder().then(openPaths).catch(fail)}
          >
            Abrir pasta como lista
          </button>
        </div>
        <span className="formats">
          MP4 · MKV · MOV · WEBM · AVI · WMV · FLV · TS · MP3 · WAV · FLAC
        </span>
      </section>

      {recents.length > 0 && (
        <section className="recents">
          <div className="row">
            <h2>Continuar assistindo</h2>
            <span className="spacer" />
            <button
              type="button"
              className="link"
              onClick={() => void window.api.forgetRecents().then(refreshRecents).catch(fail)}
            >
              Limpar recentes
            </button>
          </div>
          <div className="recent-grid">
            {recents.map((r) => (
              <button
                type="button"
                key={r.path}
                className="recent"
                onClick={() => void openPaths([r.path]).catch(fail)}
              >
                <span
                  className="thumb"
                  style={r.thumbUrl ? { backgroundImage: `url("${r.thumbUrl}")` } : undefined}
                >
                  {!r.thumbUrl && <Film size={28} />}
                  <span className="bar">
                    <span
                      style={{
                        width: `${r.watched ? 100 : Math.min(100, (r.position / Math.max(1, r.duration)) * 100)}%`,
                      }}
                    />
                  </span>
                </span>
                <strong>{r.name}</strong>
                <small>
                  {r.watched
                    ? `Assistido · ${clock(r.duration)}`
                    : r.position > 5
                      ? `Parou em ${clock(r.position)} de ${clock(r.duration)}`
                      : `Novo · ${clock(r.duration)}`}
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
      <span className="spacer" />
      <span className="footnote">Parte da suíte Edi</span>
    </main>
  );
}
