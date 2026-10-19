import {
  type ScannerDevice,
  type ScannerSettings,
  type ScannerSource,
  scannerSettingsSchema,
} from "@shared/scanner-format";
import type { LocalTaskRequest, TaskResult } from "@shared/task-format";
import { useCallback, useEffect, useRef, useState } from "react";
import { openConvertedPdf } from "../lib/actions";
import { loadSource, releaseSource, renderReviewPage } from "../lib/pdf";
import { recoverySnapshot } from "../lib/recovery";
import { beginLocalTask, type LocalTask } from "../lib/tasks";
import { toast, useApp } from "../state/store";
import { ReviewImage } from "../ui/ReviewImage";
import { Modal } from "./Dialogs";

const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : "Falha na digitalização local.";
export function ScannerDialog({ resumeId }: { resumeId?: string }): React.ReactElement {
  const [devices, setDevices] = useState<ScannerDevice[] | null>(null),
    [selectedDevice, setSelectedDevice] = useState<ScannerDevice | null>(null);
  const deviceId = selectedDevice?.id ?? "";
  const [sources, setSources] = useState<ScannerSource[]>([]),
    [sourceId, setSourceId] = useState("");
  const [loadingSources, setLoadingSources] = useState(false);
  const [deviceError, setDeviceError] = useState(""),
    [error, setError] = useState("");
  const [dpi, setDpi] = useState<150 | 200 | 300>(200),
    [color, setColor] = useState<ScannerSettings["color"]>("color"),
    [paper, setPaper] = useState<ScannerSettings["paper"]>("a4");
  const [maximumPages, setMaximumPages] = useState(100),
    [running, setRunning] = useState(false),
    [saving, setSaving] = useState(false),
    [status, setStatus] = useState("");
  const [prepared, setPrepared] = useState<TaskResult | null>(null),
    [preview, setPreview] = useState(""),
    [previewLimited, setPreviewLimited] = useState(false),
    [page, setPage] = useState(0),
    [reviewed, setReviewed] = useState(false);
  const [pendingId, setPendingId] = useState(resumeId);
  const active = useRef<LocalTask | null>(null),
    request = useRef<LocalTaskRequest | null>(null),
    controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    stopRequested = useRef(false);
  const resume = useCallback(async (id: string, abort: AbortController) => {
    setRunning(true);
    setError("");
    setStatus("Retomando páginas protegidas…");
    try {
      const saved = await window.api.tasks.load(id);
      if (saved.request.kind !== "scanning" || saved.result.detail?.kind !== "scanning")
        throw new Error("A tarefa não contém páginas digitalizadas.");
      const task = await beginLocalTask(saved.request, abort.signal, (problem) => {
        if (mounted.current) setError(problem);
      });
      active.current = task;
      request.current = saved.request;
      const result: TaskResult = {
        ...saved.result,
        detail: { ...saved.result.detail, stage: "review" },
      };
      await task.ready(result);
      if (mounted.current && !abort.signal.aborted) {
        setPrepared(result);
        setPage(0);
        setReviewed(false);
        setPendingId(id);
      }
    } catch (failure) {
      active.current?.disconnect();
      active.current = null;
      if (mounted.current && !abort.signal.aborted) setError(message(failure));
    } finally {
      if (mounted.current) setRunning(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      active.current?.disconnect();
    };
  }, []);
  const reloadDevices = useCallback(async () => {
    setDevices(null);
    setDeviceError("");
    setSources([]);
    setSourceId("");
    try {
      const list = await window.api.scanners.list();
      if (mounted.current) {
        setDevices(list);
        setSelectedDevice(list[0] ? { ...list[0] } : null);
      }
    } catch (failure) {
      if (mounted.current) {
        setDevices([]);
        setSelectedDevice(null);
        setDeviceError(message(failure));
      }
    }
  }, []);
  useEffect(() => {
    if (!resumeId) {
      void reloadDevices();
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    void resume(resumeId, abort);
    return () => abort.abort();
  }, [resumeId, resume, reloadDevices]);
  useEffect(() => {
    if (!selectedDevice) {
      setLoadingSources(false);
      return;
    }
    let live = true;
    setLoadingSources(true);
    setSources([]);
    setSourceId("");
    setDeviceError("");
    void window.api.scanners
      .sources(selectedDevice.id)
      .then((list) => {
        if (live) {
          setSources(list);
          setSourceId(list[0]?.id ?? "");
        }
      })
      .catch((failure: unknown) => {
        if (live) setDeviceError(message(failure));
      })
      .finally(() => {
        if (live) setLoadingSources(false);
      });
    return () => {
      live = false;
    };
  }, [selectedDevice]);
  useEffect(() => {
    if (!prepared) return;
    let live = true;
    const abort = new AbortController();
    setPreview("");
    void (async () => {
      const source = await loadSource(
        prepared.pdf,
        "Prévia da digitalização.pdf",
        () => Promise.resolve(null),
        { output: true },
      );
      try {
        const image = await renderReviewPage(
          { id: "scan-preview", src: source.id, index: page, rotation: 0 },
          1200,
          abort.signal,
        );
        if (live) {
          setPreview(image.url);
          setPreviewLimited(image.limited);
        }
      } finally {
        releaseSource(source.id);
      }
    })().catch((failure: unknown) => {
      if (live) setError(message(failure));
    });
    return () => {
      live = false;
      abort.abort();
    };
  }, [prepared, page]);
  const close = () => {
    if (saving) return;
    controller.current?.abort();
    active.current?.disconnect();
    useApp.setState({ dialog: null });
  };
  const scan = async () => {
    setRunning(true);
    setError("");
    setReviewed(false);
    stopRequested.current = false;
    try {
      let task = active.current,
        settings = request.current?.scanner;
      if (task && prepared) {
        setStatus("Aguardando a fila local para a próxima folha…");
        await task.stage();
      } else {
        settings = scannerSettingsSchema.parse({
          deviceId,
          sourceId,
          dpi,
          color,
          paper,
          maximumPages,
        });
        const abort = new AbortController();
        controller.current = abort;
        const nextRequest: LocalTaskRequest = {
          id: crypto.randomUUID(),
          kind: "scanning",
          label: "Digitalização local",
          defaultName: "Digitalização.pdf",
          extension: "pdf",
          inputBytes: 32 * 1024 * 1024,
          originPaths: [],
          scanner: settings,
        };
        request.current = nextRequest;
        setPendingId(nextRequest.id);
        task = await beginLocalTask(nextRequest, abort.signal, (problem) => {
          if (mounted.current) setError(problem);
        });
        active.current = task;
      }
      if (!settings || !task) throw new Error("A sessão de digitalização não está disponível.");
      const source = sources.find((item) => item.id === settings.sourceId);
      if (!source) throw new Error("Atualize a fonte de digitalização antes de continuar.");
      let result = prepared;
      do {
        setStatus(
          `Adquirindo folha ${(result?.pages ?? 0) + 1}… As páginas concluídas ficam protegidas antes da próxima folha.`,
        );
        const next = await task.scanPage();
        if (!next) break;
        result = next;
        if (mounted.current) {
          setPrepared(result);
          setPage(result.pages - 1);
        }
      } while (
        source.kind === "feeder" &&
        !stopRequested.current &&
        (result?.pages ?? 0) < settings.maximumPages
      );
      if (result?.detail?.kind !== "scanning")
        throw new Error("Nenhuma página completa foi digitalizada.");
      const ready: TaskResult = { ...result, detail: { ...result.detail, stage: "review" } };
      await task.ready(ready);
      if (mounted.current) {
        setPrepared(ready);
        setStatus("Páginas protegidas prontas para revisão.");
      }
    } catch (failure) {
      active.current?.disconnect();
      active.current = null;
      if (mounted.current && !controller.current?.signal.aborted)
        setError(
          `${message(failure)} Páginas já concluídas permanecem em Tarefas; confira o scanner antes de uma nova aquisição.`,
        );
    } finally {
      if (mounted.current) setRunning(false);
    }
  };
  const accept = async (open: boolean, ocr = false) => {
    if (!prepared || !reviewed || !active.current) return;
    const task = active.current;
    setSaving(true);
    setError("");
    try {
      await task.check();
      if (open) {
        const doc = await openConvertedPdf(prepared.bytes, "Digitalização.pdf", [], {
          signal: task.signal,
          beforeCommit: () => task.check(),
        });
        let secured = false;
        try {
          await window.api.recovery.save(recoverySnapshot(doc));
          secured = true;
        } catch (failure) {
          toast(
            `A digitalização foi aberta; sua cópia permanece em Tarefas porque a recuperação não foi atualizada: ${message(failure)}`,
            { tone: "error", ms: 10000 },
          );
        }
        if (secured) {
          try {
            await task.discard();
          } catch (failure) {
            toast(`Documento aberto; confira a cópia preparada em Tarefas: ${message(failure)}`, {
              tone: "error",
            });
          }
        }
        task.disconnect();
        useApp.setState({ dialog: ocr ? { kind: "ocr" } : null });
      } else {
        const path = await task.save();
        if (!path) return;
        const outcome = await task.outcome;
        if (outcome.status === "saved" && outcome.warning)
          toast(outcome.warning, { tone: "error" });
        toast("Digitalização salva como PDF.");
        useApp.setState({ dialog: null });
      }
    } catch (failure) {
      if (mounted.current) setError(message(failure));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  return (
    <Modal
      title="Digitalizar com scanner"
      width={860}
      onClose={close}
      allowCancelWhileBusy
      footer={
        <>
          <button type="button" className="btn ghost" disabled={saving} onClick={close}>
            {running ? "Cancelar agora" : prepared ? "Continuar depois" : "Fechar"}
          </button>
          {running && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                stopRequested.current = true;
                setStatus("Parando após concluir e proteger a folha atual…");
              }}
            >
              Parar após esta folha
            </button>
          )}
          {!prepared && (
            <button
              type="button"
              className="btn primary"
              disabled={running || saving || !sourceId}
              onClick={() => void scan()}
            >
              Digitalizar
            </button>
          )}
          {prepared && !running && (
            <>
              {!active.current && pendingId && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const abort = new AbortController();
                    controller.current = abort;
                    void resume(pendingId, abort);
                  }}
                >
                  Retomar revisão
                </button>
              )}
              {active.current &&
                !resumeId &&
                sources.find((source) => source.id === sourceId)?.kind === "flatbed" &&
                prepared.pages < maximumPages && (
                  <button
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={() => void scan()}
                  >
                    Digitalizar próxima folha
                  </button>
                )}
              <button
                type="button"
                className="btn"
                disabled={saving || !reviewed || !preview || !active.current}
                onClick={() => void accept(true)}
              >
                Abrir PDF
              </button>
              <button
                type="button"
                className="btn"
                disabled={saving || !reviewed || !preview || !active.current}
                onClick={() => void accept(true, true)}
              >
                Abrir e reconhecer texto
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={saving || !reviewed || !preview || !active.current}
                onClick={() => void accept(false)}
              >
                Salvar PDF revisado
              </button>
            </>
          )}
        </>
      }
    >
      <p className="muted">
        Aquisição local pelo WIA e driver do Windows. Confira o scanner antes de cancelar ou
        reiniciar uma folha. O perfil atual adquire uma face por folha.
      </p>
      {!prepared && !resumeId && (
        <>
          <div className="form-row">
            {!!devices?.length && (
              <label>
                Scanner
                <select
                  className="select"
                  aria-label="Scanner"
                  value={deviceId}
                  disabled={running || !devices?.length}
                  onChange={(event) =>
                    setSelectedDevice(
                      devices?.find((device) => device.id === event.target.value) ?? null,
                    )
                  }
                >
                  {devices?.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="btn"
              disabled={running || devices === null}
              onClick={() => void reloadDevices()}
            >
              Atualizar scanners
            </button>
          </div>
          {devices === null ? (
            <p role="status">Consultando scanners WIA…</p>
          ) : !devices.length && !deviceError ? (
            <p role="status">
              Nenhum scanner WIA conectado. Ligue um scanner com driver WIA e atualize a lista. Você
              também pode importar digitalizações TIFF pela conversão local.
            </p>
          ) : null}
          {!!devices?.length && (
            <>
              <label className="form-row">
                Fonte
                <select
                  className="select"
                  aria-label="Fonte do scanner"
                  value={sourceId}
                  disabled={running || !sources.length}
                  onChange={(event) => setSourceId(event.target.value)}
                >
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.kind === "flatbed" ? "Mesa" : "Alimentador"} — {source.name}
                    </option>
                  ))}
                </select>
              </label>
              {!sources.length && !deviceError && (
                <p role="status">
                  {loadingSources
                    ? "Consultando fontes compatíveis…"
                    : "O driver não oferece mesa ou alimentador compatível com este perfil local."}
                </p>
              )}
              <div className="form-row">
                <label>
                  Resolução
                  <select
                    className="select"
                    aria-label="Resolução do scanner"
                    disabled={running}
                    value={dpi}
                    onChange={(event) =>
                      setDpi(
                        event.target.value === "150"
                          ? 150
                          : event.target.value === "300"
                            ? 300
                            : 200,
                      )
                    }
                  >
                    <option value={150}>150 dpi</option>
                    <option value={200}>200 dpi</option>
                    <option value={300}>300 dpi</option>
                  </select>
                </label>
                <label>
                  Cor
                  <select
                    className="select"
                    aria-label="Cor do scanner"
                    disabled={running}
                    value={color}
                    onChange={(event) =>
                      setColor(
                        event.target.value === "gray"
                          ? "gray"
                          : event.target.value === "text"
                            ? "text"
                            : "color",
                      )
                    }
                  >
                    <option value="color">Colorido</option>
                    <option value="gray">Cinza</option>
                    <option value="text">Preto e branco</option>
                  </select>
                </label>
                <label>
                  Papel
                  <select
                    className="select"
                    aria-label="Papel do scanner"
                    disabled={running}
                    value={paper}
                    onChange={(event) =>
                      setPaper(event.target.value === "letter" ? "letter" : "a4")
                    }
                  >
                    <option value="a4">A4</option>
                    <option value="letter">Carta</option>
                  </select>
                </label>
              </div>
              <label className="form-row">
                Limite de páginas
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={100}
                  value={maximumPages}
                  disabled={running}
                  onChange={(event) =>
                    setMaximumPages(Math.max(1, Math.min(100, Number(event.target.value) || 1)))
                  }
                />
              </label>
              <p className="muted">
                Até cem páginas/64 MB, 24 megapixels por folha. Ajustes não aceitos pelo driver
                serão informados. Depois de abrir o PDF, use recorte, rotação e OCR locais.
              </p>
            </>
          )}
        </>
      )}
      {deviceError && (
        <p role="alert" className="error">
          {deviceError}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {(running || saving) && (
        <p role="status">{saving ? "Salvando páginas revisadas…" : status}</p>
      )}
      {prepared && (
        <>
          <p>
            {prepared.pages} {prepared.pages === 1 ? "página protegida" : "páginas protegidas"}.
            Confira todas antes de aceitar.
          </p>
          {prepared.warnings.map((warning) => (
            <p className="muted" key={warning}>
              {warning}
            </p>
          ))}
          <label className="form-row">
            Página da prévia
            <input
              type="number"
              className="input"
              min={1}
              max={prepared.pages}
              value={page + 1}
              disabled={saving}
              onChange={(event) =>
                setPage(
                  Math.max(0, Math.min(prepared.pages - 1, Number(event.target.value) - 1 || 0)),
                )
              }
            />
          </label>
          {preview ? (
            <ReviewImage
              src={preview}
              alt={`Digitalização, página ${page + 1}`}
              limited={previewLimited}
            />
          ) : (
            <p role="status">Carregando prévia…</p>
          )}
          <label className="form-row">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={running || saving}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            Revisei todas as páginas digitalizadas.
          </label>
        </>
      )}
    </Modal>
  );
}
