import { type Annot, type FontKey, type TextAnnot, viewSize } from "@shared/model";
import {
  ArrowRight,
  Bold,
  Combine,
  FileArchive,
  FileDigit,
  FileUp,
  Hash,
  ImageDown,
  Info,
  Italic,
  LayoutGrid,
  MessageSquare,
  Minus,
  Plus,
  SplitSquareHorizontal,
  Stamp,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { insertFromFiles } from "../lib/actions";
import { updateDraft } from "../lib/editing";
import { isDocumentShortcut } from "../lib/keyboard";
import { openPageDecorations } from "../lib/page-decorations";
import { pageInfo } from "../lib/pdf";
import {
  type DocState,
  patchDoc,
  removeAnnot,
  type Tool,
  type ToolStyle,
  updateAnnot,
  useApp,
} from "../state/store";
import { scrollToPage } from "../viewer/Viewer";

const INK_COLORS = ["#111111", "#1D4ED8", "#DC2626", "#16A34A", "#F59E0B", "#7C3AED", "#FFFFFF"];
const MARK_COLORS = ["#FFE45C", "#A7F3A0", "#FDA4CF", "#93C5FD", "#FDBA74"];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label">{label}</legend>
      {children}
    </fieldset>
  );
}

function Colors({
  value,
  onChange,
  colors = INK_COLORS,
  allowNone,
}: {
  value: string | null;
  onChange: (c: string | null) => void;
  colors?: string[];
  allowNone?: boolean;
}): React.ReactElement {
  const custom = value && !colors.includes(value.toUpperCase());
  return (
    <div className="swatches">
      {allowNone && (
        <button
          type="button"
          className={`swatch none${value === null ? " on" : ""}`}
          title="Nenhuma"
          onClick={() => onChange(null)}
        />
      )}
      {colors.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch${value?.toUpperCase() === c ? " on" : ""}`}
          style={{ background: c }}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
      <label
        className={`swatch custom${custom ? " on" : ""}`}
        title="Outra cor"
        style={custom ? { background: value! } : undefined}
      >
        <input
          type="color"
          value={value ?? "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      </label>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}): React.ReactElement {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const set = (v: number): void => {
    onChange(Math.round(Math.max(min, Math.min(max, v)) * 10) / 10);
  };
  return (
    <div className="stepper">
      <button type="button" className="icon-btn sm" onClick={() => set(value - step)}>
        <Minus size={13} />
      </button>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => set(Number(text.replace(",", ".")) || value)}
        onKeyDown={(e) => {
          if (!isDocumentShortcut(e)) e.stopPropagation();
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="stepper-unit">{unit}</span>
      <button type="button" className="icon-btn sm" onClick={() => set(value + step)}>
        <Plus size={13} />
      </button>
    </div>
  );
}

/** Range input that only reports when the user lets go, so a drag is one undo step. */
function Slider({
  value,
  onCommit,
  min = 0.1,
  max = 1,
  step = 0.05,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}): React.ReactElement {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => onCommit(v)}
        onKeyUp={() => onCommit(v)}
      />
      <span>{Math.round(v * 100)}%</span>
    </div>
  );
}

type TextLike = Pick<TextAnnot, "font" | "size" | "color" | "bold" | "italic">;

function TextProps({
  value,
  onChange,
}: {
  value: TextLike;
  onChange: (p: Partial<TextLike>) => void;
}): React.ReactElement {
  return (
    <>
      <Field label="Fonte">
        <select
          className="select"
          value={value.font}
          onChange={(e) => onChange({ font: e.target.value as FontKey })}
        >
          <option value="helvetica">Helvetica (sem serifa)</option>
          <option value="times">Times (com serifa)</option>
          <option value="courier">Courier (monoespaçada)</option>
        </select>
      </Field>
      <Field label="Tamanho">
        <Stepper
          value={value.size}
          min={4}
          max={144}
          onChange={(size) => onChange({ size })}
          unit="pt"
        />
      </Field>
      <Field label="Estilo">
        <div className="seg">
          <button
            type="button"
            className={`seg-btn${value.bold ? " on" : ""}`}
            title="Negrito"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange({ bold: !value.bold })}
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            className={`seg-btn${value.italic ? " on" : ""}`}
            title="Itálico"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange({ italic: !value.italic })}
          >
            <Italic size={14} />
          </button>
        </div>
      </Field>
      <Field label="Cor">
        <Colors value={value.color} onChange={(color) => color && onChange({ color })} />
      </Field>
    </>
  );
}

const KIND_LABEL: Record<Annot["kind"], string> = {
  paragraph: "Caixa de texto",
  text: "Texto",
  rect: "Retângulo",
  ellipse: "Elipse",
  line: "Linha",
  arrow: "Seta",
  ink: "Desenho",
  highlight: "Realce",
  underline: "Sublinhado",
  strike: "Tachado",
  image: "Imagem",
  note: "Comentário",
};

function AnnotProps({ doc, a }: { doc: DocState; a: Annot }): React.ReactElement {
  const set = (p: Partial<Annot>): void => {
    updateAnnot(doc.id, a.id, p);
  };
  const whiteout = a.kind === "rect" && !a.stroke && a.fill?.toUpperCase() === "#FFFFFF";
  if (a.locked)
    return (
      <>
        <h3 className="panel-title">Anotação bloqueada</h3>
        <p className="panel-hint">Desbloqueie para editar, mover ou excluir.</p>
        <button type="button" className="btn ghost" onClick={() => set({ locked: false })}>
          Desbloquear anotação
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => useApp.setState({ dialog: { kind: "annotations" } })}
        >
          Anotações e comentários
        </button>
      </>
    );
  return (
    <>
      <h3 className="panel-title">
        {whiteout
          ? "Cobertura"
          : a.kind === "image" && a.signature
            ? "Assinatura"
            : KIND_LABEL[a.kind]}
      </h3>
      {a.kind === "text" && <TextProps value={a} onChange={set} />}
      {a.kind === "paragraph" && (
        <>
          <p className="panel-hint">
            Arraste as alças para ajustar a caixa. Na janela de edição, ajuste quebra, alinhamento e
            listas.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => useApp.setState({ dialog: { kind: "paragraph", annotId: a.id } })}
          >
            Editar caixa de texto
          </button>
        </>
      )}
      {(a.kind === "rect" || a.kind === "ellipse") && (
        <>
          <Field label="Contorno">
            <Colors value={a.stroke} allowNone onChange={(stroke) => set({ stroke })} />
          </Field>
          <Field label="Preenchimento">
            <Colors value={a.fill} allowNone onChange={(fill) => set({ fill })} />
          </Field>
          {a.stroke && (
            <Field label="Espessura">
              <Stepper
                value={a.width}
                min={0.5}
                max={20}
                step={0.5}
                unit="pt"
                onChange={(width) => set({ width })}
              />
            </Field>
          )}
        </>
      )}
      {(a.kind === "line" || a.kind === "arrow" || a.kind === "ink") && (
        <>
          <Field label="Cor">
            <Colors value={a.stroke} onChange={(stroke) => stroke && set({ stroke })} />
          </Field>
          <Field label="Espessura">
            <Stepper
              value={a.width}
              min={0.5}
              max={20}
              step={0.5}
              unit="pt"
              onChange={(width) => set({ width })}
            />
          </Field>
        </>
      )}
      {(a.kind === "line" || a.kind === "arrow") && (
        <Field label="Ponta">
          <div className="seg">
            <button
              type="button"
              className={`seg-btn wide${a.kind === "line" ? " on" : ""}`}
              onClick={() => set({ kind: "line" })}
            >
              <Minus size={14} /> Linha
            </button>
            <button
              type="button"
              className={`seg-btn wide${a.kind === "arrow" ? " on" : ""}`}
              onClick={() => set({ kind: "arrow" })}
            >
              <ArrowRight size={14} /> Seta
            </button>
          </div>
        </Field>
      )}
      {(a.kind === "highlight" || a.kind === "underline" || a.kind === "strike") && (
        <Field label="Cor">
          <Colors
            value={a.color}
            colors={a.kind === "highlight" ? MARK_COLORS : INK_COLORS}
            onChange={(color) => color && set({ color })}
          />
        </Field>
      )}
      {a.kind === "note" && (
        <>
          <Field label="Texto">
            <p className="note-preview">{a.text || <span className="muted">Sem texto</span>}</p>
          </Field>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => patchDoc(doc.id, { openNote: a.id })}
          >
            Editar comentário
          </button>
        </>
      )}
      {a.kind !== "note" && !whiteout && (
        <Field label="Opacidade">
          <Slider value={a.opacity ?? 1} onCommit={(opacity) => set({ opacity })} />
        </Field>
      )}
      <div className="panel-spacer" />
      <div className="preferences-actions">
        <button type="button" className="btn ghost sm" onClick={() => set({ locked: true })}>
          Bloquear anotação
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => useApp.setState({ dialog: { kind: "annotations" } })}
        >
          Gerenciar anotações
        </button>
      </div>
      <p className="panel-hint">
        {a.group ? "Alt + clique seleciona um item dentro do grupo. " : ""}
        {a.kind === "text" ? "Clique duas vezes para editar o texto. " : ""}Arraste para mover ·
        Delete para excluir · setas para ajustar
      </p>
      <button
        type="button"
        className="btn danger-outline"
        onClick={() => removeAnnot(doc.id, a.id)}
      >
        <Trash2 size={14} /> Excluir
      </button>
    </>
  );
}

const TOOL_TITLE: Partial<Record<Tool, string>> = {
  text: "Adicionar texto",
  ink: "Desenhar",
  rect: "Retângulo",
  ellipse: "Elipse",
  line: "Linha",
  arrow: "Seta",
  highlight: "Realçar texto",
  underline: "Sublinhar texto",
  strike: "Tachar texto",
  note: "Comentário",
  whiteout: "Cobrir",
  edittext: "Editar texto",
  hand: "Mão",
};

const TOOL_HINT: Partial<Record<Tool, string>> = {
  text: "Clique na página para escrever. Ctrl+Enter ou Esc termina.",
  edittext:
    "Clique no texto do PDF para abrir o editor de conteúdo original. A alteração modifica o objeto de texto no arquivo.",
  ink: "Arraste para desenhar à mão livre.",
  rect: "Arraste para desenhar. Shift mantém quadrado.",
  ellipse: "Arraste para desenhar. Shift mantém círculo.",
  line: "Arraste para desenhar. Shift prende em 45°.",
  arrow: "Arraste para desenhar. Shift prende em 45°.",
  highlight: "Selecione um trecho de texto para realçar.",
  underline: "Selecione um trecho de texto para sublinhar.",
  strike: "Selecione um trecho de texto para tachar.",
  note: "Clique na página para deixar um comentário.",
  whiteout:
    "Adiciona uma cobertura visual branca. O conteúdo original permanece no arquivo e pode ser extraído. Esta ferramenta não remove dados confidenciais.",
  hand: "Arraste para navegar pelo documento.",
};

function ToolProps({ tool }: { tool: Tool }): React.ReactElement {
  const style = useApp((s) => s.style);
  const set = <K extends keyof ToolStyle>(k: K, p: Partial<ToolStyle[K]>): void => {
    useApp.setState((s) => ({ style: { ...s.style, [k]: { ...s.style[k], ...p } } }));
  };
  return (
    <>
      <h3 className="panel-title">{TOOL_TITLE[tool]}</h3>
      <p className="panel-hint top">{TOOL_HINT[tool]}</p>
      {tool === "text" && <TextProps value={style.text} onChange={(p) => set("text", p)} />}
      {tool === "ink" && (
        <>
          <Field label="Cor">
            <Colors
              value={style.ink.stroke}
              onChange={(stroke) => stroke && set("ink", { stroke })}
            />
          </Field>
          <Field label="Espessura">
            <Stepper
              value={style.ink.width}
              min={0.5}
              max={20}
              step={0.5}
              unit="pt"
              onChange={(width) => set("ink", { width })}
            />
          </Field>
          <Field label="Opacidade">
            <Slider value={style.ink.opacity} onCommit={(opacity) => set("ink", { opacity })} />
          </Field>
        </>
      )}
      {(tool === "rect" || tool === "ellipse") && (
        <>
          <Field label="Contorno">
            <Colors
              value={style.shape.stroke}
              allowNone
              onChange={(stroke) => set("shape", { stroke })}
            />
          </Field>
          <Field label="Preenchimento">
            <Colors
              value={style.shape.fill}
              allowNone
              onChange={(fill) => set("shape", { fill })}
            />
          </Field>
          <Field label="Espessura">
            <Stepper
              value={style.shape.width}
              min={0.5}
              max={20}
              step={0.5}
              unit="pt"
              onChange={(width) => set("shape", { width })}
            />
          </Field>
        </>
      )}
      {(tool === "line" || tool === "arrow") && (
        <>
          <Field label="Cor">
            <Colors
              value={style.line.stroke}
              onChange={(stroke) => stroke && set("line", { stroke })}
            />
          </Field>
          <Field label="Espessura">
            <Stepper
              value={style.line.width}
              min={0.5}
              max={20}
              step={0.5}
              unit="pt"
              onChange={(width) => set("line", { width })}
            />
          </Field>
        </>
      )}
      {(tool === "highlight" || tool === "underline" || tool === "strike") && (
        <Field label="Cor">
          <Colors
            value={style.markup[tool]}
            colors={tool === "highlight" ? MARK_COLORS : INK_COLORS}
            onChange={(c) => c && set("markup", { [tool]: c })}
          />
        </Field>
      )}
      {tool === "note" && (
        <Field label="Cor">
          <Colors
            value={style.note.color}
            colors={["#F59E0B", "#FACC15", "#22C55E", "#3B82F6", "#EC4899"]}
            onChange={(color) => color && set("note", { color })}
          />
        </Field>
      )}
    </>
  );
}

const cm = (pt: number): string =>
  ((pt / 72) * 2.54).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function DocPanel({ doc }: { doc: DocState }): React.ReactElement {
  const page = doc.content.pages[doc.currentPage];
  const size = page ? viewSize(page, pageInfo(page)) : null;
  const open = (
    kind:
      | "combine"
      | "watermark"
      | "pageNumbers"
      | "split"
      | "exportImages"
      | "properties"
      | "insertBlank",
  ): void => {
    if (kind === "watermark" || kind === "pageNumbers") {
      openPageDecorations(kind);
      return;
    }
    useApp.setState({ dialog: { kind } });
  };
  const annots = doc.content.annots;
  const tools: { icon: React.ReactNode; label: string; run: () => void; on?: boolean }[] = [
    {
      icon: <MessageSquare size={15} />,
      label: "Anotações e comentários",
      run: () => useApp.setState({ dialog: { kind: "annotations" } }),
    },
    {
      icon: <FileDigit size={15} />,
      label: "Preparar formulário",
      run: () => useApp.setState({ dialog: { kind: "forms" } }),
    },
    {
      icon: <FileUp size={15} />,
      label: "Marcadores, links e anexos",
      run: () => useApp.setState({ dialog: { kind: "navigation" } }),
    },
    {
      icon: <LayoutGrid size={15} />,
      label: "Organizar páginas",
      run: () => patchDoc(doc.id, { view: "organize" }),
    },
    {
      icon: <FileUp size={15} />,
      label: "Inserir páginas de arquivo",
      run: () => void insertFromFiles(doc.id, doc.currentPage + 1),
    },
    { icon: <Combine size={15} />, label: "Juntar PDFs", run: () => open("combine") },
    {
      icon: <FileArchive size={15} />,
      label: "Compactar PDF",
      run: () => useApp.setState({ dialog: { kind: "compress", mode: "doc" } }),
    },
    {
      icon: <Stamp size={15} />,
      label: "Marca d'água",
      run: () => open("watermark"),
      on: !!doc.content.watermark,
    },
    {
      icon: <Hash size={15} />,
      label: "Numerar páginas",
      run: () => open("pageNumbers"),
      on: !!doc.content.pageNumbers,
    },
    {
      icon: <SplitSquareHorizontal size={15} />,
      label: "Dividir documento",
      run: () => open("split"),
    },
    {
      icon: <ImageDown size={15} />,
      label: "Exportar como imagens",
      run: () => open("exportImages"),
    },
    { icon: <Info size={15} />, label: "Propriedades do documento", run: () => open("properties") },
  ];
  return (
    <>
      <h3 className="panel-title">Documento</h3>
      <dl className="doc-facts">
        <dt>Páginas</dt>
        <dd>{doc.content.pages.length}</dd>
        {size && (
          <>
            <dt>Tamanho</dt>
            <dd>
              {cm(size.w)} × {cm(size.h)} cm
            </dd>
          </>
        )}
        {doc.path && (
          <>
            <dt>Local</dt>
            <dd className="path" title={doc.path}>
              {doc.path}
            </dd>
          </>
        )}
      </dl>
      {doc.hasForms && (
        <p className="panel-note">
          <FileDigit size={14} />{" "}
          {doc.readOnly
            ? "Este PDF contém campos em modo de leitura."
            : "Este PDF tem campos de formulário. Clique neles na página para preencher."}
        </p>
      )}
      <h4 className="panel-sub">Ferramentas</h4>
      <div className="tool-list">
        {tools.map((t) => (
          <button
            type="button"
            key={t.label}
            className="tool-row"
            disabled={
              doc.readOnly &&
              !["Juntar PDFs", "Marcadores, links e anexos", "Propriedades do documento"].includes(
                t.label,
              )
            }
            onClick={t.run}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.on && <span className="pill">ativo</span>}
          </button>
        ))}
      </div>
      <h4 className="panel-sub">
        Anotações <span className="muted">{annots.length || ""}</span>
      </h4>
      {annots.length === 0 ? (
        <p className="panel-hint">
          Nenhuma anotação ainda. Use as ferramentas da barra para adicionar texto, realces,
          desenhos e comentários.
        </p>
      ) : (
        <div className="annot-list">
          {annots.map((a) => {
            const pi = doc.content.pages.findIndex((p) => p.id === a.page);
            return (
              <button
                type="button"
                key={a.id}
                className="annot-row"
                onClick={() => {
                  useApp.setState({ tool: "select" });
                  patchDoc(doc.id, { selectedAnnot: a.id });
                  scrollToPage(doc.id, pi, "y" in a ? a.y : "y1" in a ? a.y1 : undefined);
                }}
              >
                {a.kind === "note" ? (
                  <MessageSquare size={13} />
                ) : (
                  <span
                    className="annot-dot"
                    style={{
                      background:
                        "color" in a ? a.color : "stroke" in a && a.stroke ? a.stroke : "#888",
                    }}
                  />
                )}
                <span className="annot-row-label">
                  {a.kind === "text" || a.kind === "note"
                    ? a.text || KIND_LABEL[a.kind]
                    : KIND_LABEL[a.kind]}
                </span>
                <span className="muted">p. {pi + 1}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export function PropsPanel({ doc }: { doc: DocState }): React.ReactElement {
  const tool = useApp((s) => s.tool);
  const selected = doc.content.annots.find((a) => a.id === doc.selectedAnnot);
  let body: React.ReactNode;
  if (doc.draft) {
    body = (
      <>
        <h3 className="panel-title">{doc.draft.cover ? "Editando texto do PDF" : "Texto"}</h3>
        <TextProps value={doc.draft.annot} onChange={(p) => updateDraft(doc.id, p)} />
        <div className="panel-spacer" />
        <p className="panel-hint">Ctrl+Enter ou Esc para concluir · clique fora para aplicar</p>
      </>
    );
  } else if (selected && tool === "select") body = <AnnotProps doc={doc} a={selected} />;
  else if (tool !== "select" && TOOL_TITLE[tool]) body = <ToolProps tool={tool} />;
  else body = <DocPanel doc={doc} />;
  return <aside className="panel">{body}</aside>;
}
