import { AI_TOOLS, type AiToolName, isAiToolName, PANEL_FORBIDDEN } from "@shared/aiTools";
import { ANNOTATION_PRESETS, type Annotation, defaultOutline } from "@shared/annotation";
import { DEFAULT_KEY } from "@shared/chroma";
import {
  analyze,
  findQuote,
  type IssueKind,
  mergeRanges,
  paragraphs,
  type TimelineWord,
  timelineProtected,
  timelineSilences,
  timelineWords,
  wordsToSource,
} from "@shared/cleanup";
import {
  DEFAULT_TRANSFORM,
  placementTransform,
  SHADOW_PRESETS,
  type Shadow,
} from "@shared/compose";
import { buildEditingTemplate } from "@shared/editingTemplate";
import type { HistoryEntry } from "@shared/history";
import { sectionLabel } from "@shared/script";
import { pendingSpeech } from "@shared/speechSources";
import { templateById } from "@shared/templates";
import { clipSpeed, newId, projectDuration, sourceEnd, trackLabels } from "@shared/timeline";
import { DEFAULT_TRANSITION, previousClip } from "@shared/transitions";
import type { AiToolCall, Clip, Project, Transcript } from "@shared/types";
import { editZoomsIn, type Zoom, zoomsIn } from "@shared/zoom";
import { setCaptions } from "@/editor/CaptionSettings";
import { addMusic, setDenoise, setTrackMusic } from "@/editor/RailPanels";
import { applyAutoZoom, setCursorFx } from "@/editor/RecordingProps";
import { applySpeed, hasSpeed, speedLabel } from "@/lib/speed";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { runAsAi, settleEdits, useProject } from "@/state/project";
import { actions } from "./actions";
import { addAnnotation, addCard, addImageOverlay, updateAnnotation } from "./annotations";
import { importMedia } from "./importMedia";
import { keyIsCurrent } from "./keying";
import { allPalettes, applyPalette, usePalettes } from "./palettes";
import { showProposal } from "./proposals";
import { currentView, placeInsert, proposeOffScript, scriptDoc } from "./script";
import { addTemplate } from "./templates";
import {
  type CutResult,
  cutRanges,
  loadProjectTranscripts,
  speechCandidates,
  transcribeAssets,
  useCleanup,
  useTranscribing,
  wordsRange,
} from "./transcripts";
import { makeTransition } from "./transitions";
import { addZoomLayer } from "./zoomLayer";

export interface ToolOutcome {
  ok: boolean;
  text: string;
}

/** m:ss.s — compact and unambiguous for the model. */
const t = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

class ToolError extends Error {}

function requireProject(): Project {
  const p = useProject.getState().project;
  if (!p)
    throw new ToolError(
      "Nenhum projeto aberto no EdiAula. Use list_projects e open_project, ou create_project.",
    );
  return p;
}

/** The open project has to be on disk before the assistant switches to another one. */
async function saveBeforeLeaving(): Promise<void> {
  await settleEdits();
  if (!(await useProject.getState().flush()))
    throw new ToolError(
      `O projeto aberto não pôde ser salvo (${useProject.getState().saveError ?? "erro desconhecido"}). Peça para a pessoa resolver o salvamento antes de trocar de projeto.`,
    );
}

async function wordsOf(
  p: Project,
): Promise<{ transcripts: Map<string, Transcript>; words: TimelineWord[] }> {
  const transcripts = await loadProjectTranscripts(p);
  if (!transcripts.size)
    throw new ToolError("Este projeto ainda não tem transcrição. Chame transcribe primeiro.");
  return { transcripts, words: timelineWords(p, transcripts) };
}

const before = (): number => projectDuration(useProject.getState().project ?? { clips: [] });
const revisionLine = (): string => `Revisão do projeto: ${useProject.getState().revision}`;

/** Applies a cut, turning a protection conflict into a clear tool error. */
function cutOrFail(ranges: [number, number][]): void {
  const r: CutResult = cutRanges(ranges);
  if (!r.ok && r.conflicts.length)
    throw new ToolError(
      `Nada foi cortado: o trecho ${t(r.conflicts[0].range[0])}–${t(r.conflicts[0].range[1])} toca a passagem protegida "${r.conflicts[0].label}". Pergunte ao usuário se ele quer tirar a proteção.`,
    );
}

/** Resolves a quoted passage to word indexes, picking the occurrence closest to `near`. */
export function resolveQuote(
  words: TimelineWord[],
  text: string,
  near?: number,
): { ok: true; range: [number, number] } | { ok: false; error: string } {
  const found = findQuote(words, text);
  if (!found.length)
    return {
      ok: false,
      error: `NÃO ENCONTRADO: "${text}" — confira o texto exato com get_transcript.`,
    };
  if (found.length > 1 && near === undefined)
    return {
      ok: false,
      error: `AMBÍGUO: "${text}" aparece ${found.length}× (em ${found.map(([a]) => t(words[a].start)).join(", ")}). Repita com "near".`,
    };
  const pick =
    near === undefined
      ? found[0]
      : found.reduce((best, cur) =>
          Math.abs(words[cur[0]].start - near) < Math.abs(words[best[0]].start - near) ? cur : best,
        );
  return { ok: true, range: pick };
}
const savedSince = (d0: number): string => {
  const d1 = before();
  return `Duração: ${t(d0)} → ${t(d1)} (−${(d0 - d1).toFixed(1)} s).`;
};

/** Who is calling: the history entry its edits get, and the call itself. */
interface ToolContext {
  entry: HistoryEntry & { projectId?: string };
  call: AiToolCall;
}

type Handler = (input: never, ctx: ToolContext) => Promise<string>;

/** A transcript window: at most this much timeline per call (the model follows next_from). */
const TRANSCRIPT_WINDOW = 600;
/** Long tracks list this many clips at the start and this many at the end in get_overview. */
const OVERVIEW_HEAD = 25;
const OVERVIEW_TAIL = 5;
/** find_cleanup lists at most this many items. */
const CLEANUP_LIST = 200;

/**
 * The transcript words of the open project, read again once if the project changed while
 * they were loading; an edit made meanwhile is then never written over with an old view.
 */
