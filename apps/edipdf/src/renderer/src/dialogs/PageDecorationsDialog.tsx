import type {
  DecorationScope,
  DocContent,
  PageNumberEntry,
  PageNumbers,
  Watermark,
} from "@shared/model";
import {
  compilePageNumbers,
  decorationApplies,
  numberPositionSchema,
  numberStyleSchema,
  pageNumbersSchema,
  watermarkSchema,
} from "@shared/page-decorations";
import { parsePageRange } from "@shared/page-ranges";
import { useEffect, useId, useRef, useState } from "react";
import { buildDoc } from "../lib/document-output";
import { finishDraft } from "../lib/editing";
import { loadSource, releaseSource, renderReviewPage } from "../lib/pdf";
import { commit, type DocState, useApp } from "../state/store";
import { ReviewImage } from "../ui/ReviewImage";
import { Modal } from "./Dialogs";

const positions = [
  { value: "top-left", label: "Cabeçalho, esquerda" },
  { value: "top-center", label: "Cabeçalho, centro" },
  { value: "top-right", label: "Cabeçalho, direita" },
  { value: "bottom-left", label: "Rodapé, esquerda" },
  { value: "bottom-center", label: "Rodapé, centro" },
  { value: "bottom-right", label: "Rodapé, direita" },
];
type NumberDraft = Omit<PageNumbers, "additional"> & {
  additional: (PageNumberEntry & { id: string })[];
};
const colorInput = (value: string) =>
  value.length === 4 ? `#${[...value.slice(1)].map((char) => char + char).join("")}` : value;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível preparar a prévia.";

