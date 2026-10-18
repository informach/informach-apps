import type { ExportPhase } from "@shared/types";
import { FolderOpen, ListVideo, X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { type Job, useApp } from "@/state/app";
import {
  discardUnfinished,
  editedSince,
  exportQueue,
  exportsPending,
  resumeUnfinished,
  retryExport,
  useExportQueue,
} from "@/state/exportQueue";
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

const phases: Record<ExportPhase, string> = {
  preparing: "Preparando",
  segments: "Trechos",
  audio: "Som",
  assembling: "Montando o arquivo",
};

/** "40 de 52 trechos prontos, 34 reaproveitados", or what the export is doing. */
function detail(job: Job | undefined): string | undefined {
  if (job?.message) return job.message;
  const s = job?.segments;
  if (!s) return undefined;
  const ready = `${s.done} de ${s.total} ${s.total === 1 ? "trecho pronto" : "trechos prontos"}`;
  return s.cached
    ? `${ready}, ${s.cached} ${s.cached === 1 ? "reaproveitado" : "reaproveitados"}`
    : ready;
}

export function ExportQueuePanel(): ReactNode {
  const { items, open, held, resumable } = useExportQueue();
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
  const retry = (item: (typeof items)[number], current: boolean): void => {
    try {
      retryExport(item, current);
    } catch (e) {
      useApp.getState().toast(String(e), "error");
    }
  };
  return (
    <>
      {(items.length > 0 || resumable.length > 0) && (
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
              <p className="muted">
                Um arquivo por vez. Pode abrir e editar o próximo projeto. Se o EdiAula fechar no
                meio, a fila é oferecida para retomar quando ele abrir.
              </p>
            </div>
            <IconButton icon={X} label="Fechar fila e continuar editando" onClick={close} />
          </div>
          <div className="export-queue-list">
            {resumable.length > 0 && (
              <article className="export-queue-item">
                <strong>
                  {resumable.length === 1
                    ? "1 exportação não terminou da última vez"
                    : `${resumable.length} exportações não terminaram da última vez`}
                </strong>
                <p className="muted">
                  {resumable.map((i) => i.project.name).join(", ")}. Ao retomar, os trechos que já
                  ficaram prontos são reaproveitados.
                </p>
                <div className="row-10">
                  <Button size="sm" variant="primary" onClick={resumeUnfinished}>
                    Retomar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={discardUnfinished}>
                    Descartar
                  </Button>
                </div>
              </article>
            )}
            {!items.length && !resumable.length && (
              <p className="muted">Nenhuma exportação na fila.</p>
            )}
            {items.map((item) => {
              const running = item.state === "preparing" || item.state === "exporting";
              const job = jobs[item.id];
              const ratio = item.state === "done" ? 1 : (job?.ratio ?? 0);
              const phase = item.state === "exporting" && job?.phase ? phases[job.phase] : null;
              const status = held && item.state === "waiting" ? "Em espera" : labels[item.state];
              return (
                <article className="export-queue-item" key={item.id}>
                  <div className="row-10">
                    <strong className="spacer">{item.project.name}</strong>
                    <span>
                      {phase ?? status}
                      {item.state === "exporting" ? ` · ${Math.floor(ratio * 100)}%` : ""}
                    </span>
                  </div>
                  <p className="muted path mono">{item.spec.outPath}</p>
                  {held && item.state === "waiting" && (
                    <p className="muted">
                      Exportação em espera: começa quando a gravação terminar.
                    </p>
                  )}
                  {running && (
                    <>
                      {/* While media is prepared there is no measure yet: the message says what runs. */}
                      {item.state === "exporting" && <Progress ratio={ratio} />}
                      <p className="muted">
                        {(item.state === "exporting" && detail(job)) || item.message}
                      </p>
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
                      <>
                        <Button size="sm" onClick={() => retry(item, false)}>
                          Tentar novamente
                        </Button>
                        {editedSince(item) && (
                          <Button size="sm" onClick={() => retry(item, true)}>
                            Tentar com a edição atual
                          </Button>
                        )}
                      </>
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