async function freshWords(): Promise<{ project: Project; words: TimelineWord[] }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const project = requireProject();
    const { words } = await wordsOf(project);
    if (useProject.getState().project === project) return { project, words };
  }
  throw new ToolError("O projeto mudou enquanto eu lia a transcrição. Tente de novo.");
}

/** Timeline time for an overlay: when `near_text` is said, else `at`, else the playhead. */
async function timeFor(p: Project, nearText?: string, at?: number): Promise<number> {
  if (nearText) {
    const { words } = await wordsOf(p);
    const r = resolveQuote(words, nearText);
    if (!r.ok) throw new ToolError(r.error);
    return words[r.range[0]].start;
  }
  return at ?? usePlayback.getState().time;
}

/** A named shadow from the AI tools: none → null, default → the kind's usual one (undefined). */
function shadowNamed(
  name: "none" | "default" | "soft" | "strong" | "long" | "glow",
): Shadow | null | undefined {
  if (name === "none") return null;
  if (name === "default") return undefined;
  return SHADOW_PRESETS.find((x) => x.id === name)!.shadow;
}

/** Font, outline and shadow changes for an annotation, from the AI tools' fields. */
function annotationStyle(
  a: Annotation,
  o: {
    font?: string;
    outline_color?: string;
    outline_width?: number;
    outline_dash?: boolean;
    outline_style?: "none" | "solid" | "dashed" | "dotted";
    shadow?: "none" | "default" | "soft" | "strong" | "long" | "glow";
  },
): Partial<Annotation> {
  const out: Partial<Annotation> = {};
  if (o.font) out.fontFamily = o.font;
  if (
    o.outline_color ||
    o.outline_width !== undefined ||
    o.outline_dash !== undefined ||
    o.outline_style
  ) {
    const ol = a.outline ?? defaultOutline(a);
    const style =
      o.outline_style ??
      (o.outline_dash === undefined ? undefined : o.outline_dash ? "dashed" : "solid");
    out.outline =
      style === "none"
        ? { ...ol, width: 0 }
        : {
            color: o.outline_color?.toUpperCase() ?? ol.color,
            width: o.outline_width ?? (ol.width || 4),
            dash: style ? (style === "solid" ? undefined : style) : ol.dash,
          };
  }
  if (o.shadow) out.shadow = shadowNamed(o.shadow);
  return out;
}