export function PageDecorationsDialog({
  doc,
  mode,
}: {
  doc: DocState;
  mode: "watermark" | "pageNumbers";
}): React.ReactElement {
  const initialScope = (mode === "watermark" ? doc.content.watermark : doc.content.pageNumbers)
    ?.scope;
  const formId = useId();
  const [wm, setWm] = useState<Watermark>(
    () =>
      doc.content.watermark ?? {
        text: "CONFIDENCIAL",
        size: 64,
        color: "#DC2626",
        opacity: 0.18,
        angle: 45,
        position: "center",
        fit: true,
        marginX: 30,
        marginY: 30,
      },
  );
  const [pn, setPn] = useState<NumberDraft>(() => ({
    format: "Página {n} de {total}",
    position: "bottom-center",
    size: 10,
    color: "#333333",
    start: 1,
    countMode: "applied",
    ...doc.content.pageNumbers,
    additional: (doc.content.pageNumbers?.additional ?? []).map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
    })),
  }));
  const [scopeMode, setScopeMode] = useState(initialScope?.pages ? "ranges" : "all");
  const [ranges, setRanges] = useState(
    () =>
      doc.content.pages
        .flatMap((page, index) =>
          (
            initialScope?.pages
              ? initialScope.pages.includes(page.id)
              : doc.selection.includes(page.id)
          )
            ? [index + 1]
            : [],
        )
        .join(", ") || "1-ultima",
  );
  const [skipCover, setSkipCover] = useState(
    !!initialScope?.except?.includes(doc.content.pages[0]?.id),
  );
  const [exceptions, setExceptions] = useState(() =>
    doc.content.pages
      .flatMap((page, index) =>
        index > 0 && initialScope?.except?.includes(page.id) ? [index + 1] : [],
      )
      .join(", "),
  );
  const [previewPage, setPreviewPage] = useState(doc.currentPage);
  const [prepared, setPrepared] = useState<{
    key: string;
    before: DocContent;
    content: DocContent;
    sourceId: string;
  } | null>(null);
  const [image, setImage] = useState<{
    sourceId: string;
    page: number;
    url: string;
    limited: boolean;
  } | null>(null);
  const [running, setRunning] = useState(false),
    [error, setError] = useState("");
  const original = useRef(doc.content),
    generation = useRef<AbortController | null>(null),
    rendering = useRef<AbortController | null>(null),
    heldSource = useRef<string | undefined>(undefined);
  const key = JSON.stringify({
    mode,
    value: mode === "watermark" ? wm : pn,
    scopeMode,
    ranges,
    skipCover,
    exceptions,
  });
  const owner = useRef({ key, content: doc.content });
  const ready = prepared?.key === key && prepared.before === doc.content ? prepared : null;
  const preview = image?.sourceId === ready?.sourceId && image?.page === previewPage ? image : null;
  const release = () => {
    if (heldSource.current) releaseSource(heldSource.current);
    heldSource.current = undefined;
  };
  useEffect(() => {
    if (owner.current.key === key && owner.current.content === doc.content) return;
    owner.current = { key, content: doc.content };
    generation.current?.abort();
    rendering.current?.abort();
    if (heldSource.current) releaseSource(heldSource.current);
    heldSource.current = undefined;
    setPrepared(null);
    setImage(null);
    setRunning(false);
    setError(
      doc.content === original.current
        ? ""
        : "O documento mudou. Feche esta janela e reabra para conferir os intervalos.",
    );
  }, [key, doc.content]);
  useEffect(
    () => () => {
      generation.current?.abort();
      rendering.current?.abort();
      if (heldSource.current) releaseSource(heldSource.current);
    },
    [],
  );
  useEffect(() => {
    rendering.current?.abort();
    setImage(null);
    if (!ready) return;
    const abort = new AbortController();
    rendering.current = abort;
    void renderReviewPage(
      { id: "decoration-preview", src: ready.sourceId, index: previewPage, rotation: 0 },
      1200,
      abort.signal,
    )
      .then((result) => {
        if (!abort.signal.aborted)
          setImage({
            sourceId: ready.sourceId,
            page: previewPage,
            url: result.url,
            limited: result.limited,
          });
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setError(message(failure));
      });
    return () => abort.abort();
  }, [ready, previewPage]);
  const close = () => {
    generation.current?.abort();
    rendering.current?.abort();
    release();
    useApp.setState({ dialog: null });
  };
  const scope = (): DecorationScope => {
    const pages = doc.content.pages;
    const except = new Set(
      exceptions.trim()
        ? parsePageRange(exceptions, pages.length).map((index) => pages[index].id)
        : [],
    );
    if (skipCover && pages[0]) except.add(pages[0].id);
    const value = {
      pages:
        scopeMode === "ranges"
          ? parsePageRange(ranges, pages.length).map((index) => pages[index].id)
          : undefined,
      except: [...except],
    };
    if (!pages.some((page) => decorationApplies(value, page.id)))
      throw new Error("Os intervalos e exceções não deixam páginas para aplicar.");
    return value;
  };
  const generate = async () => {
    generation.current?.abort();
    rendering.current?.abort();
    release();
    setPrepared(null);
    setImage(null);
    setError("");
    const abort = new AbortController();
    generation.current = abort;
    setRunning(true);
    let sourceId: string | undefined;
    try {
      const current = useApp.getState().docs.find((item) => item.id === doc.id);
      if (!current || current.readOnly || current.content !== original.current)
        throw new Error("O documento mudou ou não permite edição. Feche esta janela e reabra.");
      if (!finishDraft(doc.id))
        throw new Error("Conclua o rascunho antes de preparar marcas e cabeçalhos.");
      const selected =
        mode === "watermark"
          ? watermarkSchema.safeParse({ ...wm, scope: scope() })
          : pageNumbersSchema.safeParse({ ...pn, scope: scope() });
      if (!selected.success)
        throw new Error(selected.error.issues.map((issue) => issue.message).join("\n"));
      if (mode === "watermark" && !wm.text.trim())
        throw new Error("Digite o texto da marca d'água.");
      const content: DocContent =
        mode === "watermark"
          ? { ...current.content, watermark: watermarkSchema.parse(selected.data) }
          : { ...current.content, pageNumbers: pageNumbersSchema.parse(selected.data) };
      compilePageNumbers(content.pages, content.pageNumbers);
      const bytes = await buildDoc(current, content, abort.signal);
      abort.signal.throwIfAborted();
      const source = await loadSource(
        bytes,
        "Prévia de marcas e cabeçalhos.pdf",
        () => Promise.resolve(null),
        { output: true },
      );
      sourceId = source.id;
      abort.signal.throwIfAborted();
      heldSource.current = sourceId;
      sourceId = undefined;
      setPrepared({ key, before: current.content, content, sourceId: source.id });
    } catch (failure) {
      if (!abort.signal.aborted) setError(message(failure));
    } finally {
      if (sourceId) releaseSource(sourceId);
      if (generation.current === abort) setRunning(false);
    }
  };
  const apply = (remove = false) => {
    const current = useApp.getState().docs.find((item) => item.id === doc.id);
    if (
      !current ||
      current.readOnly ||
      current.content !== original.current ||
      (!remove && (!ready || !preview))
    ) {
      setError("Confira uma prévia atual antes de aplicar.");
      return;
    }
    if (
      commit(doc.id, (content) =>
        remove ? { ...content, [mode]: null } : (ready?.content ?? content),
      )
    )
      close();
    else setError("A alteração não foi aceita. O documento foi preservado.");
  };
  const used = new Set([pn.position, ...pn.additional.map((entry) => entry.position)]);
  const numberRow = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    min: number,
    max: number,
    step = "any",
  ) => (
    <label className="local-field">
      {label}
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        required
      />
    </label>
  );
  return (
    <Modal
      title={mode === "watermark" ? "Marca d'água" : "Numerar páginas"}
      width={900}
      onClose={close}
      footer={
        <>
          {(mode === "watermark" ? doc.content.watermark : doc.content.pageNumbers) && (
            <button
              type="button"
              className="btn danger-outline"
              onClick={() => apply(true)}
              disabled={running || !!doc.readOnly}
            >
              Remover
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            {running ? "Cancelar preparação" : "Cancelar"}
          </button>
          <button
            type="submit"
            form={formId}
            className="btn ghost"
            disabled={running || doc.content !== original.current || !!doc.readOnly}
          >
            {running ? "Preparando…" : "Atualizar prévia"}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!ready || !preview || running || !!doc.readOnly}
            onClick={() => apply()}
          >
            Aplicar
          </button>
        </>
      }
    >
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="local-tools-layout decoration-layout">
        <form
          className="decoration-settings"
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <fieldset disabled={running} style={{ border: 0, padding: 0 }}>
            <legend className="sr-only">Configuração de marcas e cabeçalhos</legend>
            {mode === "watermark" ? (
              <>
                <label className="local-field">
                  Texto da marca d'água
                  <input
                    className="input"
                    maxLength={2000}
                    required
                    value={wm.text}
                    onChange={(event) => setWm({ ...wm, text: event.target.value })}
                  />
                </label>
                <label className="local-field">
                  Posição da marca
                  <select
                    aria-label="Posição da marca"
                    className="select"
                    value={wm.position ?? "center"}
                    onChange={(event) =>
                      setWm({
                        ...wm,
                        position: watermarkSchema.shape.position.parse(event.target.value),
                      })
                    }
                  >
                    <option value="center">Centro da página</option>
                    <option value="middle-left">Meio, esquerda</option>
                    <option value="middle-right">Meio, direita</option>
                    {positions.map((position) => (
                      <option key={position.value} value={position.value}>
                        {position.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="preferences-grid">
                  {numberRow(
                    "Tamanho da marca (pt)",
                    wm.size,
                    (size) => setWm({ ...wm, size }),
                    8,
                    200,
                  )}
                  {numberRow(
                    "Ângulo (graus)",
                    wm.angle,
                    (angle) => setWm({ ...wm, angle }),
                    -180,
                    180,
                  )}
                  <label className="local-field">
                    Cor da marca
                    <input
                      className="input color"
                      type="color"
                      value={colorInput(wm.color)}
                      onChange={(event) => setWm({ ...wm, color: event.target.value })}
                    />
                  </label>
                  {numberRow(
                    "Opacidade (0 a 1)",
                    wm.opacity,
                    (opacity) => setWm({ ...wm, opacity }),
                    0.01,
                    1,
                  )}
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={!!wm.fit}
                    onChange={(event) => setWm({ ...wm, fit: event.target.checked })}
                  />{" "}
                  Reduzir a marca para caber entre as margens
                </label>
              </>
            ) : (
              <>
                <label className="local-field">
                  Formato do cabeçalho ou rodapé
                  <input
                    className="input"
                    maxLength={2000}
                    required
                    value={pn.format}
                    onChange={(event) => setPn({ ...pn, format: event.target.value })}
                  />
                </label>
                <p className="muted small">
                  Use {"{n}"} e {"{total}"} para a sequência, {"{count}"} para a quantidade
                  numerada, {"{page}"} e {"{pages}"} para as páginas físicas. Texto livre permite
                  cabeçalhos e prefixos Bates.
                </p>
                <label className="local-field">
                  Posição principal
                  <select
                    aria-label="Posição principal"
                    className="select"
                    value={pn.position}
                    onChange={(event) =>
                      setPn({ ...pn, position: numberPositionSchema.parse(event.target.value) })
                    }
                  >
                    {positions.map((position) => (
                      <option
                        key={position.value}
                        value={position.value}
                        disabled={
                          used.has(numberPositionSchema.parse(position.value)) &&
                          position.value !== pn.position
                        }
                      >
                        {position.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="preferences-grid">
                  {numberRow(
                    "Tamanho principal (pt)",
                    pn.size,
                    (size) => setPn({ ...pn, size }),
                    6,
                    36,
                  )}
                  {numberRow(
                    "Começar em",
                    pn.start,
                    (start) => setPn({ ...pn, start }),
                    (pn.style ?? "decimal") === "decimal" ? -100000 : 1,
                    100000,
                    "1",
                  )}
                  <label className="local-field">
                    Estilo
                    <select
                      aria-label="Estilo"
                      className="select"
                      value={pn.style ?? "decimal"}
                      onChange={(event) =>
                        setPn({ ...pn, style: numberStyleSchema.parse(event.target.value) })
                      }
                    >
                      <option value="decimal">1, 2, 3</option>
                      <option value="roman-lower">i, ii, iii</option>
                      <option value="roman-upper">I, II, III</option>
                      <option value="letters-lower">a, b, c</option>
                      <option value="letters-upper">A, B, C</option>
                    </select>
                  </label>
                  {numberRow(
                    "Mínimo de dígitos",
                    pn.padding ?? 1,
                    (padding) => setPn({ ...pn, padding }),
                    1,
                    12,
                    "1",
                  )}
                  <label className="local-field">
                    Cor principal
                    <input
                      className="input color"
                      type="color"
                      value={colorInput(pn.color)}
                      onChange={(event) => setPn({ ...pn, color: event.target.value })}
                    />
                  </label>
                  <label className="local-field">
                    Contagem
                    <select
                      aria-label="Contagem"
                      className="select"
                      value={pn.countMode ?? "physical"}
                      onChange={(event) =>
                        setPn({
                          ...pn,
                          countMode: event.target.value === "applied" ? "applied" : "physical",
                        })
                      }
                    >
                      <option value="applied">Somente páginas que recebem numeração</option>
                      <option value="physical">Todas as páginas físicas</option>
                    </select>
                  </label>
                </div>
                {pn.additional.map((entry, index) => (
                  <fieldset key={entry.id}>
                    <legend>Cabeçalho/rodapé adicional {index + 1}</legend>
                    <label className="local-field">
                      Texto adicional {index + 1}
                      <input
                        className="input"
                        maxLength={2000}
                        required
                        value={entry.format}
                        onChange={(event) =>
                          setPn({
                            ...pn,
                            additional: pn.additional.map((row) =>
                              row.id === entry.id ? { ...row, format: event.target.value } : row,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="local-field">
                      Posição adicional {index + 1}
                      <select
                        aria-label={`Posição adicional ${index + 1}`}
                        className="select"
                        value={entry.position}
                        onChange={(event) =>
                          setPn({
                            ...pn,
                            additional: pn.additional.map((row) =>
                              row.id === entry.id
                                ? {
                                    ...row,
                                    position: numberPositionSchema.parse(event.target.value),
                                  }
                                : row,
                            ),
                          })
                        }
                      >
                        {positions.map((position) => (
                          <option
                            key={position.value}
                            value={position.value}
                            disabled={
                              used.has(numberPositionSchema.parse(position.value)) &&
                              position.value !== entry.position
                            }
                          >
                            {position.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() =>
                        setPn({
                          ...pn,
                          additional: pn.additional.filter((row) => row.id !== entry.id),
                        })
                      }
                    >
                      Remover adicional {index + 1}
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={pn.additional.length >= 5}
                  onClick={() => {
                    const position = positions.find(
                      (item) => !used.has(numberPositionSchema.parse(item.value)),
                    );
                    if (position)
                      setPn({
                        ...pn,
                        additional: [
                          ...pn.additional,
                          {
                            id: crypto.randomUUID(),
                            position: numberPositionSchema.parse(position.value),
                            format: "Cabeçalho",
                          },
                        ],
                      });
                  }}
                >
                  Adicionar cabeçalho ou rodapé
                </button>
                <label className="local-field">
                  <span>
                    <input
                      type="checkbox"
                      checked={!!pn.writePageLabels}
                      aria-describedby={`${formId}-labels-help`}
                      onChange={(event) => setPn({ ...pn, writePageLabels: event.target.checked })}
                    />{" "}
                    Usar a sequência como rótulo de navegação no PDF
                  </span>
                </label>
                <p className="muted small" id={`${formId}-labels-help`}>
                  Substitui os rótulos de navegação anteriores; páginas excluídas usam seu número
                  físico.
                </p>
              </>
            )}
            <div className="preferences-grid">
              {numberRow(
                "Margem horizontal (pt)",
                (mode === "watermark" ? wm : pn).marginX ?? 30,
                (marginX) =>
                  mode === "watermark" ? setWm({ ...wm, marginX }) : setPn({ ...pn, marginX }),
                0,
                14400,
              )}
              {numberRow(
                "Margem vertical (pt)",
                (mode === "watermark" ? wm : pn).marginY ?? 30,
                (marginY) =>
                  mode === "watermark" ? setWm({ ...wm, marginY }) : setPn({ ...pn, marginY }),
                0,
                14400,
              )}
            </div>
            <label className="local-field">
              Aplicar em
              <select
                aria-label="Aplicar em"
                className="select"
                value={scopeMode}
                onChange={(event) => setScopeMode(event.target.value)}
              >
                <option value="all">Todas as páginas</option>
                <option value="ranges">Intervalos escolhidos</option>
              </select>
            </label>
            {scopeMode === "ranges" && (
              <label className="local-field">
                Páginas do intervalo
                <input
                  className="input"
                  value={ranges}
                  maxLength={10000}
                  required
                  onChange={(event) => setRanges(event.target.value)}
                />
              </label>
            )}
            <label className="local-field">
              Exceto páginas
              <input
                className="input"
                value={exceptions}
                maxLength={10000}
                placeholder="Ex.: 3, 7-9"
                onChange={(event) => setExceptions(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={skipCover}
                onChange={(event) => setSkipCover(event.target.checked)}
              />{" "}
              Não aplicar na capa (primeira página)
            </label>
            <p className="muted small">
              Intervalos aceitam 1-3, 7, ultima, pares e impares. As páginas escolhidas conservam
              sua identidade quando reorganizadas. Inserções posteriores entram apenas na opção
              “Todas”.
            </p>
          </fieldset>
        </form>
        <div>
          <label className="local-field">
            Página da prévia
            <input
              className="input"
              type="number"
              min={1}
              max={doc.content.pages.length}
              step={1}
              value={previewPage + 1}
              onChange={(event) => {
                const page = event.target.valueAsNumber - 1;
                if (Number.isInteger(page) && page >= 0 && page < doc.content.pages.length)
                  setPreviewPage(page);
              }}
            />
          </label>
          {running && <p role="status">Preparando o PDF para conferência…</p>}
          {ready && !preview && !error && <p role="status">Carregando a página da prévia…</p>}
          {preview ? (
            <ReviewImage
              src={preview.url}
              limited={preview.limited}
              alt={`Prévia real de marcas e cabeçalhos, página ${previewPage + 1}`}
            />
          ) : (
            !running &&
            !ready && (
              <p className="muted">Atualize a prévia para conferir o resultado antes de aplicar.</p>
            )
          )}
          <p className="muted small">
            Aplicar cria uma alteração que pode ser desfeita. A prévia usa o PDF gerado localmente.
            Marcas e cabeçalhos entram no conteúdo; reabrir o arquivo salvo permite editar esses
            elementos como conteúdo do PDF.
          </p>
        </div>
      </div>
    </Modal>
  );
}
