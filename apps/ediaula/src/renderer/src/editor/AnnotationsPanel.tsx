import { ANNOTATION_PRESETS, type Annotation, type AnnotationKind, KIT } from "@shared/annotation";
import { inPalette, type Palette, readableOn, textOn } from "@shared/palettes";
import {
  ArrowUpRight,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Clapperboard,
  Flag,
  Hash,
  IdCard,
  Image,
  Laugh,
  ListOrdered,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Minus,
  MousePointerClick,
  MoveRight,
  Pointer,
  RectangleHorizontal,
  Scan,
  Spline,
  Square,
  StickyNote,
  Tag,
  Ticket,
  Triangle,
  Type,
  Zap,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { ANNOTATION_MIME, addAnnotation, addCard, addImageOverlay } from "@/lib/annotations";
import { useActivePalette } from "@/lib/palettes";
import { useApp } from "@/state/app";
import { usePlayback } from "@/state/playback";
import { PaletteSection } from "./PaletteEditor";

const ICONS: Partial<Record<AnnotationKind, LucideIcon>> = {
  arrow: ArrowUpRight,
  balloon: MessageCircle,
  note: StickyNote,
  label: Tag,
  title: Type,
  highlight: Square,
  step: Hash,
  lowerthird: IdCard,
};

const HINTS: Partial<Record<AnnotationKind, string>> = {
  arrow: "Aponte para um botão ou bloco",
  balloon: "Fala ou pergunta na tela",
  note: "Dica curta para a criança",
  label: "Nome de uma área ou bloco",
  title: "Abertura de seção",
  highlight: "Contorno em volta de algo",
  step: "Número de passo: 1, 2, 3…",
  lowerthird: "Nome e descrição na parte de baixo",
};

interface ShapeTile {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  kind: AnnotationKind;
  spec: Partial<Annotation>;
}

/** Simple shapes to compose a scene: filled forms, and lines with no heads. */
const SHAPES: ShapeTile[] = [
  {
    id: "rect",
    label: "Retângulo",
    hint: "Forma cheia, cantos arredondados",
    icon: RectangleHorizontal,
    kind: "panel",
    spec: { shape: "rounded", boxWidth: 420, boxHeight: 260 },
  },
  {
    id: "circle",
    label: "Círculo",
    hint: "Círculo cheio",
    icon: Circle,
    kind: "panel",
    spec: { shape: "ellipse", boxWidth: 260, boxHeight: 260 },
  },
  {
    id: "triangle",
    label: "Triângulo",
    hint: "Triângulo cheio",
    icon: Triangle,
    kind: "panel",
    spec: { shape: "triangle", boxWidth: 300, boxHeight: 260 },
  },
  { id: "line", label: "Linha", hint: "Linha reta", icon: Minus, kind: "line", spec: {} },
  {
    id: "curve",
    label: "Curva",
    hint: "Linha curva",
    icon: Spline,
    kind: "line",
    spec: { curve: 0.6, angle: 0 },
  },
  {
    id: "ring",
    label: "Círculo vazado",
    hint: "Só o contorno, em volta de algo",
    icon: CircleDashed,
    kind: "highlight",
    spec: { shape: "ellipse", boxWidth: 260, boxHeight: 260 },
  },
];

/**
 * The lesson kit's pieces: boxes whose color says their role, list items, the yellow frame, the
 * pill and the heavy arrow, in the roles of the lesson's palette.
 */
export function kitTiles(p: Palette): ShapeTile[] {
  const r = p.roles;
  const flat = { outline: { color: "#FFFFFF", width: 0 }, shadow: null } as const;
  return [
    {
      id: "kit-callout",
      label: "Caixa numerada",
      hint: "Balão do kit: número e ponteiro que se arrasta",
      icon: MessageSquareText,
      kind: "balloon",
      spec: {
        look: "kit",
        textRole: "heading",
        color: r.ink,
        fill: r.light,
        text: "Esse é o personagem",
        badge: "1",
        tail: "bottom-left",
        fontSize: KIT.boxText,
      },
    },
    {
      id: "kit-action",
      label: "Ação",
      hint: "Branca: o que a criança faz, um termo",
      icon: MousePointerClick,
      kind: "box",
      spec: { color: r.light, text: "Ação", pointer: "none", badge: "" },
    },
    {
      id: "kit-reaction",
      label: "Reação",
      hint: "Verde: o que o jogo responde",
      icon: Zap,
      kind: "box",
      spec: {
        color: r.success,
        textColor: readableOn(r.accent, r.success, p),
        text: "Reação",
        pointer: "none",
        badge: "",
      },
    },
    {
      id: "kit-instruction",
      label: "Instrução",
      hint: "Amarela: o que fazer agora",
      icon: Pointer,
      kind: "box",
      spec: { color: r.accent, text: "Pegue a chave", pointer: "none", badge: "" },
    },
    {
      id: "kit-notice",
      label: "Aviso",
      hint: "Escura: aviso forte, próxima aula",
      icon: Megaphone,
      kind: "box",
      spec: { color: r.dark, text: "Próxima", pointer: "none", badge: "" },
    },
    {
      id: "kit-item",
      label: "Item da lista",
      hint: "Cartão com número: metas, passos",
      icon: ListOrdered,
      kind: "item",
      spec: { color: r.primary, fill: r.light },
    },
    {
      id: "kit-option",
      label: "Alternativa",
      hint: "A, B, C… de uma pergunta",
      icon: CircleHelp,
      kind: "item",
      spec: {
        color: r.accent,
        fill: r.light,
        marker: "square",
        badge: "A",
        text: "Nada acontece.",
        fontSize: 45,
        outline: { color: r.accent, width: 4.5 },
      },
    },
    {
      id: "kit-done",
      label: "Aprendido",
      hint: "Certo verde e a frase, sem cartão",
      icon: CircleCheck,
      kind: "item",
      spec: {
        color: r.success,
        marker: "check",
        bare: true,
        badge: "",
        text: "Toda ação tem uma reação.",
      },
    },
    {
      id: "kit-pill",
      label: "Selo",
      hint: "“Pause o vídeo”, módulo, tempo",
      icon: Ticket,
      kind: "label",
      spec: { color: r.dark, text: "PAUSE O VÍDEO", icon: "pause", ...flat },
    },
    {
      id: "kit-frame",
      label: "Moldura",
      hint: "Destaque amarelo no lugar da seta",
      icon: Scan,
      kind: "highlight",
      spec: { color: r.accent, boxWidth: 520, boxHeight: 130, shadow: null },
    },
    {
      id: "kit-arrow",
      label: "Seta grossa",
      hint: "Liga uma caixa à outra",
      icon: MoveRight,
      kind: "arrow",
      spec: { color: r.ink, angle: 0, length: 144, thickness: 54, headSize: 114, ...flat },
    },
  ];
}

/** Annotation gallery: each tile drops an annotation at the playhead, above the lesson. */
export function AnnotationsPanel(): ReactNode {
  const [busy, setBusy] = useState<string | null>(null);
  const palette = useActivePalette();
  // Dark colors would vanish on the dark tile: those show the app accent instead.
  const tint = (c: string): string =>
    textOn(c, palette) === palette.roles.light && parseInt(c.slice(1), 16) < 0x404040
      ? "var(--accent)"
      : c;
  const time = usePlayback((s) => s.time);
  const run = async (id: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(id);
    await fn();
    useApp.getState().set({ sideTab: "properties" });
    setBusy(null);
  };
  const meme = async (): Promise<void> => {
    const paths = await window.api.pickMedia();
    const img = paths.find((p) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(p));
    if (img) await run("meme", () => addImageOverlay(img));
  };
  const tile = (
    id: string,
    Icon: LucideIcon,
    label: string,
    hint: string,
    color: string,
    onClick: () => void,
    /** Can be dragged to a track of the timeline (the cards and the meme cannot). */
    drag?: { kind: AnnotationKind; spec?: Partial<Annotation> },
  ): ReactNode => (
    <button
      type="button"
      key={id}
      className="ann-tile"
      disabled={busy !== null}
      onClick={onClick}
      title={
        drag ? `${hint}. Clique para pôr no cursor, ou arraste para uma faixa da timeline.` : hint
      }
      draggable={!!drag}
      onDragStart={(e) => {
        if (!drag) return;
        e.dataTransfer.setData(ANNOTATION_MIME, JSON.stringify(drag));
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <span className="ann-icon" style={{ color }}>
        <Icon size={22} />
      </span>
      <strong>{label}</strong>
      <small className="muted">{hint}</small>
    </button>
  );
  const shapeColor = (s: ShapeTile): string => {
    const base = ANNOTATION_PRESETS.find((p) => p.kind === s.kind)!.spec;
    return tint(inPalette({ ...base, ...s.spec } as Annotation, palette).color);
  };
  return (
    <section className="library annotations">
      <div className="lib-header">
        <h2>Anotações</h2>
      </div>
      <PaletteSection />
      <p className="muted ann-hint">
        Clique para pôr no ponto do cursor ({Math.floor(time / 60)}:
        {String(Math.floor(time % 60)).padStart(2, "0")}), por cima da aula, ou arraste para a faixa
        e o tempo que quiser na timeline, sem criar faixa nova. Arraste no vídeo para posicionar.
      </p>

      <h3 className="ann-group">Cartelas</h3>
      <div className="ann-grid">
        {tile(
          "start",
          Clapperboard,
          "Abertura",
          "Curso e título da aula, preenchidos do roteiro",
          "var(--accent)",
          () => void run("card", () => addCard("start")),
        )}
        {tile(
          "end",
          Flag,
          "Encerramento",
          "“Até a próxima aula!”",
          "var(--accent)",
          () => void run("card", () => addCard("end")),
        )}
      </div>

      <h3 className="ann-group">Textos e indicações</h3>
      <div className="ann-grid">
        {ANNOTATION_PRESETS.filter((p) => ICONS[p.kind]).map((p) =>
          tile(
            p.kind,
            ICONS[p.kind]!,
            p.label,
            HINTS[p.kind]!,
            tint(inPalette(p.spec, palette).color),
            () => void run(p.kind, () => addAnnotation(p.kind)),
            { kind: p.kind },
          ),
        )}
      </div>

      <h3 className="ann-group">Caixas e listas</h3>
      <div className="ann-grid">
        {kitTiles(palette).map((s) =>
          tile(
            s.id,
            s.icon,
            s.label,
            s.hint,
            tint(s.spec.color ?? palette.roles.accent),
            () => void run(s.id, () => addAnnotation(s.kind, s.spec)),
            { kind: s.kind, spec: s.spec },
          ),
        )}
      </div>

      <h3 className="ann-group">Formas</h3>
      <div className="ann-grid">
        {SHAPES.map((s) =>
          tile(
            s.id,
            s.icon,
            s.label,
            s.hint,
            shapeColor(s),
            () => void run(s.id, () => addAnnotation(s.kind, s.spec)),
            { kind: s.kind, spec: s.spec },
          ),
        )}
      </div>

      <h3 className="ann-group">Imagens</h3>
      <div className="ann-grid">
        {tile("meme", Laugh, "Meme", "Imagem de 2,5 s no canto", "var(--amber)", () => void meme())}
      </div>
      <p className="muted ann-hint">
        <Image size={12} /> Peça também ao Assistente: “põe um balão ‘Olha aqui!’ quando ela fala do
        botão Rodar”.
      </p>
    </section>
  );
}
