import { type GuideStyle, guideStyleSchema, type Recipe } from "../../../shared/pipelines";
import { LECTURE_GUIDES, PRESENTER_PLACEMENTS } from "../../../shared/presenterFraming";

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
  /**
   * The part of the draft this request is (runner.ts draftParts), each asked in a conversation of
   * its own; none: the whole draft at once.
   */
  part?: DraftPartFacts;
  /** The presenter of a theory lesson (the "Aula teórica com a apresentadora" recipe). */
  presenter?: {
    /** Her spot (locked, keyed by the run). */
    slotId: string;
    /** The background rectangle and the light behind her, made by the run. */
    backgroundId: string;
    lightId: string;
    /** Her video's file name. */
    video: string;
    shots: {
      from: number;
      to: number;
      /** The name of the placement. */
      placement: string;
      side: "right" | "left";
      /** Sentences (0-based) said in the shot. */
      lines: number[];
      /** Where the content goes while she is on that side (between the guides). */
      column: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        centerX: number;
        centerY: number;
      };
    }[];
  };
}

export interface DraftPartFacts {
  label: string;
  /** 0-based, of `total`. */
  index: number;
  total: number;
  /** Sentences (0-based) of the part; none for the background. */
  lines: number[];
  background?: boolean;
  /** The shot (0-based) of a theory lesson the part is in. */
  shot?: number;
  /** Labels of the parts already done. */
  done: string[];
}

/** A sentence outside the part: enough of it to know the whole, short to keep the request small. */
const OTHER_LINE_CHARS = 80;

/** The ranges of sentences, 1-based ("1–3, 5"). */
const sentenceList = (lines: readonly number[]): string => {
  const out: string[] = [];
  for (const i of lines) {
    const n = i + 1;
    const last = out.at(-1);
    const range = last?.match(/^(\d+)(?:–(\d+))?$/);
    const end = range ? Number(range[2] ?? range[1]) : Number.NaN;
    if (range && end === n - 1) out[out.length - 1] = `${range[1]}–${n}`;
    else out.push(String(n));
  }
  return out.join(", ");
};

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function draftRequest(f: DraftFacts): string {
  const part = f.part;
  const mine = new Set(part?.lines ?? f.lines.map((_, i) => i));
  const lines = f.lines
    .map((l, i) => {
      const text =
        mine.has(i) || l.text.length <= OTHER_LINE_CHARS
          ? l.text
          : `${l.text.slice(0, OTHER_LINE_CHARS).trimEnd()}…`;
      return `${i + 1}. Quadros ${l.from}–${l.to}: "${text}"`;
    })
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
  const presenter = f.presenter ? presenterSection(f.presenter) : [];
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
    part
      ? `Pipeline "${f.recipe.name}". Monte uma parte do rascunho da animação desta cena, sincronizado com a narração: a parte ${part.index + 1} de ${part.total}, ${part.label}.`
      : `Pipeline "${f.recipe.name}". Monte o rascunho da animação desta cena, sincronizado com a narração.`,
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
    ...(f.demo || f.presenter
      ? []
      : [
          "## Imagens do projeto (pranchetas que podem entrar na cena como instâncias de componente)",
          images,
        ]),
    ...demo,
    ...presenter,
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
    ...(part ? partSection(f, part) : []),
    "## Regras",
    "- Use get_overview e get_objects para ver a cena antes de editar; edite só pelas ferramentas do EdiSVG.",
    "- Anime cada objeto com um só comando motion keys, com todas as trilhas dele ({type:'motion',command:{type:'keys',animationId,targetId,tracks:{opacity:[[quadro,0],[quadro,100,'ease-out']],y:[...]}}}), e não com um set-key por chave. Junte vários objetos no mesmo edit_document. A opacidade vai de 0 a 100: 100 é totalmente visível, e 1 seria 1%.",
    `- Anime só a animação [${f.clip.id}], na prancheta [${f.artboard.id}]. Não edite as pranchetas das imagens.`,
    "- Cada ação acontece dentro dos quadros da frase que ela ilustra: entra no começo da frase (até uns 6 quadros antes) e termina antes da frase seguinte.",
    `- Textos curtos (as palavras-chave da frase), nas cores de texto${f.fonts ? " e nas fontes acima" : ""}, legíveis no tamanho da prancheta.`,
    "- Para mostrar uma imagem que ainda não está na cena, crie uma instância da prancheta dela.",
    "- Não apague nem mova o que veio do projeto além do que a animação pede; o rascunho é revisado pela pessoa.",
    part?.background
      ? "- Ao terminar, responda em poucas linhas o que criou no fundo."
      : `- Ao terminar, responda com uma linha por frase${part ? " desta parte" : ""} dizendo o que acontece nela.`,
  ].join("\n");
}

