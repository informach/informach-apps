import type { DesignKit } from "./designKit";

/**
 * A style guide the assistant follows without a reference image: the rules of a family of
 * lessons (format, palette, type, the boxes whose colour says their role, the components, the
 * order of the slides) as text for every conversation and pipeline, plus the same pieces as a
 * design kit (artboards "Kit · …", the way Arquivo › Importar kit de design brings them in).
 *
 * The first guide is "Zero Kids · Kit de slides", the kit of the video lessons (the same one the
 * EdiAula's annotations and templates follow: apps/ediaula/src/shared/annotation.ts, KIT).
 */

export interface GuideColor {
  hex: string;
  name: string;
  /** What the colour is for, as the guide says it. */
  use: string;
}

export interface StyleGuide {
  id: string;
  name: string;
  /** One line under the name: what the guide is. */
  summary: string;
  /** The slide, in pixels. */
  frame: { width: number; height: number };
  fonts: { title: string; body: string };
  palette: GuideColor[];
  /** The colours of the recipes' text palette, in their order: the lightest first (the main
   *  colour), the darkest next (the outline) and the liveliest last (the accent). */
  textPalette: string[];
  /** The rules, as Markdown sections the assistant reads. */
  sections: { title: string; lines: string[] }[];
}

const ZERO_KIDS_PALETTE: GuideColor[] = [
  { hex: "#E9EEF6", name: "Fundo claro", use: "fundo padrão dos slides" },
  { hex: "#0F1A33", name: "Tinta", use: "títulos e texto principal" },
  { hex: "#46536E", name: "Tinta suave", use: "subtítulos, apoio, notas" },
  { hex: "#FFFFFF", name: "Branco", use: 'cards e caixa "Ação"' },
  { hex: "#1B5CF3", name: "Azul Zero", use: "fundo da capa, números de passo" },
  { hex: "#0B7A54", name: "Verde reação", use: "resultado, checks; texto amarelo sobre ele" },
  { hex: "#FFC02E", name: "Amarelo", use: "instrução, destaque, números" },
  { hex: "#121A30", name: "Azul-noite", use: "etiquetas, avisos, próxima aula" },
  { hex: "#E8A317", name: "Âmbar", use: "borda das opções do quiz" },
  { hex: "#2B1D0E", name: "Marrom", use: "texto sobre amarelo" },
  { hex: "#FFF3C4", name: "Creme pausa", use: 'fundo do "Pause e pense"' },
  { hex: "#6E9BFF", name: "Azul jogo", use: 'fundo do "Conheça o jogo"' },
  { hex: "#E2EBFF", name: "Apoio · subtítulo na capa", use: "subtítulo sobre o azul da capa" },
  { hex: "#B9C6D9", name: "Apoio · número discreto", use: "número apagado dos cards" },
  { hex: "#D6DEEA", name: "Apoio · borda fina", use: "borda fina de cards e molduras" },
];

