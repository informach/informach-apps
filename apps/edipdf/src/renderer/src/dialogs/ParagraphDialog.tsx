import { paragraphAnnotationSchema } from "@shared/document-format";
import { type ParagraphAnnot, uid, viewSize } from "@shared/model";
import { encodeParagraphFont } from "@shared/paragraph-font";
import { sameParagraphLayout } from "@shared/paragraph-layout";
import { useCallback, useEffect, useRef, useState } from "react";
import { finishDraft } from "../lib/editing";
import { inspectFontInWorker } from "../lib/font-inspection";
import { pageInfo } from "../lib/pdf";
import { commit, type DocState, toast, useApp } from "../state/store";
import { ParagraphView } from "../viewer/ParagraphView";
import { Modal } from "./Dialogs";

export function ParagraphDialog({
  doc,
  annotId,
  initialText,
}: {
  doc: DocState;
  annotId?: string;
  initialText?: string;
}): React.ReactElement {
  const existing = doc.content.annots.find(
    (a): a is ParagraphAnnot => a.id === annotId && a.kind === "paragraph",
  );
  const [value, setValue] = useState<ParagraphAnnot>(() => {
    if (existing) return existing;
    const page = doc.content.pages[doc.currentPage] ?? doc.content.pages[0];
    const size = page ? viewSize(page, pageInfo(page)) : { w: 612, h: 792 },
      x = Math.min(20, size.w / 10),
      y = Math.min(20, size.h / 10);
    return {
      id: uid("paragraph"),
      page: page?.id ?? "",
      kind: "paragraph",
      x,
      y,
      w: Math.max(10, Math.min(360, size.w - x * 2)),
      h: Math.max(10, Math.min(240, size.h - y * 2)),
      text: initialText ?? "Texto",
      size: 12,
      color: "#111111",
      align: "left",
      spacing: 1.1,
      padding: 8,
      list: "none",
    };
  });
  const [ready, setReady] = useState<ParagraphAnnot | null>(null),
    [running, setRunning] = useState(false),
    [error, setError] = useState(
      annotId && !existing ? "A caixa foi removida. Feche esta janela e selecione novamente." : "",
    );
  const revision = useRef(doc.content),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!finishDraft(doc.id))
      setError("Corrija ou descarte o rascunho pendente antes de criar a caixa.");
    const current = useApp.getState().docs.find((item) => item.id === doc.id);
    if (current) revision.current = current.content;
    return () => abort.current?.abort();
  }, [doc.id]);
  const reportReady = useCallback((ready: ParagraphAnnot | null) => setReady(ready), []);
  const set = (patch: Partial<ParagraphAnnot>) => {
    setValue((previous) => ({ ...previous, ...patch }));
    setError("");
  };
  const page = doc.content.pages.find((page) => page.id === value.page),
    size = page ? viewSize(page, pageInfo(page)) : undefined;
  const outside =
    !size ||
    value.x < 0 ||
    value.y < 0 ||
    value.x + value.w > size.w + 0.01 ||
    value.y + value.h > size.h + 0.01;
  const close = () => {
    abort.current?.abort();
    useApp.setState({ dialog: null });
  };
  const chooseFont = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError("");
    try {
      const file = await window.api.pickData("font");
      controller.signal.throwIfAborted();
      if (!file) return;
      const font = await inspectFontInWorker(file.bytes, controller.signal);
      controller.signal.throwIfAborted();
      set({
        fontData: {
          name: `${font.family} ${font.subfamily}`.trim(),
          data: encodeParagraphFont(file.bytes),
        },
        bold: false,
        italic: false,
      });
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Falha ao importar fonte.");
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  };
  const apply = () => {
    try {
      const current = useApp.getState().docs.find((item) => item.id === doc.id);
      if (!current || current.readOnly || current.content !== revision.current)
        throw new Error(
          "O documento mudou. Feche esta janela e abra novamente para revisar a alteração.",
        );
      if (existing?.locked) throw new Error("Desbloqueie a caixa antes de editar.");
      if (annotId && !existing) throw new Error("A caixa foi removida.");
      if (!ready || !sameParagraphLayout(ready, value) || outside)
        throw new Error("Confira a composição e mantenha a caixa dentro da página.");
      const annotation = paragraphAnnotationSchema.parse({
        ...value,
        text: value.text.normalize("NFC"),
      });
      const changed = commit(
        doc.id,
        (content) => ({
          ...content,
          annots: existing
            ? content.annots.map((a) => (a.id === existing.id ? annotation : a))
            : [...content.annots, annotation],
        }),
        { selectedAnnot: annotation.id, selectedAnnots: [annotation.id] },
      );
      if (changed) {
        toast("Caixa de texto aplicada. Desfazer restaura a revisão anterior.");
        close();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível aplicar a caixa.");
    }
  };
  const numberField = (
    label: string,
    key: "x" | "y" | "w" | "h" | "size" | "padding" | "spacing",
    minimum: number,
    maximum: number,
  ) => (
    <label className="form-row">
      {label}
      <input
        className="input"
        aria-label={label}
        type="number"
        min={minimum}
        max={maximum}
        step={key === "spacing" ? 0.1 : 1}
        value={value[key]}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) set({ [key]: Math.max(minimum, Math.min(maximum, next)) });
        }}
      />
    </label>
  );
  return (
    <Modal
      title={existing ? "Editar caixa de texto" : "Caixa de texto e parágrafos"}
      width={1000}
      onClose={close}
      allowCancelWhileBusy
      footer={
        <>
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn primary"
            disabled={
              !ready ||
              !sameParagraphLayout(ready, value) ||
              running ||
              outside ||
              doc.readOnly ||
              !!existing?.locked ||
              !!error
            }
            onClick={apply}
          >
            Aplicar caixa de texto
          </button>
        </>
      }
    >
      <p className="muted">
        Texto editável com quebra automática, alinhamento e listas. Dimensões em pontos da página; a
        prévia usa a fonte que será incorporada. Se o texto não couber, ajuste a caixa ou a fonte
        antes de aplicar.
      </p>
      <fieldset
        disabled={running || doc.readOnly || !!existing?.locked}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        <legend className="sr-only">Editar parágrafos</legend>
        <label className="form-row">
          Texto da caixa
          <textarea
            className="input"
            aria-label="Texto da caixa"
            rows={5}
            maxLength={100000}
            spellCheck={false}
            value={value.text}
            onChange={(event) => set({ text: event.target.value })}
          />
        </label>
        <div className="form-grid">
          {numberField("Posição X (pt)", "x", 0, size?.w ?? 14400)}
          {numberField("Posição Y (pt)", "y", 0, size?.h ?? 14400)}
          {numberField("Largura da caixa (pt)", "w", 10, size?.w ?? 14400)}
          {numberField("Altura da caixa (pt)", "h", 10, size?.h ?? 14400)}
          {numberField("Tamanho da fonte (pt)", "size", 4, 200)}
          {numberField("Espaço interno (pt)", "padding", 0, 144)}
          {numberField("Entrelinhas", "spacing", 1, 3)}
          <label className="form-row">
            Alinhamento
            <select
              className="select"
              aria-label="Alinhamento"
              value={value.align}
              onChange={(event) => {
                const next = paragraphAnnotationSchema.shape.align.safeParse(event.target.value);
                if (next.success) set({ align: next.data });
              }}
            >
              <option value="left">Esquerda</option>
              <option value="center">Centro</option>
              <option value="right">Direita</option>
              <option value="justify">Justificado</option>
            </select>
          </label>
          <label className="form-row">
            Lista
            <select
              className="select"
              aria-label="Lista"
              value={value.list}
              onChange={(event) => {
                const next = paragraphAnnotationSchema.shape.list.safeParse(event.target.value);
                if (next.success) set({ list: next.data });
              }}
            >
              <option value="none">Sem lista</option>
              <option value="bullet">Marcadores</option>
              <option value="numbered">Numerada</option>
            </select>
          </label>
          <label className="form-row">
            Cor do texto
            <input
              type="color"
              aria-label="Cor do texto"
              value={value.color}
              onChange={(event) => set({ color: event.target.value })}
            />
          </label>
        </div>
        <p className="muted small">Fonte: {value.fontData?.name ?? "Noto Sans"}</p>
        <div className="form-row">
          <button type="button" className="btn" onClick={() => void chooseFont()}>
            Escolher fonte TrueType…
          </button>
          {value.fontData ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => set({ fontData: undefined })}
            >
              Usar Noto Sans
            </button>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={!!value.bold}
                  onChange={(event) => set({ bold: event.target.checked })}
                />{" "}
                Negrito
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!value.italic}
                  onChange={(event) => set({ italic: event.target.checked })}
                />{" "}
                Itálico
              </label>
            </>
          )}
        </div>
      </fieldset>
      {outside && (
        <p role="alert" className="error">
          A caixa precisa ficar dentro da página. Ajuste posição, largura e altura.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {running && <p role="status">Conferindo a fonte local…</p>}
      <div
        style={{
          border: "1px solid var(--line)",
          background: "#fff",
          padding: 8,
          alignSelf: "center",
        }}
      >
        <ParagraphView
          a={value}
          scale={Math.min(1, 700 / value.w, 350 / value.h)}
          positioned={false}
          onReady={reportReady}
        />
      </div>
    </Modal>
  );
}
