import {
  type AdjustInput,
  AI_TOOLS,
  type AiToolName,
  type GradientInput,
  MUTATING_TOOLS,
  type TextInput,
} from "@shared/aiTools";
import { BLEND_IDS, type BlendMode, blendLabel } from "@shared/blendModes";
import {
  type Adjust,
  adjustSummary,
  type Doc,
  KIND_LABEL,
  type Layer,
  type TextStyle,
} from "@shared/doc";
import type { AiToolCall, ToolOutcome } from "@shared/types";
import { compositor } from "@/engine/compositor";
import { executeAiTransaction, useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { autoAdjust } from "./actions";
import { analyzeDoc, describeStats } from "./analyze";
import { exportTo, isDocPath, isImagePath, openPath, readImageFile } from "./files";
import { alignLayer } from "./layout";
import {
  addLayer,
  addMask,
  aspectRect,
  crop,
  deleteLayer,
  duplicateLayer,
  editLayer,
  flipImage,
  invertMask,
  OpError,
  parseAspect,
  placeImage,
  removeMask,
  reorderLayer,
  requireDoc,
  requireLayer,
  resizeImage,
  rotateImage,
  setLayerProps,
  setMaskEnabled,
  setTransform,
  shapeMask,
} from "./ops";
import {
  refineSelection,
  removeBackground,
  selectionMask,
  selectPolygon,
  vectorSelection,
} from "./selection";
import { applyStyle } from "./styles";
import { addVector, editVector } from "./vector";

/** Runs the AI tools against the open document. Same code for MCP clients and the in-app chat. */

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const px = (v: number): string => `${Math.round(v)}`;

function describeLayer(l: Layer, i: number, activeId: string | null): string {
  const head = `${i}. [${l.id}] "${l.name}" · ${KIND_LABEL[l.kind].toLowerCase()} · ${blendLabel(l.blendMode)} (${l.blendMode}) · opacidade ${pct(l.opacity)} · preenchimento ${pct(l.fill)}${l.visible ? "" : " · OCULTA"}${l.locked ? " · bloqueada" : ""}${l.mask ? ` · máscara ${l.mask.enabled ? "ativa" : "desativada"}` : ""}${l.id === activeId ? " · ATIVA" : ""}`;
  const detail = (() => {
    switch (l.kind) {
      case "vector":
        return JSON.stringify({ vector: l.vector, transform: l.transform });
      case "raster":
        return `imagem ${l.width}×${l.height}, centro (${px(l.transform.x)}, ${px(l.transform.y)}), escala ${l.transform.scale.toFixed(3)}, rotação ${l.transform.rotation}°`;
      case "text":
        return `"${l.text.content.replace(/\n/g, " / ")}" · ${l.text.font} ${l.text.size}px peso ${l.text.weight}${l.text.italic ? " itálico" : ""} · ${l.text.color} · centro (${px(l.transform.x)}, ${px(l.transform.y)}), escala ${l.transform.scale.toFixed(2)}, rotação ${l.transform.rotation}°`;
      case "solid":
        return `cor ${l.color}`;
      case "gradient": {
        const g = l.gradient;
        const stops = g.stops
          .map(
            (s) => `${s.color}${s.opacity < 1 ? ` (${pct(s.opacity)})` : ""} em ${pct(s.position)}`,
          )
          .join(" → ");
        return g.type === "linear"
          ? `linear ${g.angle}°: ${stops}`
          : `radial centro (${g.cx.toFixed(2)}, ${g.cy.toFixed(2)}) tamanho ${g.scale}: ${stops}`;
      }
      case "adjust":
        return `ajuste: ${adjustSummary(l.adjust)}`;
    }
  })();
  return `${head}\n   ${detail}`;
}

function documentText(): string {
  const s = useDoc.getState();
  const doc = requireDoc();
  const lines = [
    `Documento [${doc.id}] ? Imagem "${doc.name}" · ${doc.width}×${doc.height} px · ${s.filePath ? `salva em ${s.filePath}` : s.sourcePath ? `aberta de ${s.sourcePath}` : "ainda não salva"}${s.dirty ? " · alterações não salvas" : ""}`,
    `Camadas de cima para baixo (${doc.layers.length}):`,
  ];
  [...doc.layers].reverse().forEach((l, i) => {
    lines.push(describeLayer(l, i + 1, s.activeId));
  });
  const last = s.past[s.past.length - 1];
  lines.push(`Histórico: ${s.past.length} passo(s)${last ? `; último: "${last.label}"` : ""}.`);
  return lines.join("\n");
}

function jpeg(c: HTMLCanvasElement, quality = 0.85): { data: string; mimeType: "image/jpeg" } {
  const flat = document.createElement("canvas");
  flat.width = c.width;
  flat.height = c.height;
  const ctx = flat.getContext("2d")!;
  // Checkerboard-free: transparency shows as mid gray so the model can tell it apart.
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(c, 0, 0);
  return { data: flat.toDataURL("image/jpeg", quality).split(",")[1], mimeType: "image/jpeg" };
}

const done = (text: string): ToolOutcome => ({ ok: true, text });

function renderPreview(doc: Doc, maxSize: number, layerId?: string): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(doc.width, doc.height));
  const c = compositor().renderToCanvas(doc, { scale, only: layerId });
  return c;
}