/**
 * What this part is: only its sentences (or only the background), the parts done before (kept as
 * they are) and the ones still to come (not made now).
 */
function partSection(f: DraftFacts, part: DraftPartFacts): string[] {
  const first = part.lines[0] ?? 0;
  const last = part.lines.at(-1) ?? first;
  const from = f.lines[first]?.from ?? 0;
  const to = f.lines[last]?.to ?? f.clip.frames;
  const shot = part.shot === undefined ? undefined : f.presenter?.shots[part.shot];
  const done = part.done.length
    ? [
        `- Já feito em partes anteriores: ${part.done.join(", ")}. Está na prancheta: não altere, mova nem apague, e não leia as trilhas delas (só o que precisar para não sobrepor).`,
      ]
    : [];
  if (part.background)
    return [
      "## Esta parte: só o fundo",
      `- Faça agora só o fundo da animação inteira (quadros 0–${f.clip.frames}): os brilhos grandes, a textura e as estrelinhas, com o movimento deles do começo ao fim, na ordem de camadas pedida acima.`,
      "- Não crie conteúdo de nenhuma frase: cada corte é feito depois, numa parte só dele.",
      ...done,
      "",
    ];
  return [
    `## Esta parte: ${part.label}`,
    shot
      ? `- Anime agora só as frases ${first + 1}–${last + 1} (quadros ${from}–${to}), do Corte ${(part.shot ?? 0) + 1}, na coluna dele. Se o grupo "Corte ${(part.shot ?? 0) + 1} · conteúdo" já existir (a parte anterior deste corte), acrescente nele.`
      : `- Anime agora só as frases ${first + 1}–${last + 1} (quadros ${from}–${to}).`,
    `- As outras frases são feitas em outras partes, cada uma numa conversa separada: não crie, mova nem apague nada delas.${f.presenter ? " O fundo (brilhos, textura e estrelinhas) é de outra parte: não crie outro." : ""}`,
    ...done,
    "",
  ];
}

/**
 * The theory lesson's part of the draft request: the stage the run made, the column of each shot
 * and the layout rules the person approved on the first lesson made with the recipe (19/11/2026),
 * after asking for them one by one (texts behind her, shapes over texts, teal outlines, blocks
 * off the guides, groups split on the thirds lines).
 */
