import { pruneUnreachable } from "@shared/compress";
import {
  addFormField,
  configureField,
  describeFields,
  exportFormData,
  type FieldDefinition,
  type FieldDescription,
  fieldDefinitionSchema,
  fieldValueError,
  importFormData,
  moveFormWidget,
  setFormData,
  setPageTabOrder,
} from "@shared/form-authoring";
import type { ChoiceOption } from "@shared/form-choice";
import { setFormWidgetFont, updateDirtyFormAppearances } from "@shared/form-font";
import {
  pageWidgetTabOrder,
  setCustomWidgetTabOrder,
  type WidgetTabEntry,
} from "@shared/form-tab-order";
import type { DocContent } from "@shared/model";
import { PDFDocument } from "pdf-lib";
import { useEffect, useRef, useState } from "react";
import { buildDoc } from "../lib/document-output";
import { documentText } from "../lib/document-text";
import { finishDraft } from "../lib/editing";
import { inspectFontInWorker } from "../lib/font-inspection";
import { localFonts } from "../lib/fonts";
import { replaceDocumentBytes } from "../lib/structural-edit";
import { type DocState, toast, useApp } from "../state/store";
import { scrollToPage } from "../viewer/Viewer";
import { Modal } from "./Dialogs";
import { FormTabOrderEditor } from "./FormTabOrderEditor";