export const ZERO_KIDS: StyleGuide = {
  id: "zero-kids",
  name: "Zero Kids · Kit de slides",
  summary:
    "Aulas em vídeo para crianças (9+): fundo claro, uma área fixa para a apresentadora e caixas com cor de significado.",
  frame: { width: 1280, height: 720 },
  fonts: { title: "Baloo 2", body: "Nunito" },
  palette: ZERO_KIDS_PALETTE,
  textPalette: ["#FFFFFF", "#0F1A33", "#1B5CF3", "#0B7A54", "#FFC02E"],
  sections: [
    {
      title: "Formato e grid (px no slide 1280×720, 16:9)",
      lines: [
        "Margem esquerda 64. Título em top 44; subtítulo em top 112–130; conteúdo de top 150–170, de x 64 até 844 (largura máxima 780). Nota de rodapé em top 600–640. Espaço entre cards: 20.",
        "Apresentadora sempre à direita, colada embaixo: right 40, largura 500–580, a partir de x 880. Nunca ponha conteúdo em x ≥ 880.",
        "Sombras: nenhuma. A profundidade vem só pela cor.",
        "Ícones Lucide de traço (2,4), brancos, dentro de um círculo colorido.",
      ],
    },
    {
      title: "Tipografia (Baloo 2 = falar alto, Nunito = explicar)",
      lines: [
        "Título da capa: Baloo 2 800, 104 px, branco sobre azul. Título do slide: Baloo 2 800, 60 px, line-height 1. Pergunta de quiz: Baloo 2 800, 48 px.",
        "Texto de card ou caixa: Baloo 2 800, 28–56 px (cards 30–34). Subtítulo: Nunito 700, 24–30 px. Texto de apoio: Nunito 600–700, 19–22 px (mínimo 22 no corpo).",
        "Etiqueta: Nunito 800, 12–18 px, CAIXA ALTA, espaçamento 0,08em.",
      ],
    },
    {
      title: "Caixas de significado (a cor diz o papel; nunca troque o significado)",
      lines: [
        "Ação — branca: ação, termo, rótulo. O que a criança faz ou o nome de algo. Texto azul-escuro #0F1A33.",
        "Reação — verde #0B7A54: reação, resultado. O que o jogo responde. Texto amarelo #FFC02E.",
        "Pegue! — amarela #FFC02E: instrução, meta. O que fazer agora. Texto escuro #2B1D0E.",
        "Próxima — azul-noite #121A30: destaque. Avisos fortes e próxima aula. Texto branco.",
        "Ação → Reação: uma seta cheia azul-noite liga causa e efeito. Raio das caixas: 20.",
      ],
    },
    {
      title: "Componentes (medidas no slide 1280×720)",
      lines: [
        "Card de objetivo: branco, raio 24, altura 116; ícone Lucide branco num círculo de 64 (azul, âmbar ou verde); texto Baloo 34; número discreto #B9C6D9 à direita.",
        "Card de passo (prática): número branco num círculo azul de 60; título Baloo 32; apoio Nunito 600 19; visual opcional à direita.",
        "Opção de quiz: branco, borda âmbar 3, raio 22, altura 92; letra num quadrado amarelo de 52 (raio 14); Baloo 30; sempre A, B, C.",
        "Etiqueta: pílula (raio 999) azul-noite, Nunito 800 caixa alta 12–18. Tempo: pílula amarela, Baloo 24, ao lado do título.",
        "Balão numerado sobre imagem: raio 20, Baloo 30, nas cores das caixas de significado; número azul-noite de 36 no canto superior esquerdo; rabinho apontando para o alvo.",
        "Bloco de código: valores em pílulas brancas; marque linhas com números amarelos de 28 à esquerda; para explicar um bloco, dê zoom e contorne em amarelo (borda 4). Legenda: #B55A00 evento/variável, #C8246F ação, #7A3D00 menu.",
        'Lista "O que aprendemos": check branco num círculo verde de 52, Baloo 34, sem card de fundo, até 3 itens.',
        'Card "Próxima aula": azul-noite, raio 30; ícone num círculo azul de 72; etiqueta amarela em caixa alta; título branco Baloo 36.',
        "Legenda numerada: card branco raio 20; número amarelo 28; termo Baloo 22 + explicação Nunito 15; liga com os números do bloco ou da imagem.",
      ],
    },
    {
      title: "Sequência da aula (10 slides; a ordem se repete em toda aula)",
      lines: [
        '1 Capa: fundo Azul Zero, logo, etiqueta módulo · aula, título 104, Zappy + estrelas. 2 Objetivo: "Hoje você vai…", 3 cards de objetivo com ícone + frase-resultado. 3 Conheça o jogo: fundo #6E9BFF, tela do jogo com moldura 8 px e balões 1-2-3.',
        '4 Conceito: título + subtítulo; Ação → Reação + exemplo curto. 5 Exemplos: 2 colunas "EXEMPLO 1/2", caixa branca ↓ caixas verdes. 6 Como funciona (código): código completo + números amarelos + legenda à direita. 7 Como funciona (um bloco): 1 bloco ampliado com contorno amarelo + desenho explicativo.',
        '8 Pause e pense: fundo creme, pílula "PAUSE O VÍDEO", pergunta 48, opções A/B/C. 9 Agora é com você!: pílula de tempo + 3 cards de passo numerados. 10 O que aprendemos: 3 checks verdes + card azul-noite "Próxima aula".',
      ],
    },
    {
      title: "Regras de ouro",
      lines: [
        "Uma ideia por slide. No máximo 3 caixas, numeradas na ordem. Título Baloo 60 · caixas 28 a 56 · texto 22+.",
        "Destaque amarelo no lugar da seta vermelha. Bloco de código grande: dê zoom, não encolha. Apresentadora sempre no mesmo lugar.",
        'Faça: frases curtas, no presente, falando com a criança ("você"); cantos arredondados em tudo (14–30), pílulas totalmente redondas; personagens (Zappy, apresentadora, aluna) dão emoção: pensando no quiz, feliz no final.',
        "Evite: sombras, gradientes, bordas grossas e setas vermelhas; mudar o significado das cores das caixas; conteúdo na área da apresentadora (x ≥ 880); mais de 3 itens por lista ou texto de corpo abaixo de 22 px.",
      ],
    },
  ],
};