function contactSheet(doc: Doc, layerId: string, modes: BlendMode[]): HTMLCanvasElement {
  const cell = 300;
  const scale = Math.min(1, cell / Math.max(doc.width, doc.height));
  const tw = Math.round(doc.width * scale);
  const th = Math.round(doc.height * scale);
  const cols = Math.min(modes.length, Math.ceil(Math.sqrt(modes.length * 1.4)));
  const rows = Math.ceil(modes.length / cols);
  const label = 26;
  const sheet = document.createElement("canvas");
  sheet.width = cols * (tw + 8) + 8;
  sheet.height = rows * (th + label + 8) + 8;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#1a1a1d";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = '600 14px "Inter Variable", sans-serif';
  ctx.textBaseline = "middle";
  modes.forEach((mode, i) => {
    const x = 8 + (i % cols) * (tw + 8);
    const y = 8 + Math.floor(i / cols) * (th + label + 8);
    const img = compositor().renderToCanvas(doc, { scale, modeOverride: { layerId, mode } });
    ctx.fillStyle = "#808080";
    ctx.fillRect(x, y, tw, th);
    ctx.drawImage(img, x, y, tw, th);
    ctx.fillStyle = "#ededef";
    ctx.fillText(`${i + 1}. ${blendLabel(mode)}`, x + 2, y + th + label / 2);
  });
  return sheet;
}

function textPatch(t: TextInput): Partial<TextStyle> {
  const p: Partial<TextStyle> = {};
  if (t.content !== undefined) p.content = t.content;
  if (t.font) p.font = t.font;
  if (t.size) p.size = t.size;
  if (t.weight) p.weight = t.weight;
  if (t.italic !== undefined) p.italic = t.italic;
  if (t.color) p.color = t.color;
  if (t.align) p.align = t.align;
  if (t.max_width !== undefined) p.maxWidth = t.max_width;
  if (t.line_height) p.lineHeight = t.line_height;
  if (t.letter_spacing !== undefined) p.letterSpacing = t.letter_spacing;
  return p;
}

function adjustPatch(a: AdjustInput, current?: Adjust): Partial<Adjust> {
  const { levels, ...rest } = a;
  const p: Partial<Adjust> = { ...rest };
  if (levels) {
    const base = current?.levels ?? { black: [0, 0, 0], white: [255, 255, 255], gamma: 1 };
    p.levels = {
      black: (levels.black as [number, number, number] | undefined) ?? base.black,
      white: (levels.white as [number, number, number] | undefined) ?? base.white,
      gamma: levels.gamma ?? base.gamma,
    };
  }
  return p;
}

const gradientPatch = (g: GradientInput) => ({
  ...g,
  stops: g.stops?.map((s) => ({ color: s.color, position: s.position, opacity: s.opacity ?? 1 })),
});

interface ToolContext {
  check(): void;
  mutate(run: () => ToolOutcome): ToolOutcome;
}
type Handler = (input: never, context: ToolContext) => Promise<ToolOutcome> | ToolOutcome;

