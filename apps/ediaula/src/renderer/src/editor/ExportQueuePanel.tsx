import { FolderOpen, ListVideo, X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useApp } from "@/state/app";
import { exportQueue, exportsPending, retryExport, useExportQueue } from "@/state/exportQueue";
import { Button, IconButton, Modal, Progress } from "@/ui";
import "./exportQueue.css";

const labels = {
  waiting: "Na fila",
  preparing: "Preparando",
  exporting: "Exportando",
  done: "Concluído",
  error: "Falhou",
  cancelled: "Cancelado",
};

export function ExportQueuePanel(): ReactNode {
  const { items, open } = useExportQueue();
  const jobs = useApp((s) => s.jobs);
  const pending = items.filter((i) => ["waiting", "preparing", "exporting"].includes(i.state));
  useEffect(() => {
    const onClose = (e: BeforeUnloadEvent): void => {
      if (!exportsPending()) return;
      e.preventDefault();
      e.returnValue = "";
      useExportQueue.setState({ open: true });
      useApp
        .getState()
        .toast(
          "A fila ainda está trabalhando. Aguarde ou cancele os itens antes de fechar o EdiAula. Você pode minimizar e continuar editando.",
          "info",
        );
    };
    window.addEventListener("beforeunload", onClose);
    return () => window.removeEventListener("beforeunload", onClose);
  }, []);
  const close = (): void => {
    useExportQueue.setState({ open: false });
  };
  return (
    <>
      {items.length > 0 && (
        <button
          type="button"
          className="export-queue-launcher btn btn-secondary"
          onClick={() => useExportQueue.setState({ open: true })}
        >
          <ListVideo size={15} /> Exportações {pending.length ? `(${pending.length})` : ""}
        </button>
      )}
      {open && (
        <Modal label="Fila de exportação" width={760} onClose={close}>
          <div className="export-head">
            <ListVideo size={20} className="accent" />
            <div className="spacer">
              <h2 className="modal-title">Fila de exportação</h2>
              <p className="muted">Um arquivo por vez. Pode abrir e editar o próximo projeto.</p>
            </div>
            <IconButton icon={X} label="Fechar fila e continuar editando" onClick={close} />
          </div>
          <div className="export-queue-list">
            {!items.length && <p className="muted">Nenhuma exportação na fila.</p>}
            {items.map((item) => {
              const running = item.state === "preparing" || item.state === "exporting";
              const ratio = item.state === "done" ? 1 : (jobs[item.id]?.ratio ?? 0);
              return (
                <article className="export-queue-item" key={item.id}>
                  <div className="row-10">
                    <strong className="spacer">{item.project.name}</strong>
                    <span>
                      {labels[item.state]}
                      {item.state === "exporting" ? ` · ${Math.round(ratio * 100)}%` : ""}
                    </span>
                  </div>
                  <p className="muted path mono">{item.spec.outPath}</p>
                  {running && (
                    <>
                      <Progress ratio={item.state === "exporting" ? ratio : 0} />
                      <p className="muted">{item.message}</p>
                    </>
                  )}
                  {item.state === "error" && <pre className="error-box">{item.message}</pre>}
                  <div className="row-10">
                    {(running || item.state === "waiting") && (
                      <Button size="sm" onClick={() => exportQueue.cancel(item.id)}>
                        Cancelar
                      </Button>
                    )}
                    {(item.state === "error" || item.state === "cancelled") && (
                      <Button
                        size="sm"
                        onClick={() => {
                          try {
                            retryExport(item);
                          } catch (e) {
                            useApp.getState().toast(String(e), "error");
                          }
                        }}
                      >
                        Tentar novamente
                      </Button>
                    )}
                    {item.state === "done" && (
                      <Button
                        size="sm"
                        icon={FolderOpen}
                        onClick={() => void window.api.showInFolder(item.spec.outPath)}
                      >
                        Mostrar na pasta
                      </Button>
                    )}
                    {!running && item.state !== "waiting" && (
                      <Button size="sm" variant="ghost" onClick={() => exportQueue.remove(item.id)}>
                        Remover da lista
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="export-foot">
            <span className="muted spacer">
              Mantenha o EdiAula aberto ou minimizado até terminar.
            </span>
            <Button variant="primary" onClick={close}>
              Continuar editando
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
