import {
  Combine,
  FileArchive,
  FilePlus2,
  FileText,
  FolderOpen,
  Images,
  Pin,
  ScanLine,
  X,
} from "lucide-react";
import { useState } from "react";
import { newBlankDocument, openDialog, openPaths, restoreRecovery } from "../lib/actions";
import { toast, useApp } from "../state/store";

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
  const recoveries = useApp((s) => s.recoveries);
  const [query, setQuery] = useState("");
  const filtered = recents.filter((entry) =>
    `${entry.name} ${entry.path}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
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
    {
      icon: <ScanLine size={20} />,
      title: "Digitalizar com scanner",
      text: "Mesa ou alimentador pelo Windows",
      run: () => useApp.setState({ dialog: { kind: "scanning" } }),
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
        {recoveries.length > 0 && (
          <section className="home-recent" aria-label="Trabalhos recuperáveis">
            <h2>Trabalhos recuperáveis</h2>
            <p className="muted">
              Cópias locais protegidas pelo Windows. Recuperar abre um documento para salvar em
              outro destino.
            </p>
            <div className="recent-grid">
              {recoveries.map((item) => (
                <div key={item.id} className="recent">
                  <button
                    type="button"
                    className="card-open"
                    aria-label={`Recuperar ${item.name}`}
                    onClick={() => void restoreRecovery(item.id)}
                  />
                  <div className="recent-meta">
                    <span className="recent-name">{item.name}</span>
                    <span className="recent-sub">{when(item.updatedAt)}</span>
                  </div>
                  <button
                    type="button"
                    className="recent-remove"
                    title="Excluir cópia de recuperação"
                    onClick={async () => {
                      const choice = await window.api.message({
                        type: "question",
                        message: `Excluir a cópia de recuperação de ${item.name}?`,
                        detail: "Os arquivos PDF salvos não serão alterados.",
                        buttons: ["Excluir cópia local", "Cancelar"],
                      });
                      if (choice !== 0) return;
                      try {
                        await window.api.recovery.remove(item.id);
                        useApp.setState((s) => ({
                          recoveries: s.recoveries.filter((r) => r.id !== item.id),
                        }));
                      } catch {
                        toast("Não foi possível excluir a cópia local.", { tone: "error" });
                      }
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="home-recent">
          <h2>Recentes</h2>
          <input
            className="input"
            aria-label="Buscar nos recentes"
            value={query}
            placeholder="Buscar arquivo ou pasta…"
            onChange={(event) => setQuery(event.target.value)}
          />
          {recents.length === 0 ? (
            <div className="empty">
              <FileText size={22} />
              <p>Os arquivos que você abrir aparecem aqui.</p>
            </div>
          ) : (
            <div className="recent-grid">
              {filtered.map((r) => (
                <div key={r.path} className="recent" title={r.path}>
                  <button
                    type="button"
                    className="card-open"
                    aria-label={`Abrir ${r.name}`}
                    onClick={() => {
                      if (r.available === false)
                        toast(
                          "Este arquivo foi movido ou não está disponível. Use Abrir PDF para localizá-lo.",
                          { tone: "error" },
                        );
                      else void openPaths([r.path]);
                    }}
                  />
                  <div className="recent-thumb">
                    {r.thumb ? <img src={r.thumb} alt="" /> : <FileText size={26} />}
                  </div>
                  <div className="recent-meta">
                    <span className="recent-name">{r.name}</span>
                    <span className="recent-sub">
                      {when(r.openedAt)}
                      {r.pinned ? " · fixado" : ""}
                      {r.available === false ? " · indisponível" : ""}
                      {r.pages ? ` · ${r.pages} ${r.pages === 1 ? "pág." : "págs."}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="recent-pin"
                    aria-label={`${r.pinned ? "Desafixar" : "Fixar"} ${r.name}`}
                    aria-pressed={!!r.pinned}
                    onClick={async () => {
                      try {
                        useApp.setState({
                          recents: await window.api.recent.pin(r.path, !r.pinned),
                        });
                      } catch (failure) {
                        toast(
                          failure instanceof Error
                            ? failure.message
                            : "Não foi possível fixar o recente.",
                          { tone: "error" },
                        );
                      }
                    }}
                  >
                    <Pin size={13} />
                  </button>
                  <button
                    type="button"
                    className="recent-remove"
                    style={{ zIndex: 2 }}
                    title="Remover da lista"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        useApp.setState({ recents: await window.api.recent.remove(r.path) });
                      } catch (failure) {
                        toast(
                          failure instanceof Error
                            ? failure.message
                            : "Não foi possível remover o recente.",
                          { tone: "error" },
                        );
                      }
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
