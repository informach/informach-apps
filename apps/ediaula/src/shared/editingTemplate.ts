import { clipSpeed, projectDuration } from "./timeline.ts";
import type { Project } from "./types.ts";

const clean = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/[\\`*_{}[\]<>#|]/g, (c) => `\\${c}`)
    .trim();
const stamp = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
const jsonBlock = (value: unknown): string => {
  const json = JSON.stringify(value, null, 2);
  const fence = "`".repeat(Math.max(3, ...[...json.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${fence}json\n${json}\n${fence}`;
};

/** A portable reference, with semantic media slots instead of local paths or project IDs. */
export function buildEditingTemplate(
  project: Project,
  words: { start: number; end: number; text: string }[] = [],
  notes = "",
): string {
  const used = new Set(project.clips.map((c) => c.assetId));
  const assets = project.assets.filter((a) => used.has(a.id));
  const media = new Map(assets.map((a, i) => [a.id, `M${i + 1}`]));
  const tracks = new Map(project.tracks.map((t, i) => [t.id, `F${i + 1}`]));
  const clips = [...project.clips].sort((a, b) => a.start - b.start);
  const out = [
    `# Modelo de edição — ${clean(project.name)}`,
    "",
    "Formato: EdiAula / modelo de referência v1",
    "",
    `- Aula de referência: ${clean(project.name)}`,
    `- Curso: ${clean(project.course ?? "Não informado")}`,
    `- Formato: ${project.settings.width} × ${project.settings.height}, ${project.settings.fps} fps`,
    `- Duração da edição de referência: ${stamp(projectDuration(project))}`,
    "",
    "## Como replicar em outra aula",
    "",
    "1. Abra o projeto de destino e leia sua transcrição e seu roteiro.",
    "2. Associe as mídias M1, M2… e as faixas F1, F2… abaixo às mídias e faixas do novo projeto. Os identificadores são locais a este modelo.",
    "3. Reutilize estilos, posições, organização, ritmo e tipos de efeito. Adapte os textos dos balões, títulos e chamadas ao conteúdo da nova aula.",
    "4. Localize as falas e os acontecimentos equivalentes. Os tempos abaixo pertencem à aula original: não copie cortes, zooms ou movimentos de cursor cegamente.",
    "5. Apresente uma proposta para mudanças amplas e cortes. Preserve trechos protegidos e faixas travadas. Revise prévia, legibilidade, áudio e sincronismo.",
    "",
    "Este arquivo não contém vídeos nem substitui um projeto .ediaula. A lista de clipes descreve a edição final, não o histórico de cortes ou a intenção do editor. Regiões sem fala precisam ser identificadas pelo conteúdo visual. Nenhuma configuração de exportação foi inferida.",
    "",
    "## Estilo geral",
    "",
    jsonBlock({
      format: project.settings,
      palette: project.palette ?? "Padrão EdiAula",
      paletteFonts: project.paletteFonts ?? false,
      captions: project.captions ?? { burn: false },
    }),
    "",
    "## Organização das faixas (do topo para baixo)",
    "",
    "| Referência | Nome | Tipo | Muda | Oculta | Travada | Música |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...project.tracks.map(
      (t) =>
        `| ${tracks.get(t.id)} | ${clean(t.name)} | ${t.kind} | ${!!t.muted} | ${!!t.hidden} | ${!!t.locked} | ${!!t.music} |`,
    ),
    "",
    "## Mídias a substituir",
    "",
  ];
  for (const a of assets) {
    const { path: _path, pathEdits: _edits, ...cursorStyle } = a.cursorFx ?? {};
    out.push(
      `### ${media.get(a.id)} — ${clean(a.name)}`,
      "",
      jsonBlock({
        type: a.kind,
        role:
          a.generated === "annotation"
            ? "Anotação recriável"
            : a.cursor
              ? "Gravação de tela"
              : a.key
                ? "Apresentador com fundo removido"
                : a.kind === "audio"
                  ? "Áudio — identificar voz ou música"
                  : "Mídia — identificar função no novo projeto",
        format: { width: a.width, height: a.height, fps: a.fps },
        backgroundRemoval: a.key,
        cursorStyle: a.cursor ? cursorStyle : undefined,
        cursorPath:
          _path?.length || _edits?.length
            ? "Há caminho editado na referência; refaça os pontos sobre os alvos da nova gravação."
            : undefined,
      }),
      "",
    );
  }
  out.push(
    "## Sequência e parâmetros dos clipes",
    "",
    "Tempos de início e duração estão em segundos da timeline. `sourceIn` e zooms do clipe usam o tempo da mídia original; keyframes usam segundos relativos ao início do clipe. Posições x/y do transform são frações do quadro. A escala 1 ajusta a mídia inteira ao quadro.",
    "",
  );
  for (const [index, c] of clips.entries()) {
    const annotation = c.annotation ? { ...c.annotation, balloonGeometry: undefined } : undefined;
    const anchor = words
      .filter((w) => w.end > c.start && w.start < c.start + Math.min(c.duration, 6))
      .slice(0, 28)
      .map((w) => w.text)
      .join(" ");
    out.push(
      `### ${index + 1}. ${stamp(c.start)} — ${clean(c.annotation?.text || assets.find((a) => a.id === c.assetId)?.name || "Clipe")}`,
      "",
      anchor
        ? `Fala de referência: ${clean(anchor)}`
        : "Sem âncora de fala disponível; localizar o acontecimento visual equivalente.",
      "",
      jsonBlock({
        track: tracks.get(c.trackId),
        media: media.get(c.assetId),
        start: c.start,
        duration: c.duration,
        sourceIn: c.in,
        speed: clipSpeed(c),
        volume: c.volume,
        denoise: c.denoise,
        transform: c.transform,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
        enter: c.enter,
        exit: c.exit,
        transition: c.transition,
        annotation,
        keyframes: c.keyframes,
        zooms: c.zooms,
        zoomLayer: c.zoomLayer,
        insertId: c.insertId,
      }),
      "",
    );
  }
  if (project.protected?.length)
    out.push(
      "## Trechos protegidos na referência",
      "",
      jsonBlock(
        project.protected.map((r) => ({
          media: media.get(r.assetId),
          start: r.start,
          end: r.end,
          label: r.label,
        })),
      ),
      "",
    );
  if (notes.trim())
    out.push(
      "## Orientações adicionais do editor",
      "",
      ...notes
        .trim()
        .split("\n")
        .map((line) => clean(line)),
      "",
    );
  out.push(
    "## Pedido sugerido ao assistente",
    "",
    "“Leia este modelo de edição, analise a aula aberta e proponha como adaptar os estilos e a estrutura. Use a transcrição e o roteiro desta nova aula para posicionar os elementos. Não reutilize os tempos da referência sem conferir.”",
    "",
  );
  return out.join("\n");
}