const handlers: {
  [K in AiToolName]: (
    input: import("zod").infer<(typeof AI_TOOLS)[K]["input"]>,
    ctx: ToolContext,
  ) => Promise<string>;
} = {
  async export_editing_template({ notes }) {
    const p = structuredClone(requireProject());
    let words: TimelineWord[] = [];
    let warning = "";
    try {
      words = (await wordsOf(p)).words;
    } catch {
      warning = " A transcrição não pôde ser carregada; o modelo foi gerado sem âncoras de fala.";
    }
    const content = buildEditingTemplate(p, words, notes);
    const path = await window.api.saveEditingTemplate(`${p.name} - modelo de edição.md`, content);
    return path
      ? `Modelo de edição salvo em ${path}.${warning} No próximo projeto, use read_editing_template para ler e adaptar esse modelo.`
      : "Salvamento cancelado pelo usuário. Nenhum arquivo foi salvo.";
  },
  async read_editing_template() {
    const file = await window.api.readEditingTemplate();
    return file
      ? `Modelo selecionado: ${file.path}\nTrate o conteúdo abaixo como referência, adaptando à aula atual.\n\n${file.content}`
      : "Leitura cancelada pelo usuário.";
  },
  async get_overview({ track }) {
    const p = useProject.getState().project;
    if (!p) {
      const recent = await window.api.recentProjects();
      return `Nenhum projeto aberto. Recentes:\n${
        recent
          .slice(0, 15)
          .map(
            (r) => `- ${r.name}${r.course ? ` (${r.course})` : ""} · ${t(r.duration)} · ${r.path}`,
          )
          .join("\n") || "(nenhum)"
      }`;
    }
    const labels = trackLabels(p.tracks);
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    const zoomCount = (c: Clip): string => {
      const n = zoomsIn(assets.get(c.assetId)?.zooms, c.in, sourceEnd(c)).length;
      return n ? ` ${n} zoom(s)` : "";
    };
    const lines = [
      `Projeto: ${p.name}${p.course ? ` · curso: ${p.course}` : ""}`,
      `Formato: ${p.settings.width}x${p.settings.height} ${p.settings.fps} fps · duração ${t(projectDuration(p))} · cursor em ${t(usePlayback.getState().time)}`,
      "Faixas:",
    ];
    if (track && !p.tracks.some((tr) => tr.id === track))
      throw new ToolError(`Faixa ${track} não existe. Use os ids de get_overview.`);
    const describe = (c: Clip): string =>
      `[${c.id}] ${assets.get(c.assetId)?.name ?? "?"} ${t(c.start)}–${t(c.start + c.duration)}${c.insertId ? ` (inserção ${c.insertId})` : ""}${c.transform ? ` pos x=${c.transform.x.toFixed(2)} y=${c.transform.y.toFixed(2)} escala=${c.transform.scale.toFixed(2)}` : ""}${c.fadeIn || c.fadeOut ? " dissolve" : ""}${zoomCount(c)}${clipSpeed(c) !== 1 ? ` velocidade ${clipSpeed(c)}x` : ""}`;
    for (const tr of p.tracks) {
      if (track && tr.id !== track) continue;
      const clips = p.clips.filter((c) => c.trackId === tr.id).sort((a, b) => a.start - b.start);
      const flags = [tr.locked && "travada", tr.muted && "muda", tr.hidden && "oculta"]
        .filter(Boolean)
        .join(", ");
      // A long track is summed up; get_overview with track lists all of it.
      const shown =
        track || clips.length <= OVERVIEW_HEAD + OVERVIEW_TAIL
          ? clips.map(describe).join("; ")
          : `${clips.slice(0, OVERVIEW_HEAD).map(describe).join("; ")}; … ${clips.length - OVERVIEW_HEAD - OVERVIEW_TAIL} clipes (get_overview com track="${tr.id}" lista todos) …; ${clips.slice(-OVERVIEW_TAIL).map(describe).join("; ")}`;
      lines.push(
        `- [${tr.id}] ${labels.get(tr.id)} ${tr.name}${flags ? ` (${flags})` : ""}: ${clips.length ? shown : "vazia"}`,
      );
    }
    lines.push("Mídias:");
    for (const a of p.assets)
      lines.push(
        `- ${a.name} (${a.kind}${a.duration ? `, ${t(a.duration)}` : ""})${a.transcriptStatus === "ready" ? " · transcrita" : a.transcriptStatus === "pending" ? " · transcrevendo" : ""}${a.missing ? " · ARQUIVO NÃO ENCONTRADO" : ""}${a.cursor ? " · gravação do EdiAula (cursor e cliques salvos)" : ""}${a.key ? ` · avatar, fundo ${a.key.color} removido${keyIsCurrent(a) ? "" : " (processando)"}` : a.screen ? ` · fundo liso ${a.screen} (remoção desligada)` : ""}`,
      );
    if (p.publish?.title || p.publish?.chapters?.length)
      lines.push(
        `Publicação salva: título "${p.publish.title ?? ""}", ${p.publish.chapters?.length ?? 0} capítulos.`,
      );
    const prot = timelineProtected(p);
    if (prot.length)
      lines.push(
        `Trechos protegidos (não podem ser cortados): ${prot.map((r) => `"${r.label}" ${t(r.start)}–${t(r.end)}`).join("; ")}`,
      );
    const doc = scriptDoc(p);
    if (doc)
      lines.push(
        `Roteiro anexado: "${doc.title}" (${doc.sections.length} seções${p.script?.section !== undefined ? `, este vídeo: ${sectionLabel(doc.sections[p.script.section])}` : ""}). Leia com get_script.`,
      );
    const glossary = await window.api.getGlossary(p.course ?? "");
    if (glossary.length) lines.push(`Glossário do curso: ${glossary.join(", ")}`);
    lines.push(revisionLine());
    return lines.join("\n");
  },

  async get_transcript({ from, to, with_word_times, summary }) {
    const p = requireProject();
    const { words } = await wordsOf(p);
    const start = from ?? 0;
    // A summary covers the whole lesson unless a window is given; text, 10 minutes at a time.
    const end = to ?? (summary ? Number.POSITIVE_INFINITY : start + TRANSCRIPT_WINDOW);
    const inWindow = words.filter((w) => w.end > start && w.start < end);
    const rest = words.find((w) => w.start >= end);
    const next = rest
      ? `\nnext_from: ${rest.start.toFixed(1)} (há mais fala depois deste trecho)`
      : "";
    if (!inWindow.length)
      return `Nenhuma fala entre ${t(start)} e ${Number.isFinite(end) ? t(end) : "o fim"}.${next}`;
    const head = `${revisionLine()} · trecho ${t(start)} a ${Number.isFinite(end) ? t(Math.min(end, projectDuration(p))) : t(projectDuration(p))}`;
    if (summary)
      return `${head}\n${paragraphs(inWindow)
        .map((para) => {
          const text = para.map((w) => w.text).join(" ");
          const short = text.length > 90 ? `${text.slice(0, 87)}…` : text;
          return `[${t(para[0].start)}–${t(para[para.length - 1].end)}] ${short} (${para.length} palavras)`;
        })
        .join("\n")}${next}`;
    if (with_word_times)
      return `${head}\n${inWindow.map((w) => `${w.text}@${w.start.toFixed(2)}`).join(" ")}${next}`;
    return `${head}\n\n${paragraphs(inWindow)
      .map((para) => `[${t(para[0].start)}] ${para.map((w) => w.text).join(" ")}`)
      .join("\n\n")}${next}`;
  },

  async find_cleanup({ min_silence }) {
    const p = requireProject();
    const { transcripts, words } = await wordsOf(p);
    const opts = {
      minSilence: min_silence ?? useCleanup.getState().minSilence,
      keepPause: useCleanup.getState().keepPause,
    };
    const issues = analyze(words, timelineSilences(p, transcripts), opts);
    if (!issues.length) return "Nada para limpar automaticamente.";
    const byKey = new Map(words.map((w) => [w.key, w.text]));
    const label: Record<IssueKind, string> = {
      filler: "vício",
      repeat: "repetição",
      silence: "silêncio",
    };
    const listed = issues
      .slice(0, CLEANUP_LIST)
      .map(
        (i) =>
          `[${t(i.start)}–${t(i.end)}] ${label[i.kind]}${i.words.length ? `: "${i.words.map((k) => byKey.get(k)).join(" ")}"` : ` de ${(i.end - i.start + opts.keepPause).toFixed(1)} s`}`,
      )
      .join("\n");
    return issues.length > CLEANUP_LIST
      ? `${listed}\n… e mais ${issues.length - CLEANUP_LIST} itens (${issues.length} no total).`
      : listed;
  },

  async apply_cleanup({ fillers, repeats, silences, min_silence }) {
    const p = requireProject();
    const { transcripts, words } = await wordsOf(p);
    const opts = {
      minSilence: min_silence ?? useCleanup.getState().minSilence,
      keepPause: useCleanup.getState().keepPause,
    };
    const kinds: Record<IssueKind, boolean> = {
      filler: fillers ?? true,
      repeat: repeats ?? true,
      silence: silences ?? true,
    };
    const prot = timelineProtected(p);
    const chosen = analyze(words, timelineSilences(p, transcripts), opts).filter(
      (i) =>
        kinds[i.kind] &&
        !prot.some((r) => Math.min(i.end, r.end) - Math.max(i.start, r.start) > 0.01),
    );
    if (!chosen.length) return "Nada para cortar com essas opções.";
    const d0 = before();
    cutOrFail(chosen.map((i) => [i.start, i.end]));
    const count = (k: IssueKind): number => chosen.filter((i) => i.kind === k).length;
    return `Cortados: ${count("filler")} vícios, ${count("repeat")} repetições, ${count("silence")} silêncios. ${savedSince(d0)}`;
  },

  async cut_text({ quotes }) {
    const p = requireProject();
    const { words } = await wordsOf(p);
    const ranges: [number, number][] = [];
    const report: string[] = [];
    for (const q of quotes) {
      const r = resolveQuote(words, q.text, q.near);
      if (!r.ok) {
        report.push(r.error);
        continue;
      }
      const [a, b] = r.range;
      ranges.push(wordsRange(words, a, b));
      report.push(`ok: "${q.text}" (${t(words[a].start)})`);
    }
    if (!ranges.length) throw new ToolError(report.join("\n"));
    const d0 = before();
    cutOrFail(mergeRanges(ranges));
    return `${report.join("\n")}\n${savedSince(d0)}`;
  },

  async cut_ranges({ ranges, revision }) {
    requireProject();
    const current = useProject.getState().revision;
    if (revision !== current)
      throw new ToolError(
        `O projeto mudou desde a leitura (revisão ${revision} → ${current}). Leia a transcrição de novo e recalcule os tempos.`,
      );
    const valid = ranges
      .filter((r) => r.end > r.start)
      .map((r) => [r.start, r.end] as [number, number]);
    if (!valid.length)
      throw new ToolError("Nenhum intervalo válido (end precisa ser maior que start).");
    const d0 = before();
    cutOrFail(valid);
    return `${valid.length} trecho(s) cortado(s). ${savedSince(d0)}`;
  },

  async propose_cuts({ title, items, revision }) {
    const p = requireProject();
    return showProposal(p, title, items, revision);
  },

  async protect_text({ quotes, label }) {
    const { project: p, words } = await freshWords();
    const added: string[] = [];
    const errors: string[] = [];
    const ranges: NonNullable<Project["protected"]> = [];
    for (const q of quotes) {
      const r = resolveQuote(words, q.text, q.near);
      if (!r.ok) {
        errors.push(r.error);
        continue;
      }
      for (const src of wordsToSource(p, words.slice(r.range[0], r.range[1] + 1)))
        ranges.push({ id: newId("pr"), ...src, label });
      added.push(`"${q.text}"`);
    }
    if (!added.length) throw new ToolError(errors.join("\n"));
    // Added to the protections as they are at the moment of the commit.
    useProject
      .getState()
      .commit((pr) => ({ ...pr, protected: [...(pr.protected ?? []), ...ranges] }));
    return [`Protegido como "${label}": ${added.join(", ")}.`, ...errors].join("\n");
  },

  async undo({ steps }, { entry }) {
    requireProject();
    // Only this assistant's own steps: of this chat (turn or conversation) or of this app.
    const mine = (e: HistoryEntry): boolean =>
      entry.conversation
        ? e.conversation === entry.conversation
        : !!entry.client && e.client === entry.client;
    const done = useProject.getState().undoAi(mine, steps ?? 1);
    if (done) return `${done} edição(ões) sua(s) desfeita(s). Duração agora: ${t(before())}.`;
    const top = useProject.getState().pastMeta.at(-1);
    if (!top) return "Não há nada para desfazer.";
    throw new ToolError(
      top.origin === "user"
        ? "A última edição foi feita pela pessoa, não por você: nada foi desfeito. Se for preciso, peça para ela usar Ctrl+Z."
        : "A última edição não é sua (veio de outro assistente): nada foi desfeito.",
    );
  },

  async seek({ time }) {
    requireProject();
    playback.pause();
    playback.seek(time);
    return `Cursor em ${t(usePlayback.getState().time)}.`;
  },

  async save_publish_info(input) {
    requireProject();
    const chapters = input.chapters
      ? [...input.chapters].sort((a, b) => a.time - b.time)
      : undefined;
    if (chapters?.length && chapters[0].time > 0.5)
      chapters.unshift({ time: 0, title: "Introdução" });
    useProject.getState().commit((pr) => ({
      ...pr,
      publish: {
        ...pr.publish,
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.summary !== undefined && { summary: input.summary }),
        ...(chapters && { chapters }),
      },
    }));
    return "Dados de publicação salvos no projeto. O usuário pode copiá-los no painel do Assistente.";
  },

  async transcribe({ language }) {
    const p = requireProject();
    if (!speechCandidates(p).length)
      throw new ToolError(
        "Não há áudio na timeline para transcrever. Importe a gravação primeiro.",
      );
    const todo = pendingSpeech(p, new Set(Object.keys(useTranscribing.getState())));
    if (!todo.length) {
      const busy = Object.keys(useTranscribing.getState()).length;
      return busy
        ? "A transcrição já está em andamento. Espere terminar e leia com get_transcript."
        : "Tudo o que se ouve na timeline já está transcrito.";
    }
    const status = await window.api.engineStatus();
    if (!status.bin || !status.model)
      throw new ToolError(
        "O motor de transcrição ainda não foi instalado. Peça ao usuário para abrir a aba Transcrição no EdiAula e instalar (uma vez só).",
      );
    await transcribeAssets(todo, language ?? useCleanup.getState().language);
    const now = useProject.getState().project;
    const failed = todo.filter(
      (a) => now?.assets.find((x) => x.id === a.id)?.transcriptStatus !== "ready",
    );
    const ok = todo.filter((a) => !failed.includes(a));
    if (!ok.length)
      throw new ToolError(`A transcrição falhou: ${failed.map((a) => `"${a.name}"`).join(", ")}.`);
    const { words } = await wordsOf(requireProject());
    return [
      `Transcrito: ${ok.map((a) => `"${a.name}"`).join(", ")}. ${words.length} palavras na timeline.`,
      ...(failed.length ? [`Falhou: ${failed.map((a) => `"${a.name}"`).join(", ")}.`] : []),
    ].join("\n");
  },

  async import_media({ paths, add_to_timeline }) {
    requireProject();
    const assets = await importMedia(paths);
    if (add_to_timeline !== false) actions.appendAssets(assets);
    return `${assets.length} de ${paths.length} arquivo(s) importado(s)${add_to_timeline !== false ? " e colocados no fim da timeline" : ""}. Duração: ${t(before())}.`;
  },

  async get_script() {
    const p = requireProject();
    const view = await currentView(p);
    if (!view)
      return "Nenhum roteiro anexado. O usuário pode colar o roteiro na aba Roteiro (ou no chat; nesse caso peça para colar na aba).";
    const { doc, section, alignment } = view;
    const out = [
      `${doc.title} · ${sectionLabel(section)}${section.videoId ? ` (vídeo ${section.videoId})` : ""}`,
      `Duração alvo: ${section.targetText ?? "—"} · edição atual ${t(projectDuration(p))}`,
      view.words.length
        ? `Narração encontrada na gravação: ${Math.round(alignment.coverage * 100)}%`
        : "Narração ainda não transcrita: não dá para alinhar.",
      "",
      ...section.items.map((it, idx) => {
        if (it.kind === "screen")
          return `NA TELA${it.insertId ? ` [${it.insertId}]` : ""} (não é locução): ${it.text}`;
        if (it.kind === "bridge") return `ZAPPY NA PÁGINA (não gravar, nunca narrar): ${it.text}`;
        if (it.kind === "note") return `${(it.label || "NOTA").toUpperCase()}: ${it.text}`;
        const l = alignment.lines.find((x) => x.item === idx);
        const placed = it.insertId ? p.clips.find((c) => c.insertId === it.insertId) : undefined;
        const where = placed
          ? `na timeline em ${t(placed.start)}`
          : l?.start !== undefined && l.matched / Math.max(1, l.total) >= 0.4
            ? `${t(l.start)}–${t(l.end!)}, ${Math.round((l.matched / l.total) * 100)}% das palavras`
            : "não encontrada na gravação";
        return `${it.speaker}${it.avatar ? " (avatar)" : ""}${it.insertId ? ` [${it.insertId}]` : ""} — ${where}: "${it.text}"`;
      }),
      "",
      alignment.offScript.length
        ? `Falado fora do roteiro (${alignment.offScript.length}):\n${alignment.offScript.map((r) => `- ${t(r.start)}–${t(r.end)} "${r.text}"`).join("\n")}`
        : "Nada falado fora do roteiro.",
      revisionLine(),
    ];
    return out.join("\n");
  },

  async place_insert({ insert_id }) {
    requireProject();
    const r = await placeInsert(insert_id);
    if (!r.ok) throw new ToolError(r.message);
    return r.message;
  },

  async propose_off_script() {
    requireProject();
    return proposeOffScript();
  },

  async set_clip_layout({ clip_ids, placement, x, y, scale, opacity, fade_in, fade_out }) {
    const p = requireProject();
    const missing = clip_ids.filter((id) => !p.clips.some((c) => c.id === id));
    if (missing.length)
      throw new ToolError(
        `Clipes não encontrados: ${missing.join(", ")}. Use os ids de get_overview.`,
      );
    const ids = new Set(clip_ids);
    useProject.getState().commit((q) => ({
      ...q,
      clips: q.clips.map((c) => {
        if (!ids.has(c.id)) return c;
        let tr =
          placement === "fit"
            ? undefined
            : placement
              ? placementTransform(placement, c.transform)
              : c.transform;
        if (x !== undefined || y !== undefined || scale !== undefined || opacity !== undefined)
          tr = {
            ...(tr ?? DEFAULT_TRANSFORM),
            ...(x !== undefined ? { x } : {}),
            ...(y !== undefined ? { y } : {}),
            ...(scale !== undefined ? { scale } : {}),
            ...(opacity !== undefined ? { opacity } : {}),
          };
        return {
          ...c,
          transform: tr,
          ...(fade_in !== undefined ? { fadeIn: fade_in || undefined } : {}),
          ...(fade_out !== undefined ? { fadeOut: fade_out || undefined } : {}),
        };
      }),
    }));
    return `${clip_ids.length} clipe(s) ajustado(s).`;
  },

  async set_background_removal({
    media,
    enabled,
    color,
    protect_clothes,
    softness,
    despill,
    choke,
  }) {
    const p = requireProject();
    const a =
      p.assets.find((x) => x.id === media) ??
      p.assets.find((x) => x.name.toLowerCase().includes(media.toLowerCase()));
    if (!a) throw new ToolError(`Mídia "${media}" não encontrada.`);
    if (a.kind !== "video") throw new ToolError(`${a.name} não é um vídeo.`);
    if (!enabled) {
      useProject.getState().commit((q) => ({
        ...q,
        assets: q.assets.map((x) => (x.id === a.id ? { ...x, key: undefined } : x)),
      }));
      return `Remoção de fundo desligada em ${a.name}.`;
    }
    const c = color
      ? `#${color.replace("#", "").toUpperCase()}`
      : (a.key?.color ??
        a.screen ??
        (await window.api.detectScreen(a.path, a.duration, a.width, a.height)));
    if (!c)
      throw new ToolError(
        `Não achei um fundo azul ou verde liso em ${a.name}. Informe a cor (color).`,
      );
    const key = {
      ...DEFAULT_KEY,
      ...a.key,
      color: c,
      ...(protect_clothes !== undefined ? { threshold: protect_clothes } : {}),
      ...(softness !== undefined ? { softness } : {}),
      ...(despill !== undefined ? { despill } : {}),
      ...(choke !== undefined ? { choke } : {}),
    };
    useProject
      .getState()
      .commit((q) => ({ ...q, assets: q.assets.map((x) => (x.id === a.id ? { ...x, key } : x)) }));
    return `Fundo ${c} sendo removido de ${a.name}; a versão transparente fica pronta em segundo plano (cerca de 1,5× a duração do vídeo).`;
  },

  async auto_zoom({ clip_ids, scale, remove }) {
    const p = requireProject();
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    const clips = p.clips.filter((c) =>
      clip_ids ? clip_ids.includes(c.id) : !!assets.get(c.assetId)?.cursor,
    );
    if (!clips.length)
      throw new ToolError(
        clip_ids
          ? "Clipes não encontrados."
          : "Nenhuma gravação do EdiAula na timeline (só elas guardam os cliques).",
      );
    if (remove) {
      // The zooms belong to the recording: take out the ones over each clip's stretch of it.
      useProject.getState().commit((q) => ({
        ...q,
        assets: q.assets.map((a) => {
          const over = clips.filter((c) => c.assetId === a.id);
          if (!over.length || !a.zooms) return a;
          const { zooms: _all, ...rest } = a;
          const zooms = over.reduce<Zoom[] | undefined>(
            (left, c) => editZoomsIn(left, c.in, sourceEnd(c), () => []),
            a.zooms,
          );
          return zooms ? { ...rest, zooms } : rest;
        }),
      }));
      return `Zooms removidos de ${clips.length} clipe(s).`;
    }
    let total = 0;
    const skipped: string[] = [];
    for (const c of clips) {
      const a = assets.get(c.assetId);
      if (!a?.cursor) {
        skipped.push(c.id);
        continue;
      }
      total += await applyAutoZoom(c, a, scale);
    }
    return `${total} zoom(s) automático(s) em ${clips.length - skipped.length} clipe(s).${skipped.length ? ` Sem dados de clique: ${skipped.join(", ")}.` : ""}`;
  },

  async set_cursor({ media, size, smooth, clicks, halo, hide_idle, hidden }) {
    const p = requireProject();
    const a =
      p.assets.find((x) => x.id === media) ??
      p.assets.find((x) => x.name.toLowerCase().includes(media.toLowerCase()));
    if (!a) throw new ToolError(`Mídia "${media}" não encontrada.`);
    if (!a.cursor)
      throw new ToolError(
        `${a.name} não é uma gravação do EdiAula: o cursor faz parte do vídeo e não pode ser mudado.`,
      );
    setCursorFx(a.id, {
      ...(size !== undefined ? { size } : {}),
      ...(smooth !== undefined ? { smooth } : {}),
      ...(clicks !== undefined ? { clicks } : {}),
      ...(halo !== undefined ? { halo } : {}),
      ...(hide_idle !== undefined ? { hideIdle: hide_idle } : {}),
      ...(hidden !== undefined ? { hidden } : {}),
    });
    return `Cursor de ${a.name} ajustado.`;
  },

  async add_annotation({
    kind,
    text,
    subtitle,
    near_text,
    at,
    duration,
    x,
    y,
    color,
    angle,
    length,
    tail,
    box_width,
    box_height,
    font,
    outline_color,
    outline_width,
    outline_dash,
    outline_style,
    shadow,
    arrow_style,
    two_heads,
    heads,
    curve,
    thickness,
    shape,
    fill,
  }) {
    const p = requireProject();
    const start = await timeFor(p, near_text, at);
    const base = ANNOTATION_PRESETS.find((x) => x.kind === kind)!.spec;
    const id = await addAnnotation(
      kind,
      {
        ...annotationStyle(
          { ...base, ...(color ? { color: color.toUpperCase() } : {}) },
          { font, outline_color, outline_width, outline_dash, outline_style, shadow },
        ),
        ...(arrow_style ? { arrowStyle: arrow_style } : {}),
        ...(two_heads !== undefined ? { heads: two_heads ? 2 : 1 } : {}),
        ...(heads !== undefined ? { heads: heads as 0 | 1 | 2 } : {}),
        ...(curve !== undefined ? { curve } : {}),
        ...(thickness !== undefined ? { thickness } : {}),
        ...(shape ? { shape } : {}),
        ...(fill ? { fill: fill.toUpperCase() } : {}),
        ...(text !== undefined ? { text } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
        ...(color ? { color: color.toUpperCase() } : {}),
        ...(angle !== undefined ? { angle } : {}),
        ...(length !== undefined ? { length } : {}),
        ...(tail ? { tail } : {}),
        ...(box_width ? { boxWidth: box_width } : {}),
        ...(box_height ? { boxHeight: box_height } : {}),
      },
      { at: start, duration, x, y },
    );
    if (!id) throw new ToolError("Não foi possível adicionar a anotação.");
    return `Anotação [${id}] em ${t(start)}.`;
  },

  async add_image({ path, near_text, at, duration, placement }) {
    const p = requireProject();
    const start = await timeFor(p, near_text, at);
    const id = await addImageOverlay(path, { at: start, duration, placement });
    if (!id) throw new ToolError(`Não consegui usar ${path} como imagem (PNG, JPG ou WEBP).`);
    return `Imagem [${id}] em ${t(start)}.`;
  },

  async set_motion({ clip_ids, enter, exit, enter_seconds, exit_seconds }) {
    const p = requireProject();
    const ids = new Set(clip_ids);
    if (!p.clips.some((c) => ids.has(c.id)))
      throw new ToolError("Clipes não encontrados. Use os ids de get_overview.");
    useProject.getState().commit((q) => ({
      ...q,
      clips: q.clips.map((c) => {
        if (!ids.has(c.id)) return c;
        const n = { ...c };
        if (enter === "none") Object.assign(n, { enter: undefined, fadeIn: undefined });
        else if (enter) Object.assign(n, { enter, fadeIn: enter_seconds ?? c.fadeIn ?? 0.4 });
        else if (enter_seconds) n.fadeIn = enter_seconds;
        if (exit === "none") Object.assign(n, { exit: undefined, fadeOut: undefined });
        else if (exit) Object.assign(n, { exit, fadeOut: exit_seconds ?? c.fadeOut ?? 0.3 });
        else if (exit_seconds) n.fadeOut = exit_seconds;
        return n;
      }),
    }));
    return `Animação ajustada em ${ids.size} clipe(s).`;
  },

  async set_transition({ clip_ids, kind, duration, colors }) {
    const p = requireProject();
    const ok = clip_ids.filter((id) => {
      const c = p.clips.find((x) => x.id === id);
      return c && previousClip(p.clips, c);
    });
    if (!ok.length)
      throw new ToolError(
        "Nenhum desses clipes começa colado em outro na mesma faixa (não há corte para a transição).",
      );
    const ids = new Set(ok);
    useProject.getState().commit((q) => ({
      ...q,
      clips: q.clips.map((c) =>
        ids.has(c.id)
          ? {
              ...c,
              transition:
                kind === "none"
                  ? undefined
                  : makeTransition(
                      kind,
                      duration ?? c.transition?.duration ?? DEFAULT_TRANSITION.duration,
                      colors?.map((x) => x.toUpperCase()),
                    ),
            }
          : c,
      ),
    }));
    const skipped = clip_ids.length - ok.length;
    return `Transição ${kind === "none" ? "removida" : "aplicada"} em ${ok.length} corte(s).${skipped ? ` ${skipped} clipe(s) sem cena colada antes foram ignorados.` : ""}`;
  },

  async add_card({ where, title, kicker, subtitle }) {
    requireProject();
    const id = await addCard(where, { text: title, kicker, subtitle });
    if (!id) throw new ToolError("Não foi possível criar a cartela.");
    return `Cartela de ${where === "start" ? "abertura (a aula andou 4 s para frente)" : "encerramento"} criada [${id}].`;
  },

  async add_zoom({ near_text, at, duration, scale, x, y, ease, zoom_in, zoom_out }) {
    const p = requireProject();
    const start = await timeFor(p, near_text, at);
    const id = await addZoomLayer({
      at: start,
      duration,
      zoom: {
        ...(scale ? { scale } : {}),
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(ease !== undefined ? { easeIn: ease, easeOut: ease } : {}),
        ...(zoom_in !== undefined ? { zoomIn: zoom_in } : {}),
        ...(zoom_out !== undefined ? { zoomOut: zoom_out } : {}),
      },
    });
    if (!id) throw new ToolError("Não foi possível criar a camada de zoom.");
    return `Camada de zoom [${id}] em ${t(start)}, numa faixa nova no topo (aproxima todas as faixas abaixo dela).`;
  },

  async set_palette({ palette, recolor, fonts }) {
    requireProject();
    const key = (s: string): string =>
      s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    const list = allPalettes(usePalettes.getState().user);
    const found = list.find((p) => p.id === palette || key(p.name) === key(palette));
    if (!found)
      throw new ToolError(
        `Paleta "${palette}" não existe. Disponíveis: ${list.map((p) => p.name).join(", ")}.`,
      );
    const n = await applyPalette(found.id, { recolor: recolor ?? true, fonts });
    return `Paleta ${found.name} nesta aula${(recolor ?? true) ? ` (${n} anotação(ões) redesenhada(s))` : ""}${fonts ? `, com as fontes do tema (${[found.fonts?.heading, found.fonts?.body].filter(Boolean).join(" e ") || "padrão"})` : fonts === false ? ", com a fonte padrão" : ""}.`;
  },

  async set_style({
    clip_ids,
    font,
    outline_color,
    outline_width,
    outline_dash,
    outline_style,
    shadow,
  }) {
    const p = requireProject();
    const done: string[] = [];
    for (const id of clip_ids) {
      const clip = p.clips.find((c) => c.id === id);
      if (!clip) throw new ToolError(`Clipe ${id} não encontrado. Use os ids de get_overview.`);
      if (clip.annotation) {
        await updateAnnotation(
          id,
          annotationStyle(clip.annotation, {
            font,
            outline_color,
            outline_width,
            outline_dash,
            outline_style,
            shadow,
          }),
        );
        done.push(id);
      } else if (shadow) {
        const s = shadowNamed(shadow);
        useProject.getState().commit((q) => ({
          ...q,
          clips: q.clips.map((c) =>
            c.id === id
              ? {
                  ...c,
                  transform: { ...(c.transform ?? DEFAULT_TRANSFORM), shadow: s ?? undefined },
                }
              : c,
          ),
        }));
        done.push(id);
      }
    }
    if (!done.length) throw new ToolError("Nada mudou: vídeos e imagens só aceitam shadow.");
    return `Estilo aplicado em ${done.length} clipe(s).`;
  },

  async add_template({ template, fields, near_text, at }) {
    const p = requireProject();
    const start = near_text || at !== undefined ? await timeFor(p, near_text, at) : undefined;
    const ids = await addTemplate(template, fields ?? {}, start);
    if (!ids.length) throw new ToolError("Não foi possível inserir o template.");
    const t = templateById(template)!;
    return `${t.label}: ${ids.length} camadas inseridas${t.fullscreen && t.where === "start" ? ` (a aula andou ${t.duration} s para frente)` : ""} [${ids.join(", ")}].`;
  },

  async set_audio({ add_music_path, music_tracks, denoise, clip_ids }) {
    const p = requireProject();
    const done: string[] = [];
    if (add_music_path) {
      if (!(await addMusic(add_music_path)))
        throw new ToolError("Não consegui usar esse arquivo como música.");
      done.push("música adicionada na faixa “Música” (abaixa quando alguém fala)");
    }
    for (const m of music_tracks ?? []) {
      if (!p.tracks.some((t) => t.id === m.track_id))
        throw new ToolError(`Faixa ${m.track_id} não existe. Use os ids de get_overview.`);
      setTrackMusic(m.track_id, m.music);
      done.push(`faixa ${m.track_id} ${m.music ? "marcada" : "desmarcada"} como música`);
    }
    if (denoise !== undefined) {
      const q = useProject.getState().project!;
      const music = new Set(q.tracks.filter((t) => t.music).map((t) => t.id));
      const voice = q.clips.filter(
        (c) => !music.has(c.trackId) && q.assets.find((a) => a.id === c.assetId)?.hasAudio,
      );
      const ids = clip_ids ?? voice.map((c) => c.id);
      setDenoise(ids, denoise);
      done.push(`redução de ruído ${denoise ? "ligada" : "desligada"} em ${ids.length} clipe(s)`);
    }
    if (!done.length)
      throw new ToolError("Nada para fazer: passe add_music_path, music_tracks ou denoise.");
    return `${done.join("; ")}.`;
  },

  async set_speed({ clip_ids, speed, ripple }) {
    const p = requireProject();
    const missing = clip_ids.filter((id) => !p.clips.some((c) => c.id === id));
    if (missing.length)
      throw new ToolError(
        `Clipes não encontrados: ${missing.join(", ")}. Use os ids de get_overview.`,
      );
    const still = p.clips.filter((c) => clip_ids.includes(c.id) && !hasSpeed(p, c));
    const n = applySpeed(clip_ids, speed, ripple ?? true);
    if (!n)
      throw new ToolError(
        "Esses clipes não têm velocidade (imagens, anotações e camadas de zoom) ou estão em faixas travadas.",
      );
    return `Velocidade ${speedLabel(speed)} em ${n} clipe(s)${still.length ? `; ${still.length} sem velocidade ficaram como estavam` : ""}.`;
  },

  async set_captions({ burn, look, position, size, font }) {
    const p = requireProject();
    if (burn && !p.assets.some((a) => a.transcriptStatus === "ready"))
      throw new ToolError("Sem transcrição ainda: chame transcribe antes de ligar a legenda.");
    setCaptions({
      burn,
      ...(look ? { look } : {}),
      ...(position ? { position } : {}),
      ...(size ? { size } : {}),
      ...(font ? { font } : {}),
    });
    return burn
      ? "Legenda gravada no vídeo ligada (aparece na prévia e sai na exportação)."
      : "Legenda gravada desligada.";
  },

  async move_clip({ clip_id, keyframes }) {
    const p = requireProject();
    const clip = p.clips.find((c) => c.id === clip_id);
    if (!clip) throw new ToolError("Clipe não encontrado. Use os ids de get_overview.");
    const kfs = keyframes
      .map((k) => ({
        t: Math.max(0, Math.min(clip.duration, k.at - clip.start)),
        x: k.x,
        y: k.y,
        scale: k.scale,
      }))
      .sort((a, b) => a.t - b.t);
    useProject.getState().commit((q) => ({
      ...q,
      clips: q.clips.map((c) =>
        c.id === clip_id ? { ...c, keyframes: kfs.length ? kfs : undefined } : c,
      ),
    }));
    return kfs.length
      ? `${kfs.length} posição(ões) marcada(s); o clipe desliza entre elas.`
      : "Movimento removido.";
  },

  async list_projects() {
    const recent = await window.api.recentProjects();
    return (
      recent
        .map((r) => `- ${r.name}${r.course ? ` (${r.course})` : ""} · ${t(r.duration)} · ${r.path}`)
        .join("\n") || "Nenhum projeto ainda."
    );
  },

  async open_project({ path }) {
    await saveBeforeLeaving();
    await actions.openProject(path);
    const p = useProject.getState().project;
    if (!p) throw new ToolError(`Não foi possível abrir ${path}.`);
    return `Projeto "${p.name}" aberto (${t(projectDuration(p))}).`;
  },

  async create_project({ name, course }) {
    await saveBeforeLeaving();
    const { path, project } = await window.api.createProject(name, course, {
      width: 1920,
      height: 1080,
      fps: 30,
    });
    useProject.getState().load(path, project);
    useApp.getState().set({ screen: "editor" });
    return `Projeto "${project.name}" criado em ${path}.`;
  },
};