export const STYLE_GUIDES: readonly StyleGuide[] = [ZERO_KIDS];

export const styleGuideById = (id: string | null | undefined): StyleGuide | undefined =>
  STYLE_GUIDES.find((guide) => guide.id === id);

/** The most a guide's text takes of a message to the assistant (the main process allows 32000). */
export const GUIDE_TEXT_MAX = 8000;

/**
 * The guide as the assistant reads it, at the top of a conversation's message or a pipeline's
 * request: the palette by role, the fonts, then every section. Within GUIDE_TEXT_MAX.
 */
export function styleGuideText(guide: StyleGuide): string {
  const lines = [
    `# Guia de estilo: ${guide.name}`,
    guide.summary,
    `Slide ${guide.frame.width}×${guide.frame.height}. Fontes: ${guide.fonts.title} (títulos, caixas e números) e ${guide.fonts.body} (subtítulos, apoio, etiquetas).`,
    "",
    "## Paleta",
    ...guide.palette.map((p) => `- ${p.hex} ${p.name}: ${p.use}.`),
    ...guide.sections.flatMap((s) => ["", `## ${s.title}`, ...s.lines.map((l) => `- ${l}`)]),
    "",
    'Siga este guia em tudo que criar: as cores pelo papel, as fontes, os tamanhos e as regras. Com um kit do guia no projeto (pranchetas "Kit · …"), prefira as peças dele a desenhar outras.',
  ];
  return lines.join("\n").slice(0, GUIDE_TEXT_MAX);
}

/* ---------- The guide as a design kit ---------- */

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const svg = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;

/** A text of the kit: Baloo 2 (title) or Nunito (body), at a weight, anchored where asked. */
function text(
  x: number,
  y: number,
  content: string,
  opts: {
    font: "title" | "body";
    size: number;
    weight?: number;
    fill: string;
    anchor?: "start" | "middle" | "end";
    spacing?: string;
  },
): string {
  const family = opts.font === "title" ? ZERO_KIDS.fonts.title : ZERO_KIDS.fonts.body;
  const weight = opts.weight ?? (opts.font === "title" ? 800 : 700);
  return `<text x="${x}" y="${y}" font-family="${esc(family)}" font-size="${opts.size}" font-weight="${weight}" fill="${opts.fill}" text-anchor="${opts.anchor ?? "start"}"${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ""}>${esc(content)}</text>`;
}

/** Lucide's check, drawn with a stroke of 2.4 at 24 units, scaled to `size` and centred. */
const check = (cx: number, cy: number, size: number, stroke: string): string =>
  `<path d="M${cx - size * 0.3} ${cy} l${size * 0.2} ${size * 0.2} l${size * 0.4} -${size * 0.4}" fill="none" stroke="${stroke}" stroke-width="${(size / 24) * 2.4}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Lucide's star, as a filled polygon. */
const star = (cx: number, cy: number, r: number, fill: string): string => {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    points.push(
      `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`,
    );
  }
  return `<polygon points="${points.join(" ")}" fill="${fill}"/>`;
};

/** A box of meaning: the colour says its role (section "Caixas de significado"). */
const box = (fill: string, ink: string, label: string, stroke?: string): string =>
  svg(
    360,
    110,
    `<rect x="4" y="4" width="352" height="102" rx="20" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="2"` : ""}/>${text(180, 71, label, { font: "title", size: 44, fill: ink, anchor: "middle" })}`,
  );

/**
 * The guide's pieces as a design kit (shared/designKit.ts): the palette sheet, the boxes of
 * meaning, the cards, the labels and the backgrounds, each an SVG the importer reads. The
 * artboards come in as "Kit · <pasta> · <peça>", so the pipelines offer them to the assistant.
 */
