import { type GuideStyle, guideStyleSchema, type Recipe } from "../../../shared/pipelines";

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

/** The design kit imported into the project: its pieces (artboards) and its colours. */
export interface DraftKit {
  boards: DraftBoard[];
  palette: string[];
}

/** A font of the run, embedded in the project as a font asset. */
export interface DraftFont {
  family: string;
  weight: number;
  assetId: string;
}

/** The fonts of the run: the titles', the body's, and the body's bold for emphasis. */
export interface DraftFonts {
  title: DraftFont;
  body: DraftFont;
  bodyBold: DraftFont;
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
  /** The fonts embedded for the run (null: none, the texts keep the system's). */
  fonts: DraftFonts | null;
  imagePalette: string[];
  /** The project's design kit, when one was imported. */
  kit?: DraftKit;
  /** The style guide chosen in the assistant panel (shared/styleGuide.ts), as text. */
  guide?: string | null;
  /** How many of the attached images, first, are the recipe's style guide picture, in parts. */
  guideParts?: number;
  /** Where the narration starts in the lesson (seconds), for the report. */
  lessonStart: number;
  /** The screen demonstration under the layer (the "Demonstração passo a passo" recipe). */
  demo?: {
    video: { name: string; width: number; height: number };
    /** Clicks saved with the recording, on the animation's frames and the artboard's pixels. */
    clicks: { frame: number; x: number; y: number }[] | null;
    /** Artboards of the ready elements (arrow, balloon, highlight, click). */
    elements: DraftBoard[];
    /** Frames of the video attached to this request, in order. */
    attached: { frame: number; text: string }[];
  };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function draftRequest(f: DraftFacts): string {
  const lines = f.lines
    .map((l, i) => `${i + 1}. Quadros ${l.from}–${l.to}: "${l.text}"`)
    .join("\n");
  const images = f.images.length
    ? f.images.map((b) => `- ${b.name} [${b.id}] ${b.width}×${b.height}`).join("\n")
    : "(nenhuma)";
  const demo = f.demo
    ? [
        "",
        "## A demonstração por baixo",
        `- O vídeo "${f.demo.video.name}" (${f.demo.video.width}×${f.demo.video.height}) fica por baixo desta prancheta, do mesmo tamanho: um ponto (x, y) da prancheta é o mesmo pixel do vídeo. Ele começa junto com a primeira frase.`,
        "- Esta prancheta vira uma camada transparente sobre o vídeo no EdiAula: não desenhe fundo, nem nada que cubra a área que está sendo mostrada.",
        f.demo.clicks?.length
          ? `- Cliques gravados (quadro: x, y): ${f.demo.clicks
              .slice(0, 60)
              .map((c) => `${c.frame}: ${c.x}, ${c.y}`)
              .join(
                "; ",
              )}${f.demo.clicks.length > 60 ? "; …" : ""}. Use-os para apontar setas e destaques onde a professora clica.`
          : "- O vídeo não tem cursor salvo: veja os quadros anexados para saber onde ela mexe.",
        f.demo.attached.length
          ? `- Quadros anexados${f.guideParts ? " (depois do guia de estilo)" : ""}, na ordem: ${f.demo.attached.map((a) => `quadro ${a.frame} ("${a.text.slice(0, 60)}")`).join("; ")}.`
          : "",
        "",
        "## Elementos prontos (pranchetas para usar como instâncias de componente)",
        f.demo.elements.map((b) => `- ${b.name} [${b.id}] ${b.width}×${b.height}`).join("\n") ||
          "(nenhum)",
      ].filter((line) => line !== "")
    : [];
  const kit = f.kit?.boards.length
    ? [
        "## Kit de design do projeto (pranchetas para usar como instâncias de componente)",
        f.kit.boards.map((b) => `- ${b.name} [${b.id}] ${b.width}×${b.height}`).join("\n"),
        ...(f.kit.palette.length ? [`- Cores do kit: ${f.kit.palette.join(", ")}.`] : []),
        "- Prefira as peças do kit (balões, etiquetas, botões, ícones, personagens) a desenhar as suas, e as cores dele nos textos e formas novos.",
        "- Para trocar o texto de uma peça, ache o id do texto na prancheta dela (get_objects) e mude-o na instância, pelas substituições (overrides). Não edite as pranchetas do kit.",
        "",
      ]
    : [];
  const parts = f.guideParts ?? 0;
  const guidePicture = parts
    ? [
        "## Guia de estilo da receita (imagem anexada)",
        parts > 1
          ? `- As ${parts} primeiras imagens anexadas são o guia de estilo, em partes de cima para baixo (cada parte repete um pouco do fim da anterior).`
          : "- A primeira imagem anexada é o guia de estilo.",
        "- Siga o guia em tudo que criar: as cores pelo papel que ele dá a cada uma, as fontes, os tamanhos e pesos, os componentes, o grid, os espaçamentos e as regras do que fazer e evitar.",
        "- Quando o guia e o resto deste pedido discordarem (as instruções da receita, as cores de texto, o tamanho dos textos), vale o guia.",
        "- As cores de texto e as fontes abaixo foram lidas deste guia (as fontes já estão no projeto): use-as nos papéis que o guia dá a elas.",
        "",
      ]
    : [];
  return [
    `Pipeline "${f.recipe.name}". Monte o rascunho da animação desta cena, sincronizado com a narração.`,
    "",
    ...guidePicture,
    ...(f.guide ? [f.guide, ""] : []),
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
    ...(f.demo
      ? []
      : [
          "## Imagens do projeto (pranchetas que podem entrar na cena como instâncias de componente)",
          images,
        ]),
    ...demo,
    "",
    ...kit,
    "## Cores",
    `- Textos: ${f.textPalette.join(", ")} (a primeira é a principal).`,
    `- Das imagens: ${f.imagePalette.length ? f.imagePalette.join(", ") : "(nenhuma)"}.`,
    "",
    ...(f.fonts
      ? [
          "## Fontes (já incorporadas ao projeto)",
          `- Títulos: ${f.fonts.title.family} ${f.fonts.title.weight}, recurso [${f.fonts.title.assetId}].`,
          `- Corpo: ${f.fonts.body.family} ${f.fonts.body.weight}, recurso [${f.fonts.body.assetId}]; destaque no corpo: ${f.fonts.bodyBold.family} ${f.fonts.bodyBold.weight}, recurso [${f.fonts.bodyBold.assetId}].`,
          "- Logo depois de criar cada texto, aplique a fonte dele com edit_document: {type:'asset',operation:'set-font',targetId:<id do texto>,assetId:<recurso>}. Título é o texto principal e maior da cena; o resto é corpo.",
          "",
        ]
      : []),
    "## Regras",
    "- Use get_overview e get_objects para ver a cena antes de editar; edite só pelas ferramentas do EdiSVG.",
    `- Anime só a animação [${f.clip.id}], na prancheta [${f.artboard.id}]. Não edite as pranchetas das imagens.`,
    "- Cada ação acontece dentro dos quadros da frase que ela ilustra: entra no começo da frase (até uns 6 quadros antes) e termina antes da frase seguinte.",
    `- Textos curtos (as palavras-chave da frase), nas cores de texto${f.fonts ? " e nas fontes acima" : ""}, legíveis no tamanho da prancheta.`,
    "- Para mostrar uma imagem que ainda não está na cena, crie uma instância da prancheta dela.",
    "- Não apague nem mova o que veio do projeto além do que a animação pede; o rascunho é revisado pela pessoa.",
    "- Ao terminar, responda com uma linha por frase dizendo o que acontece nela.",
  ].join("\n");
}

/**
 * The question that reads a style guide picture once (its parts attached, top to bottom): the
 * colours of the texts and the fonts, from the fonts that come with EdiSVG, as JSON only.
 */
export function guideStyleRequest(parts: number, families: readonly string[]): string {
  return [
    parts > 1
      ? `As ${parts} imagens anexadas são um guia de estilo, em partes de cima para baixo.`
      : "A imagem anexada é um guia de estilo.",
    "Leia o guia e responda só com um JSON, sem nenhum outro texto, sem usar ferramentas e sem alterar o projeto:",
    '{"textPalette": ["#rrggbb", "..."], "fonts": {"title": "Família", "body": "Família"}}',
    "",
    "- textPalette: de 3 a 8 cores do guia para textos e destaques, nesta ordem: primeiro a cor clara de cards e balões (onde o texto fica por cima), em segundo a cor principal dos textos (a tinta), por último a cor de destaque (setas, contornos, o que chama atenção); as outras cores de papel do guia ficam no meio. Use os códigos hexadecimais escritos no guia quando houver.",
    "- fonts: a fonte dos títulos e a do corpo do texto, como o guia pede. Escolha só entre estas famílias, que vêm com o EdiSVG; se o guia pedir outra, use a mais parecida desta lista:",
    families.join(", "),
  ].join("\n");
}

/**
 * The colours and fonts in the assistant's answer: the JSON in it (alone or in a code block),
 * checked; a font is taken by its name in any case. Throws a message for the person otherwise.
 */
export function parseGuideStyle(text: string, families: readonly string[]): GuideStyle {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("O assistente não devolveu as cores e as fontes do guia de estilo.");
  }
  const value = raw as { textPalette?: unknown; fonts?: { title?: unknown; body?: unknown } };
  const family = (name: unknown, role: string): string => {
    const found = families.find(
      (f) => typeof name === "string" && f.toLowerCase() === name.trim().toLowerCase(),
    );
    if (!found)
      throw new Error(
        `A fonte ${role} do guia (${String(name)}) não vem com o EdiSVG: o guia precisa usar uma das fontes do EdiSVG.`,
      );
    return found;
  };
  const style = guideStyleSchema.safeParse({
    textPalette: Array.isArray(value.textPalette)
      ? value.textPalette.map((c) => (typeof c === "string" ? c.trim().toLowerCase() : c))
      : value.textPalette,
    fonts: {
      title: family(value.fonts?.title, "dos títulos"),
      body: family(value.fonts?.body, "do corpo"),
    },
  });
  if (!style.success)
    throw new Error("As cores que o assistente leu do guia de estilo não são válidas.");
  return style.data;
}