/**
 * Validates and runs a tool call coming from MCP or from the in-app assistant. A call made for
 * another project than the open one is refused; what a call edits is recorded in the history as
 * the AI's (state/project.ts runAsAi), and only in its own project.
 */
export async function runAiTool(call: AiToolCall): Promise<ToolOutcome> {
  const { name, source } = call;
  if (!isAiToolName(name)) return { ok: false, text: `Ferramenta desconhecida: ${name}` };
  const tool = AI_TOOLS[name];
  const parsed = tool.input.safeParse(call.input ?? {});
  if (!parsed.success) return { ok: false, text: `Parâmetros inválidos: ${parsed.error.message}` };
  const state = useProject.getState();
  if (call.projectId && state.project?.id !== call.projectId)
    return {
      ok: false,
      text: "O projeto aberto no EdiAula não é mais o deste pedido (a pessoa abriu outra aula). Nada foi feito. Avise a pessoa e não continue editando.",
    };
  if (source === "assistant" && PANEL_FORBIDDEN.has(name))
    return {
      ok: false,
      text: "No chat do EdiAula, abrir ou criar projetos é com a pessoa: peça para ela abrir a aula.",
    };
  const turn = state.aiTurn;
  const entry: ToolContext["entry"] = {
    origin: "ai",
    key: `ai:${call.id}`,
    ...(call.projectId ? { projectId: call.projectId } : {}),
    ...(source === "assistant" && call.projectId
      ? {
          conversation: call.projectId,
          ...(turn && turn.projectId === call.projectId ? { turn: turn.id } : {}),
        }
      : {}),
    ...(call.client ? { client: call.client } : {}),
  };
  const run = (): Promise<string> =>
    (handlers[name] as Handler)(parsed.data as never, { entry, call });
  try {
    if (tool.permission === "read") return { ok: true, text: await run() };
    const { value, refused } = await runAsAi(entry, run);
    if (refused)
      return {
        ok: false,
        text: "A pessoa trocou de aula enquanto a ferramenta rodava: nada foi gravado na aula que está aberta agora.",
      };
    if (source === "mcp") useApp.getState().toast(`IA conectada: ${tool.title}`, "success");
    return { ok: true, text: value };
  } catch (err) {
    return {
      ok: false,
      text: err instanceof ToolError ? err.message : `Erro: ${(err as Error).message}`,
    };
  }
}

const folderOf = (path: string): string => path.replace(/[/][^/]*$/, "");

/**
 * Keeps the main process informed of the open project and the folders of its media: paths an
 * AI sends inside them are used without asking (main/aiPaths.ts).
 */
export function reportAiContext(): () => void {
  let last = "";
  const send = (path: string | null, project: Project | null): void => {
    const mediaFolders = [
      ...new Set((project?.assets ?? []).map((a) => folderOf(a.path)).filter(Boolean)),
    ];
    const key = JSON.stringify([path, mediaFolders]);
    if (key === last) return;
    last = key;
    window.api.setAiContext({ projectPath: path, mediaFolders }).catch((err: unknown) => {
      // Without it, paths an AI sends are confirmed one by one; editing goes on as usual.
      console.error("[ediaula] ai_context_failed", err instanceof Error ? err.message : err);
    });
  };
  const now = useProject.getState();
  send(now.path, now.project);
  return useProject.subscribe((s, prev) => {
    if (s.path !== prev.path || s.project?.assets !== prev.project?.assets) send(s.path, s.project);
  });
}