const freshField = (page: number): FieldDefinition => ({
  name: "",
  label: "",
  kind: "text",
  page,
  box: { x: 40, y: 100, w: 200, h: 24 },
  required: false,
  readOnly: false,
  multiline: false,
  multiselect: false,
  maxLength: 0,
  mask: "none",
  alignment: "left",
  fontSize: 12,
  options: [],
});
interface FormSnapshot {
  bytes: Uint8Array;
  fields: FieldDescription[];
  content: DocContent;
  tabOrder: WidgetTabEntry[];
}
type ChoiceRow = ChoiceOption & { id: string };
export function FormsDialog({ doc }: { doc: DocState }): React.ReactElement {
  const [data, setData] = useState<FormSnapshot | null>(null),
    [field, setField] = useState(() => freshField(doc.currentPage)),
    [selected, setSelected] = useState<string | null>(null),
    [widgetIndex, setWidgetIndex] = useState(0),
    [options, setOptions] = useState(""),
    [choiceRows, setChoiceRows] = useState<ChoiceRow[]>([]),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    [customFont, setCustomFont] = useState<{ name: string; bytes: Uint8Array } | null>(null),
    [proposals, setProposals] = useState<FieldDefinition[]>([]);
  const operationAbort = useRef<AbortController | null>(null);
  useEffect(() => () => operationAbort.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    if (!finishDraft(doc.id)) {
      setError("Corrija o rascunho pendente antes de preparar os campos.");
      return;
    }
    const current = useApp.getState().docs.find((item) => item.id === doc.id);
    if (!current) {
      setError("Documento fechado.");
      return;
    }
    void buildDoc(current, current.content, controller.signal)
      .then(async (bytes) => {
        const document = await PDFDocument.load(bytes, { updateMetadata: false });
        return {
          bytes,
          content: current.content,
          fields: describeFields(document),
          tabOrder: pageWidgetTabOrder(document, doc.currentPage),
        };
      })
      .then((value) => {
        if (
          !controller.signal.aborted &&
          useApp.getState().docs.find((item) => item.id === doc.id)?.content === doc.content
        )
          setData(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Falha ao carregar campos.");
      });
    return () => {
      controller.abort();
    };
  }, [doc.id, doc.content, doc.currentPage]);
  const close = () => {
    operationAbort.current?.abort();
    useApp.setState({ dialog: null });
  };
  const operate = async (
    operation: (document: PDFDocument, font: Uint8Array) => void | Promise<void>,
    options: { preserveAppearances?: boolean } = {},
  ) => {
    if (!data || running || doc.readOnly) return;
    setRunning(true);
    setError("");
    const controller = new AbortController();
    operationAbort.current = controller;
    try {
      const document = await PDFDocument.load(data.bytes, { updateMetadata: false }),
        font = customFont?.bytes ?? (await localFonts()).regular;
      controller.signal.throwIfAborted();
      await operation(document, font);
      if (!options.preserveAppearances) await updateDirtyFormAppearances(document, font);
      await document.flush();
      pruneUnreachable(document);
      await replaceDocumentBytes(
        doc.id,
        data.content,
        await document.save({ updateFieldAppearances: false }),
        { signal: controller.signal },
      );
      setSelected(null);
      setField(freshField(doc.currentPage));
      setOptions("");
      setChoiceRows([]);
      setProposals([]);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "Alteração de formulário não aplicada.",
        );
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  };
  const pick = (value: FieldDescription) => {
    if (value.kind === "unsupported") return;
    setSelected(value.name);
    setWidgetIndex(0);
    setOptions(value.options.join("\n"));
    setChoiceRows(
      (value.choiceOptions ?? []).map((option) => ({ ...option, id: crypto.randomUUID() })),
    );
    setField({
      ...freshField(doc.currentPage),
      ...value,
      kind: value.kind,
      page: value.widgets[0]?.page ?? doc.currentPage,
      box: value.widgets[0]?.box ?? freshField(doc.currentPage).box,
      alignment: value.alignment,
    });
  };
  const detect = async () => {
    setRunning(true);
    setError("");
    try {
      const index = await documentText(doc, new AbortController().signal),
        result: FieldDefinition[] = [];
      for (const page of index.pages) {
        if (page.error) throw new Error(`p. ${page.index + 1}: ${page.error}`);
        let start = -1;
        for (let at = 0; at <= page.glyphs.length; at++) {
          const glyph = page.glyphs[at];
          if (glyph?.text === "_") {
            if (start < 0) start = at;
            continue;
          }
          if (start >= 0 && at - start >= 4) {
            const range = page.glyphs
              .slice(start, at)
              .flatMap((glyph) => (glyph.box ? [glyph.box] : []));
            if (!range.length) {
              start = -1;
              continue;
            }
            const x = Math.min(...range.map((box) => box.x)),
              y = Math.min(...range.map((box) => box.y)),
              right = Math.max(...range.map((box) => box.x + box.w));
            if (
              !data?.fields.some((field) =>
                field.widgets.some(
                  (widget) =>
                    widget.page === page.index &&
                    Math.abs(widget.box.x - x) < 8 &&
                    Math.abs(widget.box.y - y) < 24,
                ),
              )
            )
              result.push({
                ...freshField(page.index),
                name: `campo_${page.index + 1}_${result.length + 1}`,
                label:
                  page.glyphs
                    .slice(Math.max(0, start - 32), start)
                    .map((glyph) => glyph.text)
                    .join("")
                    .trim() || "Campo sugerido",
                box: { x, y: Math.max(0, y - 12), w: Math.max(40, right - x), h: 20 },
              });
          }
          start = -1;
          if (result.length > 500)
            throw new Error("Mais de 500 sugestões. Prepare o documento por partes.");
        }
      }
      setProposals(result);
      if (!result.length)
        toast("Nenhuma linha de preenchimento reconhecida. Adicione os campos manualmente.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Detecção indisponível.");
    } finally {
      setRunning(false);
    }
  };
  return (
    <Modal
      title="Preparar formulário"
      width={920}
      onClose={close}
      allowCancelWhileBusy
      footer={
        <>
          <span className="muted small">
            Campos AcroForm locais · alterações podem ser desfeitas
          </span>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            {running ? "Cancelar operação" : "Fechar"}
          </button>
        </>
      }
    >
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Lendo campos…</p>}
      <div className="preferences-actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={!data || running}
          onClick={() =>
            void operate((document) => setPageTabOrder(document, doc.currentPage, "rows"), {
              preserveAppearances: true,
            })
          }
        >
          Tabular por linhas na página atual
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!data || running}
          onClick={() =>
            void operate((document) => setPageTabOrder(document, doc.currentPage, "columns"), {
              preserveAppearances: true,
            })
          }
        >
          Tabular por colunas na página atual
        </button>
      </div>
      {data && (
        <FormTabOrderEditor
          entries={data.tabOrder}
          page={doc.currentPage}
          running={running || !!doc.readOnly}
          onApply={(ids) =>
            void operate((document) => setCustomWidgetTabOrder(document, doc.currentPage, ids), {
              preserveAppearances: true,
            })
          }
        />
      )}
      <fieldset
        disabled={running || doc.readOnly}
        style={{ padding: 0, border: 0, margin: "12px 0" }}
      >
        <legend>Fonte para editar/criar campos</legend>
        <p className="muted small">
          {customFont?.name ?? "Noto Sans"}. Controles existentes conservam suas aparências até uma
          edição que exija recomposição. A fonte completa fica no PDF para novas digitações; confira
          o preenchimento no leitor de destino.
        </p>
        <div className="preferences-actions">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              const controller = new AbortController();
              operationAbort.current = controller;
              setRunning(true);
              setError("");
              void (async () => {
                const file = await window.api.pickData("font");
                controller.signal.throwIfAborted();
                if (!file) return;
                const font = await inspectFontInWorker(file.bytes, controller.signal);
                controller.signal.throwIfAborted();
                setCustomFont({
                  name: `${font.family} ${font.subfamily}`.trim(),
                  bytes: file.bytes,
                });
              })()
                .catch((failure: unknown) => {
                  if (!controller.signal.aborted)
                    setError(failure instanceof Error ? failure.message : "Falha na fonte.");
                })
                .finally(() => {
                  if (!controller.signal.aborted) setRunning(false);
                });
            }}
          >
            Escolher fonte dos campos…
          </button>
          {customFont && (
            <button type="button" className="btn ghost sm" onClick={() => setCustomFont(null)}>
              Usar Noto Sans nos campos
            </button>
          )}
          <button
            type="button"
            className="btn ghost sm"
            disabled={
              !selected ||
              !["text", "dropdown", "list"].includes(
                data?.fields.find((item) => item.name === selected)?.kind ?? "",
              )
            }
            onClick={() => {
              if (selected)
                void operate((document, bytes) => setFormWidgetFont(document, selected, bytes));
            }}
          >
            Aplicar fonte ao campo selecionado
          </button>
        </div>
      </fieldset>
      <div className="preferences-actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={!data || running}
          onClick={() => void detect()}
        >
          Sugerir campos nas linhas de preenchimento
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!data || running}
          onClick={async () => {
            try {
              const file = await window.api.pickData("formdata");
              if (file) {
                const values = importFormData(
                  new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
                  /\.csv$/i.test(file.name) ? "csv" : "json",
                );
                await operate((document) => setFormData(document, values));
              }
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : "Importação não aplicada.");
            }
          }}
        >
          Importar valores
        </button>
        {(["json", "csv"] as const).map((format) => (
          <button
            type="button"
            key={format}
            className="btn ghost sm"
            disabled={!data || running}
            onClick={async () => {
              if (!data) return;
              setRunning(true);
              try {
                const path = await window.api.saveDataDialog(
                  `${doc.name.replace(/\.pdf$/i, "")}-campos.${format}`,
                );
                if (path)
                  await window.api.writeCopy(
                    path,
                    new TextEncoder().encode(exportFormData(data.fields, format)),
                  );
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Falha ao exportar dados.");
              } finally {
                setRunning(false);
              }
            }}
          >
            Exportar {format.toUpperCase()}
          </button>
        ))}
      </div>
      {proposals.length > 0 && (
        <div className="form-proposals">
          <h3>Revisar {proposals.length} sugestões</h3>
          <p className="muted small">
            Reconhecimento de linhas com sublinhados em texto selecionável. Revise nome, página e
            posição. Digitalizações precisam de OCR.
          </p>
          {proposals.map((proposal, index) => (
            <div
              className="preferences-actions"
              key={`${proposal.page}:${proposal.box.x}:${proposal.box.y}`}
            >
              <span>
                p. {proposal.page + 1} · {proposal.label}
              </span>
              <input
                className="input"
                aria-label={`Nome da sugestão ${index + 1}`}
                value={proposal.name}
                onChange={(event) =>
                  setProposals(
                    proposals.map((item, at) =>
                      at === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setProposals(proposals.filter((_, at) => at !== index))}
              >
                Descartar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn primary sm"
            disabled={running}
            onClick={() =>
              void operate(async (document, font) => {
                for (const proposal of proposals) await addFormField(document, proposal, font);
              })
            }
          >
            Criar campos revisados
          </button>
        </div>
      )}
      <ul className="navigation-list">
        {data?.fields.map((item) => (
          <li key={item.name}>
            <div>
              <strong>{item.label}</strong>
              <p className="muted small">
                {item.name} · {item.kind} ·{" "}
                {item.widgets.map((widget) => widget.page + 1).join(", ")}
                {item.required ? " · obrigatório" : ""}
                {item.readOnly ? " · somente leitura" : ""}
              </p>
              {fieldValueError(item.value, item) && (
                <p className="error-text small">{fieldValueError(item.value, item)}</p>
              )}
            </div>
            <button
              type="button"
              className="btn ghost sm"
              disabled={!item.widgets.length || running}
              onClick={() => {
                close();
                scrollToPage(doc.id, item.widgets[0].page, item.widgets[0].box.y);
              }}
            >
              Mostrar
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={item.kind === "unsupported" || running}
              onClick={() => pick(item)}
            >
              Configurar
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={running}
              onClick={() =>
                void operate((document) =>
                  document.getForm().removeField(document.getForm().getField(item.name)),
                )
              }
            >
              Excluir campo
            </button>
          </li>
        ))}
      </ul>
      <h3>{selected ? `Configurar ${selected}` : "Novo campo"}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const definition = {
            ...field,
            choiceOptions:
              field.kind === "dropdown" || field.kind === "list"
                ? choiceRows.map(({ exportValue, displayValue }) => ({ exportValue, displayValue }))
                : undefined,
            options:
              field.kind === "dropdown" || field.kind === "list"
                ? []
                : options
                    .split(/\r?\n/)
                    .map((option) => option.trim())
                    .filter(Boolean),
          };
          void operate((document, font) => {
            if (!selected)
              return addFormField(document, fieldDefinitionSchema.parse(definition), font);
            configureField(document.getForm().getField(selected), definition);
            const original = data?.fields.find((item) => item.name === selected)?.widgets[
              widgetIndex
            ];
            if (
              original &&
              (original.page !== definition.page ||
                JSON.stringify(original.box) !== JSON.stringify(definition.box))
            )
              moveFormWidget(document, selected, widgetIndex, definition.page, definition.box);
          });
        }}
      >
        <div className="preferences-grid">
          <label className="local-field">
            Nome interno
            <input
              className="input"
              value={field.name}
              disabled={!!selected}
              onChange={(event) => setField({ ...field, name: event.target.value })}
              required
            />
          </label>
          <label className="local-field">
            Rótulo acessível
            <input
              className="input"
              value={field.label}
              onChange={(event) => setField({ ...field, label: event.target.value })}
            />
          </label>
          <label className="local-field">
            Tipo
            <select
              className="input"
              value={field.kind}
              disabled={!!selected}
              onChange={(event) => {
                const kind = fieldDefinitionSchema.shape.kind.parse(event.target.value);
                setField({ ...field, kind });
              }}
            >
              {(
                [
                  ["text", "Texto"],
                  ["checkbox", "Caixa de seleção"],
                  ["radio", "Grupo de opções"],
                  ["dropdown", "Lista suspensa"],
                  ["list", "Lista de seleção"],
                ] as const
              ).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="local-field">
            Página
            <input
              className="input"
              type="number"
              min={1}
              max={doc.content.pages.length}
              value={field.page + 1}
              onChange={(event) => setField({ ...field, page: event.target.valueAsNumber - 1 })}
            />
          </label>
        </div>
        {selected && (
          <label className="local-field">
            Aparição do campo
            <select
              className="input"
              value={widgetIndex}
              onChange={(event) => {
                const index = Number(event.target.value),
                  widget = data?.fields.find((item) => item.name === selected)?.widgets[index];
                if (widget) {
                  setWidgetIndex(index);
                  setField({ ...field, page: widget.page, box: widget.box });
                }
              }}
            >
              {data?.fields
                .find((item) => item.name === selected)
                ?.widgets.map((widget, index) => (
                  <option key={`${widget.page}:${widget.box.x}:${widget.box.y}`} value={index}>
                    p. {widget.page + 1} · x {widget.box.x.toFixed(1)}, y {widget.box.y.toFixed(1)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="preferences-grid">
          {(["x", "y", "w", "h"] as const).map((key) => (
            <label className="local-field" key={key}>
              {{ x: "Esquerda (pt)", y: "Topo (pt)", w: "Largura (pt)", h: "Altura (pt)" }[key]}
              <input
                className="input"
                type="number"
                min={key === "w" || key === "h" ? 1 : 0}
                step="any"
                value={field.box[key]}
                onChange={(event) =>
                  setField({ ...field, box: { ...field.box, [key]: event.target.valueAsNumber } })
                }
              />
            </label>
          ))}
        </div>
        <div className="preferences-actions">
          {(
            [
              ["required", "Obrigatório"],
              ["readOnly", "Somente leitura"],
              ["multiline", "Várias linhas"],
              ["multiselect", "Seleção múltipla"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={field[key]}
                onChange={(event) => setField({ ...field, [key]: event.target.checked })}
              />{" "}
              {label}
            </label>
          ))}
        </div>
        {field.kind === "text" && (
          <div className="preferences-grid">
            <label className="local-field">
              Máscara local
              <select
                className="input"
                value={field.mask}
                onChange={(event) =>
                  setField({
                    ...field,
                    mask: fieldDefinitionSchema.shape.mask.parse(event.target.value),
                  })
                }
              >
                {(["none", "cpf", "cep", "phone", "date", "email"] as const).map((mask) => (
                  <option key={mask} value={mask}>
                    {
                      {
                        none: "Sem máscara",
                        cpf: "CPF (formato)",
                        cep: "CEP",
                        phone: "Telefone",
                        date: "Data dd/mm/aaaa",
                        email: "E-mail",
                      }[mask]
                    }
                  </option>
                ))}
              </select>
            </label>
            <label className="local-field">
              Máximo de caracteres (0 = livre)
              <input
                className="input"
                type="number"
                min={0}
                max={100000}
                value={field.maxLength}
                onChange={(event) => setField({ ...field, maxLength: event.target.valueAsNumber })}
              />
            </label>
            <label className="local-field">
              Alinhamento
              <select
                className="input"
                value={field.alignment}
                onChange={(event) =>
                  setField({
                    ...field,
                    alignment: fieldDefinitionSchema.shape.alignment.parse(event.target.value),
                  })
                }
              >
                <option value="left">Esquerda</option>
                <option value="center">Centro</option>
                <option value="right">Direita</option>
              </select>
            </label>
          </div>
        )}
        {field.kind === "radio" && (
          <label className="local-field">
            Opções (uma por linha)
            <textarea
              className="input"
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              rows={4}
            />
          </label>
        )}
        {(field.kind === "dropdown" || field.kind === "list") && (
          <fieldset disabled={running}>
            <legend>Opções do campo</legend>
            <p className="muted small">
              O rótulo aparece no documento; o valor interno é usado nos dados exportados.
            </p>
            {choiceRows.map((option, index) => (
              <div className="preferences-grid" key={option.id}>
                <label className="local-field">
                  Rótulo da opção {index + 1}
                  <input
                    className="input"
                    value={option.displayValue}
                    maxLength={1000}
                    required
                    onChange={(event) =>
                      setChoiceRows((current) =>
                        current.map((row) =>
                          row.id === option.id ? { ...row, displayValue: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label className="local-field">
                  Valor interno da opção {index + 1}
                  <input
                    className="input"
                    value={option.exportValue}
                    maxLength={1000}
                    required
                    onChange={(event) =>
                      setChoiceRows((current) =>
                        current.map((row) =>
                          row.id === option.id ? { ...row, exportValue: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={`Excluir opção ${index + 1}`}
                  onClick={() =>
                    setChoiceRows((current) => current.filter((row) => row.id !== option.id))
                  }
                >
                  Excluir opção
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn ghost sm"
              disabled={choiceRows.length >= 1000}
              onClick={() =>
                setChoiceRows((current) => [
                  ...current,
                  { id: crypto.randomUUID(), displayValue: "", exportValue: "" },
                ])
              }
            >
              Adicionar opção
            </button>
          </fieldset>
        )}
        <p className="muted small">
          Máscaras funcionam no EdiPDF e não inserem JavaScript. Campos, valores, limites e flags
          obrigatórios são gravados no PDF.
        </p>
        <div className="preferences-actions">
          <button type="submit" className="btn primary" disabled={!data || running}>
            {selected ? "Aplicar configuração" : "Adicionar campo"}
          </button>
          {selected && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSelected(null);
                setField(freshField(doc.currentPage));
                setOptions("");
                setChoiceRows([]);
              }}
            >
              Novo campo
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
