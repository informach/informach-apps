import { formatSize } from "@shared/compress";
import type { PendingTaskList } from "@shared/task-format";
import { useEffect, useState } from "react";
import { useApp } from "../state/store";
import { useLocalTasks } from "../state/tasks";
import { Modal } from "./Dialogs";

export function TasksDialog(): React.ReactElement {
  const active = useLocalTasks((state) => state.active),
    activeCount = Object.keys(active).length;
  const [list, setList] = useState<PendingTaskList | null>(null),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false);
  const reload = async () => {
    setError("");
    try {
      setList(await window.api.tasks.list());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao consultar resultados.");
    }
  };
  useEffect(() => {
    let live = true,
      serial = 0;
    const read = () => {
      const current = ++serial;
      void window.api.tasks
        .list()
        .then((value) => {
          if (live && current === serial) setList(value);
        })
        .catch((failure: unknown) => {
          if (live && current === serial)
            setError(failure instanceof Error ? failure.message : "Falha ao consultar resultados.");
        });
    };
    read();
    const unsubscribe = useLocalTasks.subscribe((state, previous) => {
      if (Object.keys(previous.active).some((id) => !Object.hasOwn(state.active, id))) read();
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  const remove = async (id: string) => {
    setRunning(true);
    try {
      if (
        (await window.api.message({
          type: "question",
          title: "Descartar resultado preparado",
          message:
            "O resultado protegido será apagado. Os arquivos de origem e as cópias já salvas permanecem.",
          buttons: ["Manter", "Descartar resultado"],
        })) !== 1
      )
        return;
      await window.api.tasks.remove(id);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao descartar resultado.");
    } finally {
      setRunning(false);
    }
  };
  return (
    <Modal
      title="Tarefas e resultados preparados"
      width={760}
      onClose={() => {
        if (!running) useApp.setState({ dialog: null });
      }}
      footer={
        <button
          type="button"
          className="btn ghost"
          disabled={running}
          onClick={() => useApp.setState({ dialog: null })}
        >
          Fechar
        </button>
      }
    >
      <p className="muted">
        Resultados concluídos aguardando revisão ficam protegidos neste computador. Retomar exige
        acesso válido e uma nova revisão. Essas cópias podem conter dados removidos posteriormente
        do documento; descarte-as quando não forem mais necessárias.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {Object.values(active).map((task) => (
        <div key={task.id} className="form-row">
          <div style={{ flex: 1 }}>
            <strong>{task.name}</strong>
            <p className="muted small">
              {task.phase === "queued"
                ? "Na fila"
                : task.phase === "review"
                  ? "Em revisão"
                  : "Em execução"}{" "}
              · {task.message}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={task.cancel}>
            Interromper {task.name}
          </button>
        </div>
      ))}
      {!list ? (
        <p role="status">Consultando tarefas…</p>
      ) : (
        <>
          {!list.tasks.length && !list.errors.length && !activeCount && (
            <p>Nenhuma tarefa ou resultado preparado pendente.</p>
          )}
          {list.tasks
            .filter((task) => !Object.hasOwn(active, task.id))
            .map((task) => (
              <div
                key={task.id}
                className="form-row"
                style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}
              >
                <div style={{ flex: 1 }}>
                  <strong>{task.name}</strong>
                  <p className="muted small">
                    {new Date(task.createdAt).toLocaleString("pt-BR")} · {formatSize(task.bytes)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={running}
                  onClick={() =>
                    useApp.setState({
                      dialog:
                        task.kind === "batch"
                          ? { kind: "batch", taskId: task.id }
                          : task.kind === "scanning"
                            ? { kind: "scanning", taskId: task.id }
                            : task.kind === "printing"
                              ? { kind: "printing", taskId: task.id }
                              : task.kind === "ocr"
                                ? { kind: "ocr", taskId: task.id }
                                : task.kind === "compression"
                                  ? {
                                      kind: "compressionResume",
                                      taskId: task.id,
                                      processing: task.state === "processing",
                                    }
                                  : { kind: "conversion", mode: "resume", taskId: task.id },
                    })
                  }
                >
                  {task.state === "processing" ? "Retomar" : "Revisar"} {task.name}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={running}
                  onClick={() => void remove(task.id)}
                >
                  Descartar
                </button>
              </div>
            ))}
          {list.errors.map((item) => (
            <div key={item.id}>
              <p role="alert">{item.message}</p>
              <button
                type="button"
                className="btn ghost"
                disabled={running}
                onClick={() => void remove(item.id)}
              >
                Descartar arquivos desta tarefa
              </button>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
