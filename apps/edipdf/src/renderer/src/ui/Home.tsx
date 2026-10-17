import { Combine, FileArchive, FilePlus2, FileText, FolderOpen, Images, X } from "lucide-react";
import { newBlankDocument, openDialog, openPaths } from "../lib/actions";
import { useApp } from "../state/store";

const when = (t: number): string => {
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return `Hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
};

export function Home(): React.ReactElement {
  const recents = useApp((s) => s.recents);
  const actions = [
    {
      icon: <FolderOpen size={20} />,
      title: "Abrir PDF",
      text: "Ver, anotar, preencher e assinar",
      run: () => void openDialog(),
      primary: true,
    },
    {
      icon: <Combine size={20} />,
      title: "Juntar PDFs",
      text: "Vários PDFs e imagens em um só",
      run: () => useApp.setState({ dialog: { kind: "combine" } }),
    },
    {
      icon: <FileArchive size={20} />,
      title: "Compactar PDF",
      text: "Deixe arquivos mais leves",
      run: () => useApp.setState({ dialog: { kind: "compress", mode: "files" } }),
    },
    {
      icon: <Images size={20} />,
      title: "PDF a partir de imagens",
      text: "Fotos e digitalizações viram PDF",
      run: () => useApp.setState({ dialog: { kind: "combine" } }),
    },
    {
      icon: <FilePlus2 size={20} />,
      title: "Documento em branco",
      text: "Comece uma página A4 vazia",
      run: newBlankDocument,
    },
  ];
  return (
    <div className="home">
      <div className="home-inner">
        <section className="home-hero">
          <h1>O que vamos fazer hoje?</h1>
          <p className="muted">
            Arraste um PDF ou imagem para qualquer lugar da janela para abrir.
          </p>
        </section>
        <section className="home-actions">
          {actions.map((a) => (
            <button
              type="button"
              key={a.title}
              className={`home-action${a.primary ? " primary" : ""}`}
              onClick={a.run}
            >
              <span className="home-action-icon">{a.icon}</span>
              <span className="home-action-title">{a.title}</span>
              <span className="home-action-text">{a.text}</span>
            </button>
          ))}
        </section>
        <section className="home-recent">
          <h2>Recentes</h2>
          {recents.length === 0 ? (
            <div className="empty">
              <FileText size={22} />
              <p>Os arquivos que você abrir aparecem aqui.</p>
            </div>
          ) : (
            <div className="recent-grid">
              {recents.map((r) => (
                <div key={r.path} className="recent" title={r.path}>
                  <button
                    type="button"
                    className="card-open"
                    aria-label={`Abrir ${r.name}`}
                    onClick={() => void openPaths([r.path])}
                  />
                  <div className="recent-thumb">
                    {r.thumb ? <img src={r.thumb} alt="" /> : <FileText size={26} />}
                  </div>
                  <div className="recent-meta">
                    <span className="recent-name">{r.name}</span>
                    <span className="recent-sub">
                      {when(r.openedAt)}
                      {r.pages ? ` · ${r.pages} ${r.pages === 1 ? "pág." : "págs."}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="recent-remove"
                    style={{ zIndex: 2 }}
                    title="Remover da lista"
                    onClick={async (e) => {
                      e.stopPropagation();
                      useApp.setState({ recents: await window.api.recent.remove(r.path) });
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
