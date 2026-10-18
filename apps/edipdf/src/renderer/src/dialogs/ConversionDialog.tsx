import {
  type ConversionExportFormat,
  type ConversionResult,
  conversionExportFormatSchema,
  conversionExportKind,
  conversionImportExtensions,
  conversionImportKind,
} from "@shared/conversion-format";
import { type Box, viewSize } from "@shared/model";
import { tableSettingsSchema } from "@shared/table-format";
import type { OpenedFile } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import license from "../../../../resources/licenses/Noto-OFL.txt?raw";
import { buildDoc, openConvertedPdf } from "../lib/actions";
import { convertLocal } from "../lib/conversion";
import { documentReview } from "../lib/document-preview";
import { finishDraft } from "../lib/editing";
import { localFonts } from "../lib/fonts";
import { loadSource, pageInfo, releaseSource, renderReviewPage } from "../lib/pdf";
import { beginLocalTask, type LocalTask } from "../lib/tasks";
import { type DocState, toast, useApp } from "../state/store";
import { ReviewImage } from "../ui/ReviewImage";
import { TableReview, TableSourceImage } from "../ui/TableReview";
import { Modal } from "./Dialogs";

interface Prepared {
  result: ConversionResult;
  name: string;
  originPaths?: string[];
  revision?: DocState["content"];
}
export function ConversionDialog({
  mode,
  doc,
  resumeId,
}: {
  mode: "import" | "export" | "resume";
  doc?: DocState;
  resumeId?: string;
}): React.ReactElement {
  const [file, setFile] = useState<OpenedFile | null>(null),
    [format, setFormat] = useState<ConversionExportFormat>("docx");
  const [tablePage, setTablePage] = useState(doc?.currentPage ?? 0);
  const sizeFor = (index: number) => {
    const ref = doc?.content.pages[index];
    return ref ? viewSize(ref, pageInfo(ref)) : { w: 595.276, h: 841.89 };
  };
  const sourceSize = sizeFor(tablePage);
  const [area, setArea] = useState<Box>(() => ({ x: 0, y: 0, w: sourceSize.w, h: sourceSize.h }));
  const [separators, setSeparators] = useState("");
  const [header, setHeader] = useState(true);
  const [sourcePreview, setSourcePreview] = useState("");
  const [highlight, setHighlight] = useState<Box | null>(null);
  const tableFormat = mode === "export" && ["xlsx", "ods", "csv", "json"].includes(format);
  const separatorValues = separators.trim()
    ? separators.split(";").map((part) => Number(part.trim()))
    : [];
  const [dpi, setDpi] = useState<150 | 200 | 300>(200);
  const [prepared, setPrepared] = useState<Prepared | null>(null),
    [preview, setPreview] = useState(""),
    [page, setPage] = useState(0);
  const [running, setRunning] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewLimited, setPreviewLimited] = useState(false);
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(true);
  const task = useRef<LocalTask | null>(null);
  const detached = useRef(false);
  useEffect(() => {
    if (!tableFormat || !doc || prepared) return;
    const abort = new AbortController(),
      ref = doc.content.pages[tablePage];
    setSourcePreview("");
    if (!ref) return;
    void documentReview(doc, ref.id, abort.signal)
      .then((image) => {
        if (!abort.signal.aborted) setSourcePreview(image.url);
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Falha na prévia da tabela.");
      });
    return () => abort.abort();
  }, [tableFormat, doc, tablePage, prepared]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!detached.current) {
        controller.current?.abort();
        task.current?.disconnect();
      }
    };
  }, []);
  useEffect(() => {
    if (mode !== "resume" || !resumeId) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setProgress("Retomando resultado protegido…");
    void (async () => {
      const pending = await window.api.tasks.load(resumeId);
      const resumed = await beginLocalTask(pending.request, abort.signal, (message) => {
        if (mounted.current) setError(message);
      });
      task.current = resumed;
      await resumed.ready(pending.result);
      if (pending.result.table) setPage(pending.result.table.source.page - 1);
      if (mounted.current && !abort.signal.aborted)
        setPrepared({
          result: pending.result,
          name: pending.request.defaultName,
          originPaths: pending.request.originPaths,
        });
    })()
      .catch((failure) => {
        if (mounted.current && !abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Falha ao retomar resultado.");
      })
      .finally(() => {
        if (mounted.current) setRunning(false);
      });
    return () => abort.abort();
  }, [mode, resumeId]);
  useEffect(() => {
    if (!prepared) {
      setPreview("");
      return;
    }
    let live = true;
    const abort = new AbortController();
    setPreview("");
    void (async () => {
      const source = await loadSource(
        prepared.result.pdf,
        "Prévia da conversão.pdf",
        () => Promise.resolve(null),
        { output: true },
      );
      try {
        const rendered = await renderReviewPage(
          { id: "conversion-preview", src: source.id, index: page, rotation: 0 },
          1200,
          abort.signal,
        );
        if (live) {
          setPreview(rendered.url);
          setPreviewLimited(rendered.limited);
        }
      } finally {
        releaseSource(source.id);
      }
    })().catch((failure) => {
      if (live) setError(failure instanceof Error ? failure.message : "Falha na prévia.");
    });
    return () => {
      live = false;
      abort.abort();
    };
  }, [prepared, page]);
  const close = () => {
    if (saving) return;
    controller.current?.abort();
    task.current?.disconnect();
    useApp.setState({ dialog: null });
  };
  const prepare = async () => {
    task.current?.disconnect();
    task.current = null;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setPrepared(null);
    setPage(0);
    setRunning(true);
    setProgress("Preparando conversão local…");
    try {
      let bytes: Uint8Array, name: string, revision: DocState["content"] | undefined;
      if (mode === "import") {
        if (!file) throw new Error("Escolha um arquivo compatível com a conversão local.");
        bytes = file.bytes;
        name = file.name;
      } else {
        if (!doc || doc.canCopy === false)
          throw new Error("O documento não permite exportação de conteúdo.");
        if (!finishDraft(doc.id))
          throw new Error("Corrija ou descarte o rascunho pendente antes de converter.");
        const current = useApp.getState().docs.find((item) => item.id === doc.id);
        if (!current) throw new Error("Documento fechado.");
        bytes = await buildDoc(current, current.content, abort.signal);
        name = current.name;
        revision = current.content;
      }
      if (abort.signal.aborted) return;
      const extension = mode === "import" ? "pdf" : format;
      const outputName = `${name.replace(/\.[^.]+$/, "")} (convertido).${extension}`;
      setProgress("Aguardando a fila local…");
      const activeTask = await beginLocalTask(
        {
          id: crypto.randomUUID(),
          kind: "conversion",
          label: name,
          defaultName: outputName,
          extension,
          inputBytes: bytes.length,
          originPaths: mode === "import" && file ? [file.path] : doc?.path ? [doc.path] : [],
        },
        abort.signal,
        (message) => {
          if (mounted.current) setError(message);
          else if (detached.current) toast(message, { tone: "error", ms: 10000 });
        },
      );
      task.current = activeTask;
      const result = await convertLocal(
        {
          kind: mode === "import" ? conversionImportKind(name) : conversionExportKind(format),
          bytes,
          title: name.replace(/\.[^.]+$/, ""),
          fonts: await localFonts(),
          fontLicense: license,
          dpi,
          table: tableFormat
            ? tableSettingsSchema.parse({
                page: tablePage,
                area,
                separators: separatorValues,
                header,
              })
            : undefined,
        },
        activeTask.signal,
        (message) => {
          activeTask.describe(message);
          if (mounted.current) setProgress(message);
        },
      );
      await activeTask.ready(result);
      if (detached.current) {
        activeTask.disconnect();
        toast(`${outputName} está pronto para revisar em Tarefas.`, { ms: 10000 });
        return;
      }
      if (result.table) setPage(result.table.source.page - 1);
      if (mounted.current && !abort.signal.aborted)
        setPrepared({
          result,
          name: `${name.replace(/\.[^.]+$/, "")} (convertido).${result.extension}`,
          originPaths: mode === "import" && file ? [file.path] : undefined,
          revision,
        });
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") {
        task.current?.disconnect();
        return;
      }
      if (detached.current && !abort.signal.aborted && !task.current?.signal.aborted)
        toast(failure instanceof Error ? failure.message : "Falha na conversão em segundo plano.", {
          tone: "error",
          ms: 10000,
        });
      if (mounted.current && !abort.signal.aborted && !task.current?.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Falha na conversão.");
      task.current?.disconnect();
    } finally {
      if (mounted.current) setRunning(false);
    }
  };
  const accept = async (open: boolean) => {
    if (!prepared) return;
    setRunning(true);
    setSaving(true);
    setProgress("Salvando conversão…");
    setError("");
    try {
      if (
        mode === "export" &&
        (!doc ||
          useApp.getState().docs.find((item) => item.id === doc.id)?.content !== prepared.revision)
      )
        throw new Error("O documento mudou. Gere uma nova prévia antes de exportar.");
      const activeTask = task.current;
      if (!activeTask) throw new Error("Retome a conversão em Tarefas para continuar.");
      if (open) {
        if (prepared.result.extension !== "pdf")
          throw new Error("Este resultado não é um PDF para abrir no editor.");
        await openConvertedPdf(prepared.result.bytes, prepared.name, prepared.originPaths ?? [], {
          signal: activeTask.signal,
          beforeCommit: () => activeTask.check(),
        });
        activeTask.disconnect();
      } else {
        const path = await activeTask.save();
        if (!path) return;
        const outcome = await activeTask.outcome;
        if (outcome.status === "saved" && outcome.warning)
          toast(outcome.warning, { tone: "error", ms: 10000 });
      }
      toast(
        open
          ? "PDF aberto. A cópia preparada continua disponível em Tarefas."
          : "Conversão salva como cópia.",
      );
      controller.current?.abort();
      useApp.setState({ dialog: null });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao aceitar a conversão.");
    } finally {
      if (mounted.current) {
        setRunning(false);
        setSaving(false);
      }
    }
  };
  return (
    <Modal
      title={
        mode === "import"
          ? "Converter arquivo para PDF"
          : mode === "resume"
            ? "Retomar conversão preparada"
            : "Exportar documento"
      }
      width={860}
      onClose={close}
      allowCancelWhileBusy
      footer={
        <>
          <button type="button" className="btn ghost" onClick={close} disabled={saving}>
            {running ? "Cancelar conversão" : "Fechar"}
          </button>
          {running && !saving && mode !== "resume" && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                detached.current = true;
                useApp.setState({ dialog: { kind: "tasks" } });
              }}
            >
              Continuar em segundo plano
            </button>
          )}
          {!prepared ? (
            <button
              type="button"
              className="btn primary"
              disabled={running || (mode === "import" && !file)}
              onClick={() => void prepare()}
              hidden={mode === "resume"}
            >
              Gerar prévia
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn ghost"
                disabled={running}
                onClick={() =>
                  void task.current
                    ?.discard()
                    .then(() => {
                      task.current = null;
                      setPrepared(null);
                    })
                    .catch((failure: unknown) =>
                      setError(
                        failure instanceof Error
                          ? failure.message
                          : "Falha ao descartar resultado.",
                      ),
                    )
                }
                hidden={mode === "resume"}
              >
                Ajustar conversão
              </button>
              {(mode === "import" ||
                (mode === "resume" && prepared.result.extension === "pdf")) && (
                <button
                  type="button"
                  className="btn"
                  disabled={running || !preview}
                  onClick={() => void accept(true)}
                >
                  {mode === "resume" ? "Abrir PDF para revisar" : "Abrir PDF convertido"}
                </button>
              )}
              <button
                type="button"
                className="btn primary"
                disabled={running || !preview}
                onClick={() => void accept(false)}
              >
                Salvar cópia convertida
              </button>
            </>
          )}
        </>
      }
    >
      <p className="muted">
        Processamento local. Confira todas as páginas e os avisos antes de aceitar a conversão.
      </p>
      {mode === "import" && !prepared && (
        <p className="muted">Formatos: {conversionImportExtensions.join(", ").toUpperCase()}.</p>
      )}
      {!prepared &&
        mode !== "resume" &&
        (mode === "import" ? (
          <div className="form-row">
            <button
              type="button"
              className="btn"
              disabled={running}
              onClick={() =>
                void window.api
                  .pickData("office")
                  .then((picked) => {
                    if (picked && mounted.current) {
                      setFile(picked);
                      setError("");
                    }
                  })
                  .catch((failure) =>
                    setError(
                      failure instanceof Error ? failure.message : "Falha ao escolher arquivo.",
                    ),
                  )
              }
            >
              Escolher arquivo
            </button>
            <span>{file?.name ?? "Nenhum arquivo escolhido"}</span>
          </div>
        ) : (
          <label className="form-row">
            Formato
            <select
              className="select"
              aria-label="Formato"
              value={format}
              disabled={running}
              onChange={(event) =>
                setFormat(conversionExportFormatSchema.parse(event.target.value))
              }
            >
              <option value="docx">Word editável (.docx)</option>
              <option value="txt">Texto (.txt)</option>
              <option value="tif">TIFF multipágina (.tif)</option>
              <option value="rtf">Texto rico editável (.rtf)</option>
              <option value="odt">OpenDocument editável (.odt)</option>
              <option value="pptx">Apresentação editável por fluxo (.pptx)</option>
              <option value="odp">Apresentação editável por fluxo (.odp)</option>
              <option value="xlsx">Tabela com origem — Excel (.xlsx)</option>
              <option value="ods">Tabela com origem — OpenDocument (.ods)</option>
              <option value="csv">Tabela de valores (.csv)</option>
              <option value="json">Mapa de origem das células (.json)</option>
            </select>
          </label>
        ))}
      {tableFormat && !prepared && (
        <fieldset className="table-extraction-settings" disabled={running}>
          <legend>Região da tabela</legend>
          <p className="muted">
            Coordenadas em pontos, a partir do canto superior esquerdo da página visível. Ajuste a
            área e as divisões, depois confira todas as células.
          </p>
          <label className="form-row">
            Página de origem
            <input
              className="input"
              type="number"
              min={1}
              max={doc?.content.pages.length ?? 1}
              value={tablePage + 1}
              onChange={(event) => {
                const index = Math.max(
                  0,
                  Math.min(
                    (doc?.content.pages.length ?? 1) - 1,
                    Number(event.target.value) - 1 || 0,
                  ),
                );
                setTablePage(index);
                const size = sizeFor(index);
                setArea({ x: 0, y: 0, w: size.w, h: size.h });
                setSeparators("");
              }}
            />
          </label>
          <div className="table-area-fields">
            {(
              [
                { key: "x", label: "X da área" },
                { key: "y", label: "Y da área" },
                { key: "w", label: "Largura da área" },
                { key: "h", label: "Altura da área" },
              ] as const
            ).map((field) => (
              <label className="table-area-field" key={field.key}>
                {field.label}
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  min={field.key === "w" || field.key === "h" ? 0.1 : 0}
                  max={16000}
                  value={area[field.key]}
                  onChange={(event) =>
                    setArea((value) => ({ ...value, [field.key]: Number(event.target.value) }))
                  }
                />
              </label>
            ))}
          </div>
          <label className="form-row">
            Divisões X das colunas
            <input
              className="input"
              value={separators}
              placeholder="Ex.: 200; 350.5"
              onChange={(event) => setSeparators(event.target.value)}
            />
          </label>
          <p className="muted small">
            Separe posições por ponto e vírgula; use ponto para decimais. Deixe vazio para uma
            coluna.
          </p>
          <label className="form-row">
            <input
              type="checkbox"
              checked={header}
              onChange={(event) => setHeader(event.target.checked)}
            />
            A primeira linha é cabeçalho
          </label>
          {sourcePreview ? (
            <TableSourceImage
              src={sourcePreview}
              width={sourceSize.w}
              height={sourceSize.h}
              area={area}
              separators={separatorValues.filter(Number.isFinite)}
            />
          ) : (
            <p role="status">Carregando página de origem…</p>
          )}
        </fieldset>
      )}
      {mode === "export" && format === "tif" && !prepared && (
        <label className="form-row">
          Resolução TIFF
          <select
            className="select"
            aria-label="Resolução TIFF"
            value={dpi}
            disabled={running}
            onChange={(event) =>
              setDpi(event.target.value === "150" ? 150 : event.target.value === "300" ? 300 : 200)
            }
          >
            <option value={150}>150 dpi</option>
            <option value={200}>200 dpi</option>
            <option value={300}>300 dpi</option>
          </select>
        </label>
      )}
      {running && <p role="status">{progress || "Salvando conversão…"}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {prepared && (
        <>
          <p>
            {prepared.name} · {prepared.result.pages}{" "}
            {prepared.result.pages === 1 ? "página" : "páginas"} na prévia
          </p>
          <ul>
            {prepared.result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {["docx", "rtf", "odt", "pptx", "odp"].includes(prepared.result.extension) && (
            <p className="muted">
              A prévia representa o fluxo reconstruído. A paginação no editor de destino pode
              variar.
            </p>
          )}
          {!prepared.result.table && (
            <label className="form-row">
              Página da prévia
              <input
                type="number"
                className="input"
                min={1}
                max={prepared.result.pages}
                value={page + 1}
                disabled={running}
                onChange={(event) =>
                  setPage(
                    Math.max(
                      0,
                      Math.min(prepared.result.pages - 1, Number(event.target.value) - 1 || 0),
                    ),
                  )
                }
              />
            </label>
          )}
          {preview ? (
            prepared.result.table ? (
              <TableSourceImage
                src={preview}
                width={prepared.result.table.source.width}
                height={prepared.result.table.source.height}
                area={prepared.result.table.source.area}
                separators={prepared.result.table.source.separators}
                highlight={highlight}
              />
            ) : (
              <ReviewImage
                src={preview}
                alt={`Prévia da conversão, página ${page + 1}`}
                limited={previewLimited}
              />
            )
          ) : (
            <p role="status">Carregando prévia…</p>
          )}
          {prepared.result.table && (
            <TableReview
              key={prepared.result.table.source.sha256}
              evidence={prepared.result.table}
              onHighlight={setHighlight}
            />
          )}
        </>
      )}
      {prepared?.result.extension === "txt" && (
        <p className="muted">
          O TXT preserva o texto extraído e separa as páginas. A prévia mostra o PDF de origem;
          imagens e desenhos não fazem parte do TXT.
        </p>
      )}
      {prepared?.result.extension === "tif" && (
        <p className="muted">
          A prévia mostra o PDF de origem. O TIFF contém imagens rasterizadas de todas as páginas,
          sem campos editáveis ou texto pesquisável.
        </p>
      )}
    </Modal>
  );
}