const HANDLERS: {
  [K in AiToolName]: (
    input: import("zod").infer<(typeof AI_TOOLS)[K]["input"]>,
    context: ToolContext,
  ) => Promise<ToolOutcome> | ToolOutcome;
} = {
  align_layer: ({ layer_id, alignment, margin }) => {
    alignLayer(layer_id, alignment, margin);
    return done("Elemento alinhado.");
  },
  apply_style: ({ style, strength }) => done(`Estilo aplicado: ${applyStyle(style, strength)}.`),
  select_region: ({ x, y, width, height, mode, feather }) => {
    selectPolygon(
      [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
      mode,
    );
    if (feather) refineSelection(0, feather);
    return done("Seleção criada.");
  },
  selection_mask: ({ layer_id, grow, feather }) => {
    if (grow || feather) refineSelection(grow, feather);
    selectionMask(layer_id);
    return done("Máscara criada.");
  },
  add_vector: ({ vector, x, y }) =>
    done(
      `Vetor criado: ${addVector(vector, { x: x ?? requireDoc().width / 2, y: y ?? requireDoc().height / 2 })}`,
    ),
  edit_vector: ({ layer_id, vector }) => {
    editVector(layer_id, vector);
    return done("Vetor atualizado.");
  },
  vector_mask: ({ vector_id, target_id }) => {
    const l = requireLayer(vector_id);
    if (l.kind !== "vector") throw new OpError("Escolha um vetor.");
    vectorSelection(l);
    selectionMask(target_id);
    return done("Máscara criada.");
  },
  remove_background: ({ layer_id, tolerance }) => {
    useDoc.getState().setActive(layer_id);
    if (tolerance !== undefined) useUi.setState({ tolerance });
    removeBackground();
    return done("Recorte por cor aplicado. A máscara existente foi preservada.");
  },
  compare_modes: ({ layer_id }) => {
    requireLayer(layer_id);
    useDoc.getState().setActive(layer_id);
    useUi.setState({ compareOpen: true });
    return done("Comparação aberta.");
  },
  get_document: () => done(documentText()),

  get_preview: ({ max_size, layer_id }) => {
    const doc = requireDoc();
    if (layer_id) requireLayer(layer_id);
    const c = renderPreview(doc, max_size ?? 1024, layer_id);
    return {
      ok: true,
      text: `Prévia ${c.width}×${c.height}${layer_id ? ` da camada ${layer_id} sozinha` : ""} (áreas transparentes em cinza).`,
      image: jpeg(c),
    };
  },

  analyze_image: () => {
    const s = analyzeDoc(requireDoc());
    return done(describeStats(s));
  },

  preview_blend_modes: ({ layer_id, modes }) => {
    const doc = requireDoc();
    const l = requireLayer(layer_id);
    const list = (modes ?? BLEND_IDS) as BlendMode[];
    const sheet = contactSheet(doc, layer_id, list);
    return {
      ok: true,
      text: `Camada "${l.name}" (modo atual: ${blendLabel(l.blendMode)}). Ordem: ${list.map((m, i) => `${i + 1}=${m}`).join(", ")}. Nada foi alterado.`,
      image: jpeg(sheet, 0.8),
    };
  },

  select_layer: ({ layer_id }) => {
    const l = requireLayer(layer_id);
    useDoc.getState().setActive(layer_id);
    return done(`Camada ativa: "${l.name}".`);
  },

  set_layer: ({
    layer_id,
    name,
    blend_mode,
    opacity,
    fill,
    visible,
    locked,
    x,
    y,
    scale,
    rotation,
    flip_x,
    flip_y,
  }) => {
    const l = requireLayer(layer_id);
    const props = {
      ...(name !== undefined && { name }),
      ...(blend_mode !== undefined && { blendMode: blend_mode }),
      ...(opacity !== undefined && { opacity: opacity / 100 }),
      ...(fill !== undefined && { fill: fill / 100 }),
      ...(visible !== undefined && { visible }),
      ...(locked !== undefined && { locked }),
    };
    if (Object.keys(props).length) setLayerProps(layer_id, props, `ai-props:${layer_id}`);
    const t = {
      ...(x !== undefined && { x }),
      ...(y !== undefined && { y }),
      ...(scale !== undefined && { scale }),
      ...(rotation !== undefined && { rotation }),
      ...(flip_x !== undefined && { flipX: flip_x }),
      ...(flip_y !== undefined && { flipY: flip_y }),
    };
    if (Object.keys(t).length) setTransform(layer_id, t, `ai-transform:${layer_id}`);
    useDoc.getState().setActive(layer_id);
    const changed = [
      blend_mode && `modo ${blendLabel(blend_mode)}`,
      opacity !== undefined && `opacidade ${opacity}%`,
      fill !== undefined && `preenchimento ${fill}%`,
      name && `nome "${name}"`,
      visible !== undefined && (visible ? "visível" : "oculta"),
      Object.keys(t).length && "posição",
    ]
      .filter(Boolean)
      .join(", ");
    return done(`Camada "${name ?? l.name}" atualizada: ${changed || "nada mudou"}.`);
  },

  add_layer: (input) => {
    const doc = requireDoc();
    if (input.above_layer_id) requireLayer(input.above_layer_id);
    const kind = input.kind === "adjustment" ? "adjust" : input.kind;
    const id = addLayer({
      kind,
      name: input.name,
      blendMode: input.blend_mode,
      opacity: input.opacity !== undefined ? input.opacity / 100 : undefined,
      above: input.above_layer_id ?? doc.layers[doc.layers.length - 1]?.id,
      color: input.color,
      gradient: input.gradient && gradientPatch(input.gradient),
      text: input.text && textPatch(input.text),
      textAt:
        input.text?.x !== undefined || input.text?.y !== undefined
          ? { x: input.text?.x ?? doc.width / 2, y: input.text?.y ?? doc.height / 2 }
          : undefined,
      adjust: input.adjustment && adjustPatch(input.adjustment),
    });
    const l = requireLayer(id);
    return done(
      `Camada criada: [${id}] "${l.name}" (${KIND_LABEL[l.kind].toLowerCase()}, ${blendLabel(l.blendMode)}).`,
    );
  },

  edit_layer: ({ layer_id, color, gradient, text, adjustment }) => {
    const l = requireLayer(layer_id);
    const key = `ai-content:${layer_id}`;
    if (color) editLayer(layer_id, { color }, key);
    if (gradient) editLayer(layer_id, { gradient: gradientPatch(gradient) }, key);
    if (text) {
      const patch = textPatch(text);
      if (Object.keys(patch).length) editLayer(layer_id, { text: patch }, key);
      if (text.x !== undefined || text.y !== undefined)
        setTransform(
          layer_id,
          {
            ...(text.x !== undefined && { x: text.x }),
            ...(text.y !== undefined && { y: text.y }),
          },
          `ai-transform:${layer_id}`,
        );
    }
    if (adjustment)
      editLayer(
        layer_id,
        { adjust: adjustPatch(adjustment, l.kind === "adjust" ? l.adjust : undefined) },
        key,
      );
    const now = requireLayer(layer_id);
    return done(
      `"${now.name}" atualizada${now.kind === "adjust" ? `: ${adjustSummary(now.adjust)}` : ""}.`,
    );
  },

  set_mask: ({ layer_id, mode, ...shape }) => {
    const l = requireLayer(layer_id);
    switch (mode) {
      case "reveal_all":
      case "hide_all":
        addMask(layer_id, mode === "reveal_all" ? "reveal" : "hide");
        break;
      case "linear":
      case "radial":
        shapeMask(layer_id, { kind: mode, ...shape });
        break;
      case "invert":
        invertMask(layer_id);
        break;
      case "remove":
        removeMask(layer_id);
        break;
      case "disable":
      case "enable":
        setMaskEnabled(layer_id, mode === "enable");
        break;
    }
    return done(`Máscara de "${l.name}": ${mode}.`);
  },

  auto_adjust: ({ strength }) => {
    const id = autoAdjust((strength ?? 100) / 100);
    const l = requireLayer(id);
    return done(
      `Camada [${id}] "Ajuste automático" criada: ${l.kind === "adjust" ? adjustSummary(l.adjust) : ""}.`,
    );
  },

  duplicate_layer: ({ layer_id }) => {
    requireLayer(layer_id);
    const id = duplicateLayer(layer_id);
    return done(`Cópia criada: [${id}] "${requireLayer(id).name}".`);
  },

  delete_layer: ({ layer_id }) => {
    const l = requireLayer(layer_id);
    deleteLayer(layer_id);
    return done(`Camada "${l.name}" apagada.`);
  },

  reorder_layer: ({ layer_id, position }) => {
    const l = requireLayer(layer_id);
    reorderLayer(layer_id, position);
    const doc = requireDoc();
    const fromTop = doc.layers.length - doc.layers.findIndex((x) => x.id === layer_id);
    return done(`"${l.name}" agora é a ${fromTop}ª camada de cima para baixo.`);
  },

  crop: ({ x, y, width, height, aspect, focus_x, focus_y }) => {
    const doc = requireDoc();
    let r: { x: number; y: number; w: number; h: number };
    if (aspect) r = aspectRect(doc, parseAspect(aspect), focus_x ?? 0.5, focus_y ?? 0.5);
    else if (width && height) r = { x: x ?? 0, y: y ?? 0, w: width, h: height };
    else throw new OpError("Informe x, y, width e height, ou uma proporção (aspect).");
    crop(r.x, r.y, r.w, r.h);
    useUi.setState((s) => ({ fitRequest: s.fitRequest + 1 }));
    return done(
      `Imagem cortada para ${Math.round(r.w)}×${Math.round(r.h)} (a partir de ${Math.round(r.x)}, ${Math.round(r.y)}).`,
    );
  },

  transform_image: ({ rotate, flip }) => {
    if (!rotate && !flip) throw new OpError("Informe rotate ou flip.");
    if (rotate) rotateImage(rotate === 180 ? 2 : rotate === 90 ? 1 : -1);
    if (flip) flipImage(flip);
    useUi.setState((s) => ({ fitRequest: s.fitRequest + 1 }));
    const d = requireDoc();
    return done(`Pronto. Tamanho agora: ${d.width}×${d.height}.`);
  },

  resize_image: ({ width, height, percent }) => {
    const doc = requireDoc();
    let w = width;
    let h = height;
    if (percent) {
      w = doc.width * (percent / 100);
      h = doc.height * (percent / 100);
    } else if (w && !h) h = (doc.height * w) / doc.width;
    else if (h && !w) w = (doc.width * h) / doc.height;
    if (!w || !h) throw new OpError("Informe width, height ou percent.");
    resizeImage(w, h);
    useUi.setState((s) => ({ fitRequest: s.fitRequest + 1 }));
    const d = requireDoc();
    return done(`Novo tamanho: ${d.width}×${d.height}.`);
  },

  place_image: async ({ path, name }, context) => {
    if (!isImagePath(path))
      throw new OpError("Formato não suportado. Use PNG, JPEG, WebP, GIF, BMP ou AVIF.");
    const canvas = await readImageFile(path);
    return context.mutate(() => {
      const id = placeImage(
        canvas,
        canvas.width,
        canvas.height,
        name ?? path.split(/[\\/]/).pop() ?? "Imagem",
      );
      return done(`Imagem inserida como camada [${id}].`);
    });
  },

  open_image: async ({ path }, context) => {
    if (!isImagePath(path) && !isDocPath(path)) throw new OpError("Formato não suportado.");
    const s = useDoc.getState();
    if (s.doc && s.dirty)
      throw new OpError(
        "A imagem aberta tem alterações não salvas. Peça ao usuário para salvar (Ctrl+S) ou descartar antes.",
      );
    await openPath(path, context.check);
    const d = requireDoc();
    return done(`Aberta: "${d.name}" ${d.width}×${d.height}.`);
  },

  export_image: async ({ path, format, quality, scale }, context) => {
    const ui = useUi.getState();
    if (!ui.ai?.allowFileWrites)
      throw new OpError(
        "O usuário não permitiu que o agente salve arquivos. Ele pode liberar em Configurações › Inteligência artificial, ou exportar pelo botão Exportar.",
      );
    const out = await exportTo(
      path,
      { format, quality: quality ?? 90, scale: scale ?? 1 },
      context.check,
    );
    ui.toast(`O agente exportou ${out.split(/[\\/]/).pop()}`, "ok", {
      label: "Mostrar na pasta",
      run: () => void window.api.showInFolder(out),
    });
    return done(`Exportado em ${out}.`);
  },

  undo: ({ steps }) => {
    const n = steps ?? 1;
    let undone = 0;
    for (let i = 0; i < n; i++) {
      if (!useDoc.getState().past.length) break;
      useDoc.getState().undo();
      undone++;
    }
    return done(undone ? `${undone} passo(s) desfeito(s).` : "Nada para desfazer.");
  },
};

const pendingTools = new Map<string, AbortController>();
let toolQueue: Promise<unknown> = Promise.resolve();
export function cancelAiTool(id: string): void {
  pendingTools.get(id)?.abort();
}
/** Serialize tools and bind each call to its document before any dialog or async work. */
export function runAiTool(call: AiToolCall): Promise<ToolOutcome> {
  const controller = new AbortController();
  pendingTools.set(call.id, controller);
  const initial = useDoc.getState();
  const execute = async (): Promise<ToolOutcome> => {
    if (!(call.name in AI_TOOLS))
      return { ok: false, text: `Ferramenta desconhecida: ${call.name}` };
    const name = call.name as AiToolName,
      tool = AI_TOOLS[name];
    const parsed = tool.input.safeParse(call.input ?? {});
    if (!parsed.success)
      return { ok: false, text: `Parâmetros inválidos: ${parsed.error.message}` };
    const mutating = MUTATING_TOOLS.has(name) || name === "export_image";
    const expected = call.documentId ?? parsed.data.document_id;
    const check = (): void => {
      if (controller.signal.aborted)
        throw new OpError("Pedido interrompido; nenhuma nova alteração foi aplicada.");
      const current = useDoc.getState();
      if (
        (expected !== undefined && current.doc?.id !== expected) ||
        current.doc?.id !== initial.doc?.id ||
        (call.workspaceId !== undefined && call.workspaceId !== current.initialStateId) ||
        current.stateId !== initial.stateId
      )
        throw new OpError(
          "A imagem ou a edição mudou durante o pedido. Consulte get_document novamente.",
        );
      if (mutating && name !== "open_image" && !expected)
        throw new OpError("Informe document_id obtido em get_document para editar a imagem.");
    };
    const context: ToolContext = {
      check,
      mutate: (run) => {
        check();
        return executeAiTransaction(
          call.runId ? `ai:${call.runId}` : `ai:${call.id}`,
          `${call.source === "mcp" ? "Agente" : "Assistente"}: ${tool.title}`,
          run,
        );
      },
    };
    try {
      check();
      if (call.source === "mcp") useUi.setState({ externalAt: Date.now() });
      if (name !== "open_image" && !initial.doc)
        throw new OpError("Abra uma imagem antes de usar o assistente.");
      if (
        name === "delete_layer" &&
        "layer_id" in parsed.data &&
        (useUi.getState().ai?.confirmDeletes ?? true)
      ) {
        const layer = requireLayer(String(parsed.data.layer_id));
        const answer = useUi
          .getState()
          .ask(
            "Apagar camada?",
            `O assistente quer apagar "${layer.name}". Voc? pode desfazer com Ctrl+Z.`,
            "Apagar",
          );
        const confirmation = useUi.getState().confirm;
        const cancel = (): void => {
          if (useUi.getState().confirm === confirmation) {
            confirmation?.resolve(false);
            useUi.setState({ confirm: null });
          }
        };
        controller.signal.addEventListener("abort", cancel, { once: true });
        const ok = await answer;
        controller.signal.removeEventListener("abort", cancel);
        check();
        if (!ok) return { ok: false, text: "O usuário não autorizou apagar a camada." };
      }
      const handler = HANDLERS[name] as Handler;
      if (["place_image", "open_image", "export_image"].includes(name))
        return await handler(parsed.data as never, context);
      if (mutating && name !== "undo")
        return context.mutate(() => {
          const result = handler(parsed.data as never, context);
          if (result instanceof Promise)
            throw new Error(
              "Uma edição assíncrona precisa preparar sua entrada antes de alterar o documento.",
            );
          if (!result.ok) throw new OpError(result.text);
          return result;
        });
      return await handler(parsed.data as never, context);
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : String(error) };
    }
  };
  const result = toolQueue.then(execute);
  toolQueue = result.catch(() => {});
  return result.finally(() => pendingTools.delete(call.id));
}
