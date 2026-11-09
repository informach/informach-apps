import type { Recipe } from "../../../shared/pipelines";

/**
 * The request a pipeline sends to the assistant (Claude Code or Codex, through EdiSVG's tools):
 * the recipe's own instructions, then the facts of this run (the artboard and animation to work
 * in, each sentence with its frames, the images to use, the colours) and the rules that keep the
 * draft reviewable. In Portuguese, as the assistant answers the person.
 */

export interface DraftLine {
  text: string;
  /** Frames of the animation where the sentence is said. */
  from: number;
  to: number;
}

export interface DraftBoard {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface DraftFacts {
  recipe: Pick<Recipe, "name" | "kind" | "style">;
  /** The artboard the animation is in (the scene, or the one open for a screen demo). */
  artboard: { id: string; name: string; width: number; height: number };
  clip: { id: string; fps: number; frames: number };
  lines: DraftLine[];
  /** Artboards of the imported images, usable as component instances. */
  images: DraftBoard[];
  textPalette: string[];
  imagePalette: string[];
  /** Where the narration starts in the lesson (seconds), for the report. */
  lessonStart: number;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function draftRequest(f: DraftFacts): string {
  const lines = f.lines
    .map((l, i) => `${i + 1}. Quadros ${l.from}–${l.to}: "${l.text}"`)
    .join("\n");
  const images = f.images.length
    ? f.images.map((b) => `- ${b.name} [${b.id}] ${b.width}×${b.height}`).join("\n")
    : "(nenhuma)";
  return [
    `Pipeline "${f.recipe.name}". Monte o rascunho da animação desta cena, sincronizado com a narração.`,
    "",
    "## O que a pessoa pediu para esta receita",
    f.recipe.style.trim() || "(sem instruções além das regras abaixo)",
    "",
    "## Onde trabalhar",
    `- Prancheta: "${f.artboard.name}" [${f.artboard.id}], ${f.artboard.width}×${f.artboard.height}.`,
    `- Animação já criada e aberta: [${f.clip.id}], ${f.clip.fps} FPS, ${f.clip.frames} quadros (o quadro 0 é o começo da narração, em ${clock(f.lessonStart)} da aula).`,
    "",
    "## A narração, frase por frase",
    lines,
    "",
    "## Imagens do projeto (pranchetas que podem entrar na cena como instâncias de componente)",
    images,
    "",
    "## Cores",
    `- Textos: ${f.textPalette.join(", ")} (a primeira é a principal).`,
    `- Das imagens: ${f.imagePalette.length ? f.imagePalette.join(", ") : "(nenhuma)"}.`,
    "",
    "## Regras",
    "- Use get_overview e get_objects para ver a cena antes de editar; edite só pelas ferramentas do EdiSVG.",
    `- Anime só a animação [${f.clip.id}], na prancheta [${f.artboard.id}]. Não edite as pranchetas das imagens.`,
    "- Cada ação acontece dentro dos quadros da frase que ela ilustra: entra no começo da frase (até uns 6 quadros antes) e termina antes da frase seguinte.",
    "- Textos curtos (as palavras-chave da frase), nas cores de texto, legíveis no tamanho da prancheta.",
    "- Para mostrar uma imagem que ainda não está na cena, crie uma instância da prancheta dela.",
    "- Não apague nem mova o que veio do projeto além do que a animação pede; o rascunho é revisado pela pessoa.",
    "- Ao terminar, responda com uma linha por frase dizendo o que acontece nela.",
  ].join("\n");
}