function presenterSection(p: NonNullable<DraftFacts["presenter"]>): string[] {
  const g = LECTURE_GUIDES;
  return [
    "",
    "## A apresentadora e o palco (já montados pelo pipeline)",
    `- Aula teórica: a professora (vídeo "${p.video}", gravado em fundo verde) entra no EdiAula por cima desta animação, que é o fundo da aula inteira. Na prévia, ela já aparece no lugar dela.`,
    `- Já estão na prancheta, do fundo para a frente: [${p.slotId}] "Apresentadora (espaço)" (travado), [${p.backgroundId}] "Fundo" (a cor da tinta) e [${p.lightId}] "Fundo · luz atrás da apresentadora" (o brilho do destaque, que já acompanha cada corte). Não edite, mova, apague nem anime esses três.`,
    `- A ordem final, do fundo para a frente: espaço, Fundo, os brilhos grandes do fundo, a luz atrás dela, a textura, as estrelinhas e o conteúdo. Crie os brilhos grandes e leve-os para baixo da luz.`,
    `- Guias da prancheta: x ${g.left} (margem), x ${g.center} (meio) e x ${g.right} (margem); y ${g.top} (alto) e y ${g.bottom} (baixo). Nenhum conteúdo passa das guias.`,
    "",
    "## Planos e onde vai o conteúdo",
    "Ela fica sempre de um lado, e o conteúdo vai na coluna do outro lado, entre a margem e o meio:",
    ...p.shots.map(
      (s, i) =>
        `- Corte ${i + 1}, quadros ${s.from}–${s.to}, frases ${sentenceList(s.lines)}: ${s.placement}. Conteúdo em x ${s.column.left}–${s.column.right}, centralizado em x ${s.column.centerX}; na altura, entre y ${s.column.top} e ${s.column.bottom}, centralizado em y ${s.column.centerY}.`,
    ),
    "",
    "## Layout (como a pessoa aprovou)",
    "- Cada momento da fala é um bloco (título, ícone, frase de apoio, cards…): o bloco inteiro fica centralizado na coluna do corte, na largura e na altura. Calcule a altura do bloco e ponha o meio dele no centro da coluna. Não espalhe as partes de um bloco por linhas de terços.",
    "- Dentro do bloco, espaços parecidos entre as partes. Um momento por vez: quando o assunto muda dentro do mesmo corte, o bloco anterior sai antes de o próximo terminar de entrar.",
    '- Agrupe cada momento num grupo "F<número da frase> · <assunto>" e o conteúdo de cada corte num grupo "Corte <n> · conteúdo". Posicione pelos grupos, para as animações das peças continuarem iguais.',
    `- Largura: estime um texto em cerca de 0,5 × o tamanho da letra por caractere (Baloo 2 negrito). Uma linha que não cabe na coluna (${g.center - g.left} px menos uns 40 px de folga de cada lado) diminui a letra (título no mínimo 56 px) ou quebra em duas linhas.`,
    "- Texto dentro de forma (círculo, card, etiqueta): pelo menos 24 px de folga até a borda. Nenhuma forma (ícone, coração, estrela) fica por cima de um texto. Se dois elementos se cruzam, afaste-os ou aumente a forma.",
    "- Listas de no máximo 3 itens por momento; mais que isso vira dois momentos.",
    "- Desenhos de várias peças: crie primeiro as de trás e por último as da frente (telhado e coração na frente da casa, por exemplo). Confira a ordem no grupo.",
    '- Toda forma e todo caminho que você criar levam stroke explícito: "none" quando não há contorno. Sem isso, o EdiSVG põe nos caminhos novos um contorno verde-água (#4fe3c1) que a pessoa não quer. Contorno só quando a linha é o desenho (um X, uma seta, uma trilha).',
  ];
}

/**
 * The question that picks the presenter's shots of a theory lesson: one placement per sentence,
 * as JSON only (parsePlacements reads it), before the animation is drawn. The rules are the ones
 * the person approved on the first lesson made with the recipe.
 */
export function framingRequest(f: {
  recipe: Pick<Recipe, "name" | "style">;
  lines: readonly DraftLine[];
  fps: number;
}): string {
  const seconds = (frames: number) => (frames / f.fps).toFixed(1);
  return [
    `Pipeline "${f.recipe.name}". Numa aula teórica, a professora (gravada em fundo verde) aparece sobre uma animação de tela inteira. Escolha onde ela fica em cada frase da narração, como planos de câmera que cortam entre as frases.`,
    "Responda só com um JSON, sem nenhum outro texto, sem usar ferramentas e sem alterar o projeto:",
    `{"posicoes": ["medium-right", "..."]} — uma posição por frase, na ordem (${f.lines.length} no total).`,
    "",
    "## Posições",
    ...PRESENTER_PLACEMENTS.map((p) => `- "${p.id}" (${p.label}): ${p.use}.`),
    "",
    "## O que a pessoa pediu para esta receita",
    f.recipe.style.trim() || "(sem instruções)",
    "",
    "## A narração, frase por frase (segundos)",
    ...f.lines.map((l, i) => `${i + 1}. ${seconds(l.from)}–${seconds(l.to)} s: "${l.text}"`),
    "",
    "## Regras",
    "- Só plano médio e médio curto: nada de plano inteiro, americano ou dela no centro. Ela fica sempre de um lado, e o conteúdo, do outro.",
    '- O médio é o plano padrão. O médio curto entra nas falas diretas com quem assiste: o cumprimento ("Oi!"), a apresentação ("eu sou…"), uma pergunta direta ("E você?"), um pedido ("Fica comigo").',
    "- Troque de lado quando o assunto muda, para manter o ritmo de cortes (um corte a cada 8 a 20 segundos, mais ou menos). Quando dois cortes seguidos ficam do mesmo lado, mude o plano entre eles (médio ↔ médio curto), para o corte aparecer.",
    "- Mantenha cada plano por várias frases. Planos de menos de 3 segundos são juntados ao anterior.",
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