export function styleGuideKit(guide: StyleGuide): DesignKit {
  const byName = new Map(guide.palette.map((p) => [p.name, p.hex]));
  /** A colour of the guide by its name; a guide missing one is a mistake in this module. */
  const c = (name: string): string => {
    const hex = byName.get(name);
    if (!hex) throw new Error(`O guia "${guide.name}" não tem a cor "${name}".`);
    return hex;
  };
  const ink = c("Tinta");
  const night = c("Azul-noite");
  const yellow = c("Amarelo");
  const blue = c("Azul Zero");
  const green = c("Verde reação");
  // The palette sheet: a name then its colour, as sheetColors reads them.
  const sheet = svg(
    900,
    40 + guide.palette.length * 44,
    guide.palette
      .map(
        (p, i) =>
          `<rect x="20" y="${20 + i * 44}" width="36" height="36" rx="8" fill="${p.hex}"/>${text(72, 46 + i * 44, p.name, { font: "body", size: 20, fill: ink })}${text(420, 46 + i * 44, p.hex, { font: "body", size: 20, weight: 600, fill: c("Tinta suave") })}`,
      )
      .join(""),
  );
  const files: DesignKit["files"] = [
    { path: "paleta.svg", svg: sheet },
    { path: "caixas/Ação.svg", svg: box(c("Branco"), ink, "Ação", c("Apoio · borda fina")) },
    { path: "caixas/Reação.svg", svg: box(green, yellow, "Reação") },
    { path: "caixas/Pegue.svg", svg: box(yellow, c("Marrom"), "Pegue!") },
    { path: "caixas/Próxima.svg", svg: box(night, c("Branco"), "Próxima") },
    {
      path: "caixas/Seta causa-efeito.svg",
      svg: svg(160, 60, `<path d="M8 22 H104 V6 L152 30 L104 54 V38 H8 Z" fill="${night}"/>`),
    },
    {
      path: "cards/Card de objetivo.svg",
      svg: svg(
        780,
        116,
        `<rect x="0" y="0" width="780" height="116" rx="24" fill="${c("Branco")}"/><circle cx="66" cy="58" r="32" fill="${blue}"/>${star(66, 58, 15, c("Branco"))}${text(120, 70, "Mover o personagem", { font: "title", size: 34, fill: ink })}${text(740, 70, "1", { font: "title", size: 30, fill: c("Apoio · número discreto"), anchor: "end" })}`,
      ),
    },
    {
      path: "cards/Card de passo.svg",
      svg: svg(
        780,
        120,
        `<rect x="0" y="0" width="780" height="120" rx="24" fill="${c("Branco")}"/><circle cx="64" cy="60" r="30" fill="${blue}"/>${text(64, 71, "1", { font: "title", size: 32, fill: c("Branco"), anchor: "middle" })}${text(116, 54, "Troque a cor do fundo", { font: "title", size: 32, fill: ink })}${text(116, 86, "Clique no quadradinho azul do bloco.", { font: "body", size: 19, weight: 600, fill: c("Tinta suave") })}`,
      ),
    },
    {
      path: "cards/Opção de quiz.svg",
      svg: svg(
        780,
        92,
        `<rect x="2" y="2" width="776" height="88" rx="22" fill="${c("Branco")}" stroke="${c("Âmbar")}" stroke-width="3"/><rect x="20" y="20" width="52" height="52" rx="14" fill="${yellow}"/>${text(46, 57, "A", { font: "title", size: 30, fill: c("Marrom"), anchor: "middle" })}${text(92, 57, "A chave some.", { font: "title", size: 30, fill: ink })}`,
      ),
    },
    {
      path: "cards/Item aprendido.svg",
      svg: svg(
        780,
        60,
        `<circle cx="30" cy="30" r="26" fill="${green}"/>${check(30, 30, 30, c("Branco"))}${text(76, 42, "Toda ação tem uma reação.", { font: "title", size: 34, fill: ink })}`,
      ),
    },
    {
      path: "cards/Card próxima aula.svg",
      svg: svg(
        560,
        120,
        `<rect x="0" y="0" width="560" height="120" rx="30" fill="${night}"/><circle cx="66" cy="60" r="36" fill="${blue}"/>${star(66, 60, 17, c("Branco"))}${text(124, 46, "PRÓXIMA AULA", { font: "body", size: 14, weight: 800, fill: yellow, spacing: "0.08em" })}${text(124, 86, "O barco que navega", { font: "title", size: 36, fill: c("Branco") })}`,
      ),
    },
    {
      path: "cards/Legenda numerada.svg",
      svg: svg(
        420,
        72,
        `<rect x="0" y="0" width="420" height="72" rx="20" fill="${c("Branco")}"/><circle cx="36" cy="36" r="16" fill="${yellow}"/>${text(36, 43, "1", { font: "title", size: 20, fill: c("Marrom"), anchor: "middle" })}${text(68, 32, "Tela", { font: "title", size: 22, fill: ink })}${text(68, 56, "Tamanho e cor do jogo", { font: "body", size: 15, weight: 600, fill: c("Tinta suave") })}`,
      ),
    },
    {
      path: "etiquetas/Etiqueta.svg",
      svg: svg(
        260,
        40,
        `<rect x="0" y="0" width="260" height="40" rx="20" fill="${night}"/>${text(130, 26, "MÓDULO 2 · AULA 4", { font: "body", size: 15, weight: 800, fill: c("Branco"), anchor: "middle", spacing: "0.08em" })}`,
      ),
    },
    {
      path: "etiquetas/Pause o vídeo.svg",
      svg: svg(
        260,
        48,
        `<rect x="0" y="0" width="260" height="48" rx="24" fill="${night}"/><rect x="24" y="16" width="5" height="16" rx="1.5" fill="${c("Branco")}"/><rect x="33" y="16" width="5" height="16" rx="1.5" fill="${c("Branco")}"/>${text(150, 31, "PAUSE O VÍDEO", { font: "body", size: 16, weight: 800, fill: c("Branco"), anchor: "middle", spacing: "0.08em" })}`,
      ),
    },
    {
      path: "etiquetas/Tempo.svg",
      svg: svg(
        200,
        48,
        `<rect x="0" y="0" width="200" height="48" rx="24" fill="${yellow}"/><circle cx="30" cy="24" r="10" fill="none" stroke="${c("Marrom")}" stroke-width="2.4"/><path d="M30 18 V24 L34 27" fill="none" stroke="${c("Marrom")}" stroke-width="2.4" stroke-linecap="round"/>${text(52, 33, "5 minutos", { font: "title", size: 24, fill: c("Marrom") })}`,
      ),
    },
    {
      path: "etiquetas/Balão numerado.svg",
      svg: svg(
        280,
        100,
        `<path d="M24 12 H256 Q276 12 276 32 V72 Q276 92 256 92 H120 L96 100 L100 92 H24 Q4 92 4 72 V32 Q4 12 24 12 Z" fill="${c("Branco")}" stroke="${c("Apoio · borda fina")}" stroke-width="2"/><circle cx="24" cy="18" r="18" fill="${night}"/>${text(24, 25, "1", { font: "title", size: 20, fill: c("Branco"), anchor: "middle" })}${text(150, 63, "Personagem", { font: "title", size: 30, fill: ink, anchor: "middle" })}`,
      ),
    },
    {
      path: "etiquetas/Destaque amarelo.svg",
      svg: svg(
        320,
        200,
        `<rect x="2" y="2" width="316" height="196" rx="18" fill="none" stroke="${yellow}" stroke-width="4"/>`,
      ),
    },
    {
      path: "fundos/Fundo claro.svg",
      svg: svg(
        guide.frame.width,
        guide.frame.height,
        `<rect width="${guide.frame.width}" height="${guide.frame.height}" fill="${c("Fundo claro")}"/>`,
      ),
    },
    {
      path: "fundos/Fundo da capa.svg",
      svg: svg(
        guide.frame.width,
        guide.frame.height,
        `<rect width="${guide.frame.width}" height="${guide.frame.height}" fill="${blue}"/>`,
      ),
    },
    {
      path: "fundos/Fundo pause e pense.svg",
      svg: svg(
        guide.frame.width,
        guide.frame.height,
        `<rect width="${guide.frame.width}" height="${guide.frame.height}" fill="${c("Creme pausa")}"/>`,
      ),
    },
  ];
  return { name: guide.name, files, left: [] };
}
