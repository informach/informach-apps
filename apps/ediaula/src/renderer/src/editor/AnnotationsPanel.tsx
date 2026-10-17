import { ANNOTATION_PRESETS, type Annotation, type AnnotationKind } from "@shared/annotation";
import { inPalette, textOn } from "@shared/palettes";
import {
  ArrowUpRight,
  Circle,
  CircleDashed,
  Clapperboard,
  Flag,
  Hash,
  IdCard,
  Image,
  Laugh,
  type LucideIcon,
  MessageCircle,
  Minus,
  RectangleHorizontal,
  Spline,
  Square,
  StickyNote,
  Tag,
  Triangle,
  Type,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { addAnnotation, addCard, addImageOverlay } from "@/lib/annotations";
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
  ): ReactNode => (
    <button
      type="button"
      key={id}
      className="ann-tile"
      disabled={busy !== null}
      onClick={onClick}
      title={hint}
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
        Entram no ponto do cursor ({Math.floor(time / 60)}:
        {String(Math.floor(time % 60)).padStart(2, "0")}), por cima da aula. Arraste no vídeo para
        posicionar.
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
