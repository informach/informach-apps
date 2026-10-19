import type { EngineOperation, PdfInspection } from "@shared/engine-contracts";
import { securitySchema } from "@shared/engine-contracts";
import { croppedImageMatrix, imageCropSchema } from "@shared/image-crop";
import { pdfToView, viewToPdf } from "@shared/model";
import { changePageGeometry } from "@shared/page-geometry";
import type { SanitizeOptions } from "@shared/pdf-sanitize";
import { validateRasterImage } from "@shared/raster-image";
import { useEffect, useRef, useState } from "react";
import { buildDoc } from "../lib/actions";
import { finishDraft } from "../lib/editing";
import { chooseFiles } from "../lib/file-picker";
import { inspectFontInWorker } from "../lib/font-inspection";
import { localFonts } from "../lib/fonts";
import { runEngine } from "../lib/local-engine";
import { loadSource, releaseSource, renderToDataUrl } from "../lib/pdf";
import { replaceDocumentBytes } from "../lib/structural-edit";
import { type DialogSpec, type DocState, toast, useApp } from "../state/store";
import { Modal } from "./Dialogs";

type Spec = Extract<DialogSpec, { kind: "localTools" }>;
const titles = {
  content: "Editar conteúdo do PDF",
  redact: "Remover conteúdo de forma permanente",
  geometry: "Recortar e redimensionar",
  security: "Proteger uma cópia por senha",
  sanitize: "Sanitizar documento",
};
const objectTypes: Record<number, string> = {
  1: "Texto",
  2: "Desenho",
  3: "Imagem",
  4: "Gradiente",
  5: "Grupo de conteúdo",
};
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Falha na operação local.";

export function LocalToolsDialog({ doc, spec }: { doc: DocState; spec: Spec }): React.ReactElement {
  const [prepared, setPrepared] = useState<{
    bytes: Uint8Array;
    content: DocState["content"];
    inspection: PdfInspection;
    signatures: number;
    preview: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [pageIndex, setPageIndex] = useState(spec.page ?? doc.currentPage);
  const [selected, setSelected] = useState(0);
  const [text, setText] = useState("");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [customFont, setCustomFont] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [factor, setFactor] = useState(1);
  const [angle, setAngle] = useState(0);
  const [box, setBox] = useState({ x: 30, y: 30, w: 150, h: 50 });
  const [cropMode, setCropMode] = useState(false);
  const [imageCrop, setImageCrop] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const normalizedImageCrop = {
    x: imageCrop.x / 100,
    y: imageCrop.y / 100,
    w: imageCrop.w / 100,
    h: imageCrop.h / 100,
  };
  const validImageCrop = imageCropSchema.safeParse(normalizedImageCrop);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [owner, setOwner] = useState("");
  const [permissions, setPermissions] = useState({
    print: true,
    copy: true,
    modify: true,
    fill: true,
  });
  const [sanitization, setSanitization] = useState<SanitizeOptions>({
    metadata: true,
    attachments: true,
    comments: false,
    activeContent: true,
    hiddenData: true,
    flattenForms: false,
  });
  const controller = useRef<AbortController | null>(null);
  const scopePage = spec.occurrence === undefined ? pageIndex : 0;
  const page = prepared?.inspection.pages[scopePage];
  const object = page?.objects.find((item) => item.index === selected);
  const rotation = page?.rotation;
  const r = rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;
  const crop = page
    ? {
        x: page.crop.left,
        y: page.crop.bottom,
        w: page.crop.right - page.crop.left,
        h: page.crop.top - page.crop.bottom,
      }
    : null;
  const W = crop ? (r % 180 ? crop.h : crop.w) : 1;
  const H = crop ? (r % 180 ? crop.w : crop.h) : 1;

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    let live = true;
    setPrepared(null);
    setError("");
    void (async () => {
      if (!finishDraft(doc.id))
        throw new Error(
          "Corrija ou descarte o rascunho pendente antes de editar o conteúdo original.",
        );
      const current = useApp.getState().docs.find((d) => d.id === doc.id);
      if (!current) throw new Error("Documento fechado.");
      const bytes = await buildDoc(current, current.content, abort.signal);
      if (spec.occurrence !== undefined && spec.mode !== "content")
        throw new Error("Abra o grupo pelo editor de conteúdo.");
      const group =
        spec.occurrence === undefined
          ? null
          : await runEngine(
              { kind: "inspectForm", bytes, page: pageIndex, occurrence: spec.occurrence },
              abort.signal,
            );
      const inspection =
        group?.inspection ?? (await runEngine({ kind: "inspect", bytes }, abort.signal));
      const src = await loadSource(
        group?.bytes ?? bytes,
        current.name,
        () => Promise.resolve(null),
        {
          output: true,
        },
      );
      let preview: string;
      try {
        preview = await renderToDataUrl(
          { id: "preview", src: src.id, index: scopePage, rotation: 0 },
          600,
        );
      } finally {
        releaseSource(src.id);
      }
      if (!live) return;
      const objects = inspection.pages[scopePage]?.objects ?? [];
      const initial =
        objects.find(
          (item) =>
            spec.text && (item.text.includes(spec.text.trim()) || spec.text.includes(item.text)),
        ) ?? objects[0];
      setSelected(initial?.index ?? 0);
      setText(initial?.text ?? "");
      setDx(0);
      setDy(0);
      setFactor(1);
      setAngle(0);
      setBold(false);
      setItalic(false);
      setCustomFont(null);
      setPrepared({
        bytes,
        content: current.content,
        inspection,
        signatures: group?.sourceSignatures ?? inspection.signatures,
        preview,
      });
    })().catch((failure) => {
      if (live && !abort.signal.aborted) setError(errorMessage(failure));
    });
    return () => {
      live = false;
      abort.abort();
    };
  }, [doc.id, pageIndex, spec.text, spec.mode, spec.occurrence, scopePage]);

  const close = () => {
    controller.current?.abort();
    useApp.setState({ dialog: null });
  };
  const execute = async (
    kind: "text" | "delete" | "transform" | "image" | "cropImage" | "extract" | "main",
  ) => {
    if (!prepared || running) return;
    setRunning(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    useApp.setState({ busy: "Processando PDF localmente…" });
    try {
      if (prepared.signatures > 0) {
        const choice = await window.api.message({
          type: "warning",
          title: "Documento com assinatura existente",
          message: "Alterar este PDF pode invalidar assinaturas existentes.",
          detail:
            "O EdiPDF não verifica certificados. Preserve o original e revise o resultado como uma cópia.",
          buttons: ["Continuar na cópia", "Cancelar"],
        });
        if (choice !== 0) return;
      }
      let result: Uint8Array;
      if (kind === "extract") {
        if (!object) throw new Error("Escolha uma imagem.");
        const image = await runEngine(
          {
            kind: "extractImage",
            bytes: prepared.bytes,
            page: pageIndex,
            object: object.index,
            occurrence: spec.occurrence,
          },
          abort.signal,
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a imagem.");
        context.putImageData(
          new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height),
          0,
          0,
        );
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error("Não foi possível exportar a imagem.")),
            "image/png",
          ),
        );
        const path = await window.api.saveDialog(
          `imagem-p${pageIndex + 1}-${object.index + 1}.png`,
          "png",
        );
        abort.signal.throwIfAborted();
        if (path) {
          await window.api.writeCopy(path, new Uint8Array(await blob.arrayBuffer()));
          toast("Imagem extraída em PNG.", { tone: "ok" });
        }
        return;
      }
      if (spec.mode === "security") {
        if (password !== confirmation) throw new Error("A confirmação da senha não corresponde.");
        const security = securitySchema.safeParse({ user: password, owner, ...permissions });
        if (!security.success)
          throw new Error(security.error.issues.map((issue) => issue.message).join("\n"));
        result = await runEngine(
          {
            kind: "encrypt",
            bytes: prepared.bytes,
            security: security.data,
          },
          abort.signal,
        );
        abort.signal.throwIfAborted();
        const path = await window.api.saveDialog(
          `${doc.name.replace(/\.pdf$/i, "")} (protegido).pdf`,
        );
        if (!path) return;
        abort.signal.throwIfAborted();
        await window.api.writeCopy(path, result);
        toast("Cópia protegida salva com criptografia AES-256.", { tone: "ok" });
        close();
        return;
      }
      if (kind === "cropImage") {
        if (!object) throw new Error("Escolha uma imagem.");
        result = await runEngine(
          {
            kind: "cropImage",
            occurrence: spec.occurrence,
            bytes: prepared.bytes,
            page: pageIndex,
            object: object.index,
            crop: imageCropSchema.parse(normalizedImageCrop),
          },
          abort.signal,
        );
      } else if (spec.mode === "sanitize")
        result = await runEngine(
          { kind: "sanitize", bytes: prepared.bytes, options: sanitization },
          abort.signal,
        );
      else if (spec.mode === "geometry")
        result = await changePageGeometry(
          prepared.bytes,
          pageIndex,
          cropMode ? { kind: "crop", box } : { kind: "scale", factor },
        );
      else {
        if (!page || !crop) throw new Error("Página indisponível.");
        let operation: EngineOperation;
        if (spec.mode === "redact") {
          if (
            ![box.x, box.y, box.w, box.h].every(Number.isFinite) ||
            box.x < 0 ||
            box.y < 0 ||
            box.w <= 0 ||
            box.h <= 0 ||
            box.x + box.w > W ||
            box.y + box.h > H
          )
            throw new Error("A área precisa estar dentro da página.");
          const a = viewToPdf(r, crop, box.x, box.y),
            b = viewToPdf(r, crop, box.x + box.w, box.y + box.h);
          operation = {
            kind: "redact",
            page: pageIndex,
            rect: {
              left: Math.min(a[0], b[0]),
              bottom: Math.min(a[1], b[1]),
              right: Math.max(a[0], b[0]),
              top: Math.max(a[1], b[1]),
            },
          };
        } else {
          if (!object) throw new Error("Escolha um objeto.");
          if (kind === "text") {
            const fonts = await localFonts();
            operation = {
              kind: "text",
              page: pageIndex,
              object: object.index,
              text,
              font:
                customFont?.bytes ??
                (bold
                  ? italic
                    ? fonts.boldItalic
                    : fonts.bold
                  : italic
                    ? fonts.italic
                    : fonts.regular),
            };
          } else if (kind === "image") {
            const [file] = await chooseFiles({
              images: true,
              multi: false,
              title: "Escolher imagem substituta",
            });
            if (!file) return;
            if (!/\.(png|jpe?g)$/i.test(file.name))
              throw new Error("Escolha uma imagem PNG ou JPG.");
            validateRasterImage(file.bytes, /\.png$/i.test(file.name) ? "png" : "jpg");
            const bitmap = await createImageBitmap(new Blob([new Uint8Array(file.bytes)]));
            try {
              if (bitmap.width * bitmap.height > 50_000_000)
                throw new Error("Escolha uma imagem de até 50 megapixels.");
              const canvas = document.createElement("canvas");
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Não foi possível preparar a imagem.");
              context.drawImage(bitmap, 0, 0);
              operation = {
                kind: "image",
                page: pageIndex,
                object: object.index,
                width: bitmap.width,
                height: bitmap.height,
                pixels: new Uint8Array(
                  context.getImageData(0, 0, bitmap.width, bitmap.height).data,
                ),
              };
            } finally {
              bitmap.close();
            }
          } else if (kind === "delete")
            operation = { kind: "delete", page: pageIndex, object: object.index };
          else {
            const m = object.matrix;
            const theta = (angle * Math.PI) / 180,
              c = Math.cos(theta),
              s = Math.sin(theta);
            const cx = (object.bounds.left + object.bounds.right) / 2;
            const cy = (object.bounds.bottom + object.bounds.top) / 2;
            operation = {
              kind: "transform",
              page: pageIndex,
              object: object.index,
              matrix: [
                (m[0] * c - m[1] * s) * factor,
                (m[0] * s + m[1] * c) * factor,
                (m[2] * c - m[3] * s) * factor,
                (m[2] * s + m[3] * c) * factor,
                cx + ((m[4] - cx) * c - (m[5] - cy) * s) * factor + dx,
                cy + ((m[4] - cx) * s + (m[5] - cy) * c) * factor + dy,
              ],
            };
          }
        }
        result = await runEngine(
          spec.occurrence === undefined
            ? { kind: "transform", bytes: prepared.bytes, operations: [operation] }
            : {
                kind: "transformForm",
                bytes: prepared.bytes,
                page: pageIndex,
                occurrence: spec.occurrence,
                operation,
              },
          abort.signal,
        );
      }
      abort.signal.throwIfAborted();
      await replaceDocumentBytes(doc.id, prepared.content, result, {
        requireCopy: spec.mode === "redact" || spec.mode === "sanitize",
      });
      toast(
        spec.mode === "redact"
          ? "Conteúdo removido da revisão. Salve uma cópia para compartilhar."
          : "Alteração aplicada. Revise a página antes de salvar.",
        { tone: "ok", ms: 7000 },
      );
      close();
    } catch (failure) {
      if (!abort.signal.aborted) setError(errorMessage(failure));
    } finally {
      setRunning(false);
      useApp.setState({ busy: null });
    }
  };
  const numberField = (label: string, value: number, set: (n: number) => void) => (
    <label className="local-field">
      {label}
      <input
        className="input"
        type="number"
        step="any"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => set(e.target.valueAsNumber)}
      />
    </label>
  );
  let selectedBox = box;
  if (spec.mode === "content" && object && crop) {
    const a = pdfToView(r, crop, object.bounds.left, object.bounds.bottom),
      b = pdfToView(r, crop, object.bounds.right, object.bounds.top);
    selectedBox = {
      x: Math.min(a[0], b[0]),
      y: Math.min(a[1], b[1]),
      w: Math.abs(a[0] - b[0]),
      h: Math.abs(a[1] - b[1]),
    };
  }
  return (
    <Modal
      title={titles[spec.mode]}
      width={900}
      onClose={close}
      footer={
        <>
          <span className="muted small">Processamento no dispositivo</span>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            {running ? "Cancelar operação" : "Fechar"}
          </button>
          {spec.mode !== "content" && (
            <button
              type="button"
              className="btn primary"
              disabled={!prepared || running}
              onClick={() => void execute("main")}
            >
              {running
                ? "Processando…"
                : spec.mode === "security"
                  ? "Salvar cópia protegida…"
                  : "Aplicar"}
            </button>
          )}
        </>
      }
    >
      {spec.occurrence !== undefined && (
        <div>
          <p>
            Grupo {spec.occurrence + 1} da página {pageIndex + 1}. As medidas são internas ao grupo.
            Somente esta ocorrência será alterada.
          </p>
          <button
            type="button"
            className="btn ghost sm"
            disabled={running}
            onClick={() =>
              useApp.setState({ dialog: { kind: "localTools", mode: "content", page: pageIndex } })
            }
          >
            Voltar à página
          </button>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!prepared && !error && <p role="status">Preparando documento…</p>}
      {prepared && (
        <div className="local-tools-layout">
          <div className="local-tools-controls">
            {spec.occurrence === undefined && !["security", "sanitize"].includes(spec.mode) && (
              <label className="local-field">
                Página
                <select
                  className="input"
                  aria-label="Página do conteúdo"
                  value={pageIndex}
                  disabled={running}
                  onChange={(e) => {
                    setPageIndex(Number(e.target.value));
                    setFactor(1);
                    setDx(0);
                    setDy(0);
                  }}
                >
                  {prepared.inspection.pages.map((p) => (
                    <option key={p.index} value={p.index}>
                      {p.index + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {spec.mode === "content" && (
              <>
                <label className="local-field">
                  Objeto original
                  <select
                    className="input"
                    aria-label="Objeto original"
                    value={selected}
                    onChange={(e) => {
                      const index = Number(e.target.value);
                      setSelected(index);
                      setText(page?.objects.find((item) => item.index === index)?.text ?? "");
                      setDx(0);
                      setDy(0);
                      setFactor(1);
                      setImageCrop({ x: 0, y: 0, w: 100, h: 100 });
                    }}
                  >
                    {page?.objects.map((item) => (
                      <option key={item.index} value={item.index}>
                        {item.index + 1}. {objectTypes[item.type] ?? "Objeto"}
                        {item.text ? `: ${item.text.slice(0, 50)}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {object?.type === 5 && spec.occurrence === undefined && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={running}
                    onClick={() =>
                      useApp.setState({
                        dialog: {
                          kind: "localTools",
                          mode: "content",
                          page: pageIndex,
                          occurrence: object.index,
                        },
                      })
                    }
                  >
                    Editar elementos do grupo
                  </button>
                )}
                {!page?.objects.length && (
                  <p className="muted">Esta página não contém objetos de conteúdo.</p>
                )}
                {object?.type === 1 && (
                  <>
                    <label className="local-field">
                      Novo texto
                      <textarea
                        aria-label="Novo texto"
                        className="input"
                        rows={3}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </label>
                    <p className="muted small">
                      O texto original será substituído por texto incorporado com{" "}
                      {customFont?.name ?? "Noto Sans"}. Tamanho, posição e cor são preservados.
                      Confira a largura com a nova fonte.
                    </p>
                    <div className="form-row">
                      <button
                        type="button"
                        className="btn"
                        disabled={running}
                        onClick={() => {
                          const abort = new AbortController();
                          controller.current = abort;
                          setRunning(true);
                          setError("");
                          void (async () => {
                            const file = await window.api.pickData("font");
                            abort.signal.throwIfAborted();
                            if (!file) return;
                            const font = await inspectFontInWorker(file.bytes, abort.signal);
                            if (!font.info.subset)
                              throw new Error(
                                "Esta edição de objeto ainda exige uma fonte que permita subsetting. A fonte escolhida exige incorporação integral.",
                              );
                            setCustomFont({
                              name: `${font.family} ${font.subfamily}`.trim() || file.name,
                              bytes: file.bytes,
                            });
                            setBold(false);
                            setItalic(false);
                          })()
                            .catch((failure: unknown) => {
                              if (!abort.signal.aborted) setError(errorMessage(failure));
                            })
                            .finally(() => {
                              if (!abort.signal.aborted) setRunning(false);
                            });
                        }}
                      >
                        Escolher fonte TrueType…
                      </button>
                      {customFont && (
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={running}
                          onClick={() => setCustomFont(null)}
                        >
                          Usar Noto Sans novamente
                        </button>
                      )}
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={bold}
                        disabled={!!customFont || running}
                        onChange={(e) => setBold(e.target.checked)}
                      />{" "}
                      Negrito
                    </label>{" "}
                    <label>
                      <input
                        type="checkbox"
                        checked={italic}
                        disabled={!!customFont || running}
                        onChange={(e) => setItalic(e.target.checked)}
                      />{" "}
                      Itálico
                    </label>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={running || /[\r\n]/.test(text)}
                      onClick={() => void execute("text")}
                    >
                      Substituir texto
                    </button>
                    {/[\r\n]/.test(text) && (
                      <p className="error-text">
                        Cada objeto corresponde a uma linha. Edite as linhas separadamente.
                      </p>
                    )}
                  </>
                )}
                {object?.type === 3 && (
                  <>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={running}
                      onClick={() => void execute("image")}
                    >
                      Substituir imagem…
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={running}
                      onClick={() => void execute("extract")}
                    >
                      Extrair imagem em PNG…
                    </button>
                    <fieldset disabled={running} style={{ margin: 0, padding: 0, border: 0 }}>
                      <legend>Recortar imagem</legend>
                      <div className="local-numbers">
                        {numberField("Início X da imagem (%)", imageCrop.x, (x) =>
                          setImageCrop((previous) => ({ ...previous, x })),
                        )}
                        {numberField("Início Y da imagem (%)", imageCrop.y, (y) =>
                          setImageCrop((previous) => ({ ...previous, y })),
                        )}
                        {numberField("Largura da imagem (%)", imageCrop.w, (w) =>
                          setImageCrop((previous) => ({ ...previous, w })),
                        )}
                        {numberField("Altura da imagem (%)", imageCrop.h, (h) =>
                          setImageCrop((previous) => ({ ...previous, h })),
                        )}
                      </div>
                      <p className="muted small">
                        A área azul será conservada na posição original, sem esticar. O recorte
                        reconverte a imagem para RGB e não remove texto OCR nem outras cópias. Para
                        sigilo, use Remover conteúdo permanentemente.
                      </p>
                      <button
                        type="button"
                        className="btn"
                        disabled={!validImageCrop.success}
                        onClick={() => void execute("cropImage")}
                      >
                        Aplicar recorte da imagem
                      </button>
                    </fieldset>
                  </>
                )}
                <div className="local-numbers">
                  {numberField("Deslocar X (pt)", dx, setDx)}
                  {numberField("Deslocar Y (pt)", dy, setDy)}
                  {numberField("Escala", factor, setFactor)}
                  {numberField("Rotação em graus", angle, setAngle)}
                </div>
                <p className="muted small">
                  X positivo move à direita; Y positivo move para cima nas coordenadas PDF.
                </p>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!object || running || factor <= 0}
                  onClick={() => void execute("transform")}
                >
                  Mover / redimensionar objeto
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={!object || running}
                  onClick={() => void execute("delete")}
                >
                  Excluir objeto original
                </button>
              </>
            )}
            {spec.mode === "geometry" && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={cropMode}
                    onChange={(e) => setCropMode(e.target.checked)}
                  />{" "}
                  Recortar área visível
                </label>
                {!cropMode && numberField("Escala da página e do conteúdo", factor, setFactor)}
                <p className="muted small">
                  O recorte altera a área visível e conserva o conteúdo externo. Use a remoção
                  permanente para dados confidenciais.
                </p>
              </>
            )}
            {(spec.mode === "redact" || (spec.mode === "geometry" && cropMode)) && (
              <>
                <div className="local-numbers">
                  {(["x", "y", "w", "h"] as const).map((key) => (
                    <div key={key}>
                      {numberField(
                        `${{ x: "Esquerda", y: "Topo", w: "Largura", h: "Altura" }[key]} (pt)`,
                        box[key],
                        (value) => setBox((old) => ({ ...old, [key]: value })),
                      )}
                    </div>
                  ))}
                </div>
                <p className="muted small">Arraste sobre a prévia para marcar a área.</p>
                {spec.mode === "redact" && (
                  <p className="error-text">
                    A revisão removerá texto, pixels, desenhos e anotações da área. Também removerá
                    metadados, anexos e texto alternativo, e transformará os campos de formulário em
                    conteúdo estático. Desfazer continua disponível nesta sessão; cópias anteriores
                    permanecem no dispositivo.
                  </p>
                )}
              </>
            )}
            {spec.mode === "security" && (
              <>
                <label className="local-field">
                  Senha de abertura
                  <input
                    type="password"
                    className="input"
                    value={password}
                    autoComplete="new-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label className="local-field">
                  Confirmar senha de abertura
                  <input
                    type="password"
                    className="input"
                    value={confirmation}
                    autoComplete="new-password"
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
                <label className="local-field">
                  Senha diferente para administração
                  <input
                    type="password"
                    className="input"
                    value={owner}
                    autoComplete="new-password"
                    onChange={(e) => setOwner(e.target.value)}
                  />
                </label>
                {(["print", "copy", "modify", "fill"] as const).map((key) => (
                  <label className="local-field" key={key}>
                    <span>
                      <input
                        type="checkbox"
                        checked={permissions[key]}
                        onChange={(e) =>
                          setPermissions((old) => ({ ...old, [key]: e.target.checked }))
                        }
                      />{" "}
                      {
                        {
                          print: "Permitir impressão",
                          copy: "Permitir cópia de texto",
                          modify: "Permitir edição",
                          fill: "Permitir preenchimento de campos",
                        }[key]
                      }
                    </span>
                  </label>
                ))}
                <p className="muted small">
                  Guarde as senhas: elas não são armazenadas pelo EdiPDF. As permissões dependem do
                  leitor utilizado. Para reabrir e editar no EdiPDF, use a senha de administração.
                </p>
              </>
            )}
            {spec.mode === "sanitize" && (
              <>
                {(
                  [
                    "metadata",
                    "attachments",
                    "comments",
                    "activeContent",
                    "hiddenData",
                    "flattenForms",
                  ] as const
                ).map((key) => (
                  <label className="local-field" key={key}>
                    <span>
                      <input
                        type="checkbox"
                        checked={sanitization[key]}
                        onChange={(e) =>
                          setSanitization((old) => ({ ...old, [key]: e.target.checked }))
                        }
                      />{" "}
                      {
                        {
                          metadata: "Remover metadados",
                          attachments: "Remover anexos incorporados",
                          comments: "Remover comentários e anotações",
                          activeContent: "Remover scripts e ações externas",
                          hiddenData: "Remover estrutura, texto alternativo e dados privados",
                          flattenForms: "Transformar campos em conteúdo estático",
                        }[key]
                      }
                    </span>
                  </label>
                ))}
                <p className="muted small">
                  Revise a cópia antes de compartilhar. Remover a estrutura de acessibilidade impede
                  a leitura assistiva baseada em tags.
                </p>
              </>
            )}
          </div>
          <div
            className="local-preview"
            style={{ aspectRatio: `${W} / ${H}` }}
            onPointerDown={(e) => {
              if (running || !(spec.mode === "redact" || (spec.mode === "geometry" && cropMode)))
                return;
              const el = e.currentTarget;
              const bounds = el.getBoundingClientRect();
              const x = Math.min(W, Math.max(0, ((e.clientX - bounds.left) * W) / bounds.width));
              const y = Math.min(H, Math.max(0, ((e.clientY - bounds.top) * H) / bounds.height));
              el.setPointerCapture(e.pointerId);
              const move = (event: PointerEvent) => {
                const endX = Math.min(
                  W,
                  Math.max(0, ((event.clientX - bounds.left) * W) / bounds.width),
                );
                const endY = Math.min(
                  H,
                  Math.max(0, ((event.clientY - bounds.top) * H) / bounds.height),
                );
                setBox({
                  x: Math.min(x, endX),
                  y: Math.min(y, endY),
                  w: Math.abs(endX - x),
                  h: Math.abs(endY - y),
                });
              };
              const end = () => {
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", end);
                el.removeEventListener("pointercancel", end);
              };
              el.addEventListener("pointermove", move);
              el.addEventListener("pointerup", end, { once: true });
              el.addEventListener("pointercancel", end, { once: true });
            }}
          >
            <img
              src={prepared.preview}
              alt={`Prévia da página ${pageIndex + 1}`}
              draggable={false}
            />
            {(
              spec.mode === "content"
                ? object?.type !== 3 || !validImageCrop.success
                : spec.mode === "redact" || (spec.mode === "geometry" && cropMode)
            ) ? (
              <div
                className={`local-selection ${spec.mode === "redact" ? "redact" : ""}`}
                style={{
                  left: `${(selectedBox.x / W) * 100}%`,
                  top: `${(selectedBox.y / H) * 100}%`,
                  width: `${(selectedBox.w / W) * 100}%`,
                  height: `${(selectedBox.h / H) * 100}%`,
                }}
              />
            ) : null}
            {spec.mode === "content" &&
              object?.type === 3 &&
              crop &&
              validImageCrop.success &&
              (() => {
                const m = croppedImageMatrix(object.matrix, validImageCrop.data);
                const points = [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                ]
                  .map(([x, y]) =>
                    pdfToView(r, crop, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]).join(
                      ",",
                    ),
                  )
                  .join(" ");
                return (
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    role="img"
                    aria-label="Área da imagem conservada pelo recorte"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  >
                    <title>Área conservada</title>
                    <polygon
                      points={points}
                      fill="#2563eb33"
                      stroke="#2563eb"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                );
              })()}
          </div>
        </div>
      )}
    </Modal>
  );
}
