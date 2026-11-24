import { IMAGE_LIMIT } from "@informach/edi-desktop/ai-attachments";
import { findScriptPiece, type HeardWord, type ScriptPiece } from "@informach/edi-speech/piece";
import type { LessonClip } from "../../../shared/lessonClips";
import {
  type BundledFamily,
  type BundledFont,
  type GuideStyle,
  nearestWeight,
  type PickedFile,
  type Recipe,
  type RecipeKind,
  type RunInputs,
  runInputsSchema,
  spokenScript,
} from "../../../shared/pipelines";
import {
  contentColumn,
  fittedVideo,
  LECTURE_GUIDES,
  LIGHT_RADIUS,
  lightGradient,
  type PersonBounds,
  type PlacementId,
  type PresenterStage,
  parsePlacements,
  personBox,
  placementBox,
  placementOf,
  planShots,
  type Shot,
  shotsReport,
} from "../../../shared/presenterFraming";
import { elementSvgs } from "./elements";
import { guideParts } from "./guideImage";
import {
  type DraftBoard,
  type DraftFonts,
  type DraftKit,
  draftRequest,
  framingRequest,
  guideStyleRequest,
  parseGuideStyle,
} from "./prompt";

/**
 * Runs a recipe: its steps in order, each reporting progress, all stopped by Cancelar. A step that
 * fails stops the run and says why; what earlier steps did stays (the editor undoes it). Steps
 * hand their results to the next ones through `results`.
 */

/** What the assistant is doing during a pipeline's request (the assistant panel tells it). */
export interface AssistantActivity {
  /** In words: "Pensando", "Escrevendo as alterações"… */
  text: string;
  /** How much of it so far ("13 KB"), or empty. */
  detail: string;
  /** Edits applied to the project so far. */
  edits: number;
  /** Milliseconds since the request was sent. */
  elapsed: number;
}

/** The draft step's line while the assistant works: what it is doing, its edits and the time. */
export function assistantLine(activity: AssistantActivity): string {
  const doing = activity.text
    ? `${activity.text}${activity.detail ? ` (${activity.detail})` : ""}`
    : "Trabalhando";
  const made = activity.edits
    ? ` · ${activity.edits} ${activity.edits === 1 ? "alteração" : "alterações"}`
    : "";
  return `Assistente: ${doing}${made} · ${clock(activity.elapsed / 1000)}`;
}

/** What the editor offers the steps (app.js builds it). */
export interface PipelineEditor {
  /** Imports a studio project into the open file (one edit); returns what came in. */
  importStudioProject(source: string): {
    summary: string;
    sceneArtboardId: string | null;
    imagePalette: string[];
    boards: DraftBoard[];
  };
  /** The artboard open in the editor. */
  activeArtboard(): DraftBoard;
  /**
   * The design kit of the project (Arquivo › Importar kit de design): its "Kit · …" artboards and
   * its colours. Empty when no kit was imported.
   */
  designKit(): DraftKit;
  /** The style guide chosen in the assistant panel, as the assistant reads it; null for none. */
  styleGuide(): string | null;
  /** Records on the open artboard the lesson stretch an animation of a run is (lessonClips.ts). */
  markLessonClip(value: LessonClip): void;
  /** The lesson stretches recorded in the project whose animation is still there. */
  lessonClips(): LessonClip[];
  /** Sets the palette of the open artboard (the colour picker offers it). */
  setPalette(colors: string[]): void;
  /**
   * Asks the assistant in a new conversation (with frames to look at); resolves when it ends,
   * with the error that ended it, if any. `onActivity` hears what it is doing about every second.
   */
  askAssistant(
    text: string,
    shown: string,
    /** Base64 images, in order; `name` labels each in the assistant panel. */
    images?: { mediaType: string; data: string; name?: string }[],
    onActivity?: (activity: AssistantActivity) => void,
  ): Promise<{ text: string; stopped: boolean; edits: number; error?: string }>;
  /** A new artboard of this size, opened (the transparent layer of a demonstration). */
  openDemoArtboard(value: { name: string; width: number; height: number }): DraftBoard;
  /**
   * The demonstration video under the open artboard, from `offset` seconds of the animation; with
   * `slotId`, the presenter's video (WebM with alpha) over it, in her spot.
   */
  setReferenceVideo(value: {
    bytes: Uint8Array;
    offset: number;
    duration: number;
    slotId?: string;
    mediaType?: "video/mp4" | "video/webm";
  }): void;
  /**
   * The stage of a theory lesson in the open artboard (width × height), from the back to the
   * front: the presenter's spot (a rectangle without paint the size of her video at scale 1,
   * locked), the background (a rectangle of `background`) and the light behind her (a circle of
   * `light.radius` painted with `light.gradient`). The spot and the light have their position
   * and scale keyed (cuts, "hold") at each shot of the animation `clipId`. The artboard takes
   * `guides`. Returns the ids.
   */
  addPresenterStage(value: {
    clipId: string;
    width: number;
    height: number;
    background: string;
    slot: {
      width: number;
      height: number;
      keys: { frame: number; x: number; y: number; scale: number }[];
    };
    light: {
      color: string;
      radius: number;
      gradient: unknown;
      keys: { frame: number; x: number; y: number; scale: number }[];
    };
    guides: { axis: "x" | "y"; position: number }[];
  }): PresenterStage;
  /**
   * Artboards from SVG (the ready elements), keeping the open one open; their texts take the font
   * `fontAssetId` when given.
   */
  addArtboards(items: { name: string; svg: string }[], fontAssetId?: string): DraftBoard[];
  /**
   * Embeds fonts of the bundle in the project (their license notice with them); returns the asset
   * of each, in order. A font already in the project is not added twice.
   */
  embedFonts(fonts: BundledFont[]): Promise<string[]>;
  /** Stops the assistant's reply (Cancelar). */
  stopAssistant(): void;
  /** The assistant is writing a reply (a run then waits: it would edit the file meanwhile). */
  assistantBusy(): boolean;
  /** A run starts: every edit until endRun becomes one undo step. */
  beginRun(): void;
  endRun(): void;
  /**
   * The project as it is before a part of the draft; `undoPart` goes back to it when the part
   * fails, so trying it again starts clean (the parts done before stay).
   */
  partStart(): unknown;
  undoPart(saved: unknown): void;
  /** Where the run works: the project, its open artboard and animation. */
  runPlace(): RunPlace;
  /**
   * Opens the artboard and the animation of a run that stopped, to continue it; false when the
   * project is another or they are gone.
   */
  resumeRun(place: RunPlace): boolean;
  /**
   * Opens an animation as long as the narration (in the open artboard) and plays the narration
   * with it in the preview; returns the animation.
   */
  openNarration(value: {
    name: string;
    bytes: Uint8Array;
    duration: number;
    lessonStart: number;
    lines: { text: string; start: number; end: number }[];
  }): Promise<{ clipId: string; fps: number; frames: number }>;
}

/** What the main process offers the steps (preload). */
export interface VideoFacts {
  width: number;
  height: number;
  duration: number;
  clicks: { t: number; x: number; y: number }[] | null;
}

export interface PipelineBridge {
  pipelineReadProject(token: string): Promise<string>;
  pipelineFonts(): Promise<BundledFamily[]>;
  pipelineFont(family: string, weight: number): Promise<BundledFont>;
  pipelineVideoFacts(token: string): Promise<VideoFacts>;
  /**
   * The presenter in [from, from + seconds) of her video: the colour of the green screen, where she
   * stands in the picture, and the stretch without the screen (WebM with alpha) for the preview.
   */
  pipelinePresenter(
    token: string,
    from: number,
    seconds: number,
    jobId: string,
  ): Promise<{ screen: string; person: PersonBounds; preview: Uint8Array }>;
  pipelineVideoPreview(token: string, seconds: number, jobId: string): Promise<Uint8Array>;
  pipelineVideoFrames(
    token: string,
    times: number[],
    jobId: string,
  ): Promise<{ mediaType: "image/jpeg"; data: string }[]>;
  /**
   * The screen of [from, to) of a lesson package as a video of its own (the timeline's cuts, the
   * clicks beside it), handed back as a picked video.
   */
  pipelineLessonVideo(token: string, from: number, to: number, jobId: string): Promise<PickedFile>;
  pipelineWords(token: string, kind: string, jobId: string): Promise<HeardWord[]>;
  pipelineNarration(
    token: string,
    kind: string,
    start: number,
    end: number,
    jobId: string,
  ): Promise<Uint8Array>;
  pipelineCancel(jobId: string): Promise<void>;
  /** A style guide picture kept in the profile (main/pipelineGuides.ts). */
  pipelineGuideRead(id: string): Promise<{ mediaType: string; bytes: Uint8Array }>;
  /** The colours and fonts read from a guide picture before (null: never read). */
  pipelineGuideStyle(id: string): Promise<GuideStyle | null>;
  pipelineGuideStyleSave(id: string, style: GuideStyle): Promise<void>;
  onPipelineProgress(callback: (event: { jobId: string; ratio: number }) => void): () => void;
}

/** The project, artboard and animation a run works in. */
export interface RunPlace {
  projectId: string;
  artboardId: string | null;
  clipId: string | null;
}

/**
 * Where a run stopped, to continue it ("Continuar de onde parou"): the steps done, what they
 * handed on, the report so far, and the inputs and place of the run. Kept in memory and, without
 * the media, in the profile (main/pipelineRuns.ts).
 */
export interface RunRecord {
  version: 1;
  recipeId: string;
  inputs: RunInputs;
  place: RunPlace;
  done: string[];
  results: Record<string, unknown>;
  report: string[];
  savedAt: number;
}

/** What a run that continues starts with (a RunRecord's progress). */
export interface RunProgress {
  done: readonly string[];
  results: Record<string, unknown>;
  report: readonly string[];
}

export interface StepContext {
  recipe: Recipe;
  inputs: RunInputs;
  editor: PipelineEditor;
  bridge: PipelineBridge;
  signal: AbortSignal;
  /** 0..1 of this step, with an optional detail ("Transcrevendo 40%"). */
  progress(ratio: number, detail?: string): void;
  /** What the step is doing when it cannot say how far it is (the assistant's draft). */
  status(detail: string): void;
  /** Results of earlier steps, by name. */
  results: Record<string, unknown>;
  /** Lines of the final report. */
  report: string[];
  /** Saves where the run is now (a step's own progress, as the parts of the draft). */
  checkpoint(): void;
}

export interface PipelineStep {
  id: string;
  label: string;
  run(ctx: StepContext): Promise<void>;
}

export type StepState =
  | { status: "waiting" }
  /** Without `ratio` when the step cannot say how far it is. */
  | { status: "running"; ratio?: number; detail?: string }
  | { status: "done" }
  | { status: "failed"; message: string }
  | { status: "cancelled" };

const importProject: PipelineStep = {
  id: "import-project",
  label: "Importar o projeto do Estúdio",
  async run(ctx) {
    const file = ctx.inputs.files.project;
    if (!file) throw new Error("Escolha o projeto do Estúdio.");
    ctx.progress(0.1, "Lendo o projeto");
    const source = await ctx.bridge.pipelineReadProject(file.token);
    ctx.signal.throwIfAborted();
    ctx.progress(0.5, "Montando as pranchetas");
    const result = ctx.editor.importStudioProject(source);
    // Without the game's stage there is no Cena to animate: the draft would go into an image.
    if (!result.sceneArtboardId)
      throw new Error(
        "O projeto não tem a cena do jogo 2D (o palco): as imagens foram importadas, mas não há Cena para animar.",
      );
    ctx.results.sceneArtboardId = result.sceneArtboardId;
    ctx.results.imagePalette = result.imagePalette;
    ctx.results.images = result.boards;
    ctx.report.push(result.summary);
  },
};

/**
 * Runs a main-process job of a step: Cancelar stops it there (the transcription, FFmpeg), and
 * what comes back after Cancelar is not used.
 */
async function job<T>(ctx: StepContext, run: (jobId: string) => Promise<T>): Promise<T> {
  ctx.signal.throwIfAborted();
  const jobId = `pipeline-${crypto.randomUUID()}`;
  const cancel = () => void ctx.bridge.pipelineCancel(jobId);
  ctx.signal.addEventListener("abort", cancel, { once: true });
  try {
    return await run(jobId);
  } finally {
    ctx.signal.removeEventListener("abort", cancel);
    ctx.signal.throwIfAborted();
  }
}

/** Seconds as minutes and seconds ("6:05"). */
export const clock = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;

/**
 * The script's stretch in the lesson audio: the words of the audio (a lesson's transcripts, or the
 * file transcribed now), then the sentences of the script among them. A sentence that is not heard
 * stops the run, naming it.
 */
const findPiece: PipelineStep = {
  id: "find-piece",
  label: "Ouvir a aula e achar o trecho do roteiro",
  async run(ctx) {
    const audio = voiceOf(ctx);
    if (!audio)
      throw new Error(
        ctx.recipe.kind === "presenter-talk"
          ? "Escolha o vídeo da apresentadora."
          : "Escolha o áudio da aula.",
      );
    const lesson = audio.kind === "lesson";
    ctx.progress(0, lesson ? "Abrindo o pacote da aula" : "Transcrevendo o áudio");
    const words: HeardWord[] = await job(ctx, async (jobId) => {
      // A package without transcripts has its narration transcribed now.
      const stop = ctx.bridge.onPipelineProgress((event) => {
        if (event.jobId === jobId)
          ctx.progress(
            event.ratio * 0.9,
            lesson ? "Transcrevendo a narração da aula" : "Transcrevendo o áudio",
          );
      });
      try {
        return await ctx.bridge.pipelineWords(audio.token, audio.kind, jobId);
      } finally {
        stop();
      }
    });
    ctx.progress(0.95, "Procurando o roteiro");
    const spoken = spokenScript(ctx.inputs.script);
    if (!spoken) throw new Error("O roteiro só tem texto entre colchetes: nada para ouvir.");
    const piece: ScriptPiece = findScriptPiece(words, spoken);
    ctx.results.piece = piece;
    ctx.report.push(
      `Trecho achado na aula de ${clock(piece.start)} a ${clock(piece.end)}, com ${piece.lines.length} ${piece.lines.length === 1 ? "frase" : "frases"}.`,
    );
  },
};

/**
 * The file the narration is heard from: the lesson's audio (a file or EdiAula's package), or the
 * presenter's video in a theory lesson (her voice is its sound).
 */
const voiceOf = (ctx: Pick<StepContext, "recipe" | "inputs">): PickedFile | undefined =>
  ctx.recipe.kind === "presenter-talk" ? ctx.inputs.files.video : ctx.inputs.files.audio;

/** Breath kept before the first sentence and after the last one. */
const LEAD = 0.4;
const TAIL = 0.8;

/** The narration of the stretch, cut from the audio, and an animation as long as it. */
const prepareNarration: PipelineStep = {
  id: "narration",
  label: "Preparar a narração na prévia",
  async run(ctx) {
    const audio = voiceOf(ctx);
    const piece = ctx.results.piece as ScriptPiece | undefined;
    if (!audio || !piece) throw new Error("O trecho do roteiro não foi achado.");
    // A theory lesson's stretch was set with her video (it ends where the video does).
    const presenter = ctx.results.presenter as Presenter | undefined;
    const start = presenter?.start ?? Math.max(0, piece.start - LEAD);
    const end = presenter?.end ?? piece.end + TAIL;
    ctx.progress(0.2, "Cortando o áudio do trecho");
    const bytes = await job(ctx, (jobId) =>
      ctx.bridge.pipelineNarration(audio.token, audio.kind, start, end, jobId),
    );
    ctx.progress(0.7, "Criando a animação");
    const clip = await ctx.editor.openNarration({
      name: ctx.recipe.name,
      bytes,
      duration: end - start,
      lessonStart: start,
      lines: piece.lines.map((l) => ({ text: l.text, start: l.start - start, end: l.end - start })),
    });
    ctx.results.clip = clip;
    ctx.results.lessonStart = start;
    // The stretch of the lesson this animation is, on the artboard it is made in: the next run
    // sees these phrases done, and the animation goes back to the lesson at these seconds.
    const lesson = ctx.inputs.lesson;
    const kind = ctx.recipe.kind;
    if (lesson && audio.kind === "lesson" && kind !== "presenter-talk")
      ctx.editor.markLessonClip({
        clipId: clip.clipId,
        kind,
        lessonId: lesson.id,
        section: lesson.section,
        start,
        end,
        phrases: lesson.phrases,
      });
  },
};

/** The demonstration's state for the next steps. */
interface DemoVideo {
  /** The video the frames come from: the one picked, or the screen made from the package. */
  token: string;
  name: string;
  facts: VideoFacts;
  /** Animation second the video starts at (the breath before the first sentence). */
  offset: number;
  /** Seconds of video in the stretch. */
  duration: number;
}

/**
 * The screen demonstration: an artboard of the video's size (the transparent layer), the video
 * under it in the preview from the moment the stretch starts, and the clicks saved with it. With a
 * lesson package the video is the screen of the stretch, made from the package's recordings with
 * the cuts of the lesson; a picked video starts where the stretch does.
 */
const prepareVideo: PipelineStep = {
  id: "video",
  label: "Preparar o vídeo da demonstração",
  async run(ctx) {
    const audio = ctx.inputs.files.audio;
    const piece = ctx.results.piece as ScriptPiece | undefined;
    if (!piece) throw new Error("O trecho do roteiro não foi achado.");
    let file = ctx.inputs.files.video;
    if (audio?.kind === "lesson") {
      ctx.progress(0.05, "Montando a tela do trecho com os cortes da aula");
      file = await job(ctx, (jobId) =>
        ctx.bridge.pipelineLessonVideo(audio.token, piece.start, piece.end + TAIL, jobId),
      );
    }
    if (!file) throw new Error("Escolha o vídeo da demonstração.");
    ctx.progress(0.1, "Lendo o vídeo");
    const facts = await ctx.bridge.pipelineVideoFacts(file.token);
    const offset = piece.start - Math.max(0, piece.start - LEAD);
    const wanted = piece.end + TAIL - piece.start;
    const duration = Math.min(wanted, facts.duration || wanted);
    if (duration < 0.5) throw new Error("O vídeo é curto demais para o trecho.");
    ctx.signal.throwIfAborted();
    ctx.editor.openDemoArtboard({
      name: `Demonstração · ${file.name}`.slice(0, 120),
      width: facts.width,
      height: facts.height,
    });
    ctx.progress(0.4, "Preparando a prévia do vídeo");
    const bytes = await job(ctx, (jobId) =>
      ctx.bridge.pipelineVideoPreview(file.token, duration, jobId),
    );
    ctx.editor.setReferenceVideo({ bytes, offset, duration });
    const video: DemoVideo = { token: file.token, name: file.name, facts, offset, duration };
    ctx.results.video = video;
    const clicks = facts.clicks?.filter((c) => c.t <= duration).length ?? 0;
    ctx.report.push(
      `Demonstração ${facts.width}×${facts.height}: ${
        facts.clicks === null
          ? "sem cursor salvo; o assistente olha os quadros do vídeo"
          : `${clicks} ${clicks === 1 ? "clique gravado" : "cliques gravados"} no trecho`
      }.`,
    );
    if (wanted > (facts.duration || wanted) + 0.5)
      ctx.report.push("O vídeo acaba antes da narração do trecho.");
  },
};

/** The theory lesson's state for the next steps. */
interface Presenter {
  name: string;
  /** Her video's size, and where she stands in it (fractions). */
  video: { width: number; height: number };
  person: PersonBounds;
  /** Seconds of her video the animation covers (frame 0 is `start`). */
  start: number;
  end: number;
  preview: Uint8Array;
  board: DraftBoard;
}

/** The artboard of a theory lesson: EdiAula's lesson frame (the presenter goes over it there). */
export const LECTURE_BOARD = { width: 1920, height: 1080 } as const;

/**
 * The presenter's video: her green screen and where she stands (read from frames of the stretch),
 * the stretch without the screen for the preview, and the artboard of the lesson, opened.
 */
const preparePresenter: PipelineStep = {
  id: "presenter",
  label: "Preparar o vídeo da apresentadora (tirar o fundo verde)",
  async run(ctx) {
    const file = ctx.inputs.files.video;
    const piece = ctx.results.piece as ScriptPiece | undefined;
    if (!file) throw new Error("Escolha o vídeo da apresentadora.");
    if (!piece) throw new Error("O trecho do roteiro não foi achado.");
    ctx.progress(0.05, "Lendo o vídeo");
    const facts = await ctx.bridge.pipelineVideoFacts(file.token);
    const start = Math.max(0, piece.start - LEAD);
    const end = Math.min(piece.end + TAIL, facts.duration || piece.end + TAIL);
    if (end - start < 0.5) throw new Error("O vídeo é curto demais para o trecho.");
    ctx.progress(0.15, "Achando o fundo verde e a apresentadora");
    const found = await job(ctx, (jobId) =>
      ctx.bridge.pipelinePresenter(file.token, start, end - start, jobId),
    );
    const board = ctx.editor.openDemoArtboard({
      name: `Aula teórica · ${file.name}`.slice(0, 120),
      ...LECTURE_BOARD,
    });
    ctx.results.presenter = {
      name: file.name,
      video: { width: facts.width, height: facts.height },
      person: found.person,
      start,
      end,
      preview: found.preview,
      board,
    } satisfies Presenter;
    const pct = (v: number) => Math.round(v * 100);
    ctx.report.push(
      `Apresentadora ${facts.width}×${facts.height}, fundo ${found.screen}: ela ocupa de ${pct(found.person.left)}% a ${pct(found.person.right)}% da largura e de ${pct(found.person.top)}% a ${pct(found.person.bottom)}% da altura do vídeo.`,
    );
  },
};

/**
 * The shots: the assistant picks, sentence by sentence, where the presenter stands (EdiAula's
 * placements); the run joins short shots, keys her spot at each cut and puts her video in it.
 */
const planFraming: PipelineStep = {
  id: "framing",
  label: "Escolher os planos da apresentadora (onde ela fica em cada frase)",
  async run(ctx) {
    const presenter = ctx.results.presenter as Presenter | undefined;
    const clip = ctx.results.clip as { clipId: string; fps: number; frames: number } | undefined;
    const piece = ctx.results.piece as ScriptPiece | undefined;
    if (!presenter || !clip || !piece) throw new Error("A narração não foi preparada.");
    const frame = (seconds: number) =>
      Math.max(0, Math.min(clip.frames, Math.round((seconds - presenter.start) * clip.fps)));
    const lines = piece.lines.map((l) => ({
      text: l.text,
      from: frame(l.start),
      to: frame(l.end),
    }));
    ctx.signal.throwIfAborted();
    const stop = () => ctx.editor.stopAssistant();
    ctx.signal.addEventListener("abort", stop, { once: true });
    let placements: PlacementId[];
    try {
      ctx.status("O assistente está escolhendo os planos");
      const turn = await ctx.editor.askAssistant(
        framingRequest({ recipe: ctx.recipe, lines, fps: clip.fps }),
        `Pipeline "${ctx.recipe.name}": escolher onde a apresentadora fica em cada uma das ${lines.length} ${lines.length === 1 ? "frase" : "frases"}.`,
        [],
        (activity) => ctx.status(assistantLine(activity)),
      );
      ctx.signal.throwIfAborted();
      if (turn.stopped)
        throw new Error("O assistente foi interrompido antes de escolher os planos.");
      if (turn.error) throw new Error(turn.error);
      placements = parsePlacements(turn.text, lines.length);
    } finally {
      ctx.signal.removeEventListener("abort", stop);
    }
    const shots = planShots(lines, placements, clip.fps, clip.frames);
    const { board, video } = presenter;
    const base = fittedVideo(video, board);
    // The ink of the palette is the background, the accent (the last colour) lights her.
    const palette = runStyle(ctx).textPalette;
    const ink = palette[1] ?? palette[0] ?? "#101b35";
    const accent = palette.at(-1) ?? "#ffc23c";
    const g = LECTURE_GUIDES;
    const stage = ctx.editor.addPresenterStage({
      clipId: clip.clipId,
      width: board.width,
      height: board.height,
      background: ink,
      slot: {
        width: base.width,
        height: base.height,
        keys: shots.map((shot) => {
          const placement = placementOf(shot.placement);
          const box = placementBox(placement, video, board);
          return { frame: shot.from, x: box.x, y: box.y, scale: placement.scale };
        }),
      },
      light: {
        color: accent,
        radius: LIGHT_RADIUS,
        gradient: lightGradient(accent),
        keys: shots.map((shot) => ({ frame: shot.from, ...placementOf(shot.placement).light })),
      },
      guides: [
        ...[g.left, g.center, g.right].map((position) => ({ axis: "x" as const, position })),
        ...[g.top, g.bottom].map((position) => ({ axis: "y" as const, position })),
      ],
    });
    ctx.editor.setReferenceVideo({
      bytes: presenter.preview,
      offset: 0,
      duration: presenter.end - presenter.start,
      slotId: stage.slotId,
      mediaType: "video/webm",
    });
    ctx.results.shots = shots;
    ctx.results.stage = stage;
    ctx.report.push(
      `${shots.length} ${shots.length === 1 ? "plano" : "planos"} da apresentadora. No EdiAula, a posição do vídeo dela em cada trecho:`,
      ...shotsReport(shots, clip.fps, presenter.start),
    );
    // A video where she stands far from the middle: the column of the content may reach her.
    for (const placement of new Set(shots.map((s) => placementOf(s.placement)))) {
      const person = personBox(placement, video, board, presenter.person);
      const column = contentColumn(placement.side);
      const reaches =
        person &&
        (placement.side === "right"
          ? person.x < column.right
          : person.x + person.width > column.left);
      if (reaches)
        ctx.report.push(
          `Atenção: no plano ${placement.label}, ela chega a x ${placement.side === "right" ? person.x : person.x + person.width}, dentro da coluna do conteúdo (${column.left}–${column.right}). Confira na prévia.`,
        );
    }
  },
};

/**
 * The fonts of the run in the project: the title's (bold) and the body's (regular, and bold for
 * emphasis), each the nearest weight the family has. They go in as fonts of the project, so the
 * animation looks the same on any computer and in every export.
 */
const embedFonts: PipelineStep = {
  id: "fonts",
  label: "Incorporar as fontes de título e corpo",
  async run(ctx) {
    ctx.progress(0.1, "Lendo as fontes");
    const families = await ctx.bridge.pipelineFonts();
    const weightsOf = (family: string) => {
      const found = families.find((item) => item.family === family);
      if (!found) throw new Error(`A fonte ${family} não vem com o EdiSVG.`);
      return found.weights;
    };
    const { title, body } = runStyle(ctx).fonts;
    const wanted = [
      { family: title, weight: nearestWeight(weightsOf(title), 700) },
      { family: body, weight: nearestWeight(weightsOf(body), 400) },
      { family: body, weight: nearestWeight(weightsOf(body), 700) },
    ];
    const files: BundledFont[] = [];
    for (const font of wanted) {
      ctx.signal.throwIfAborted();
      files.push(await ctx.bridge.pipelineFont(font.family, font.weight));
    }
    ctx.signal.throwIfAborted();
    ctx.progress(0.6, "Incorporando ao projeto");
    const [titleId, bodyId, boldId] = await ctx.editor.embedFonts(files);
    if (!titleId || !bodyId || !boldId) throw new Error("As fontes não entraram no projeto.");
    const fonts: DraftFonts = {
      title: { family: title, weight: files[0]?.weight ?? 700, assetId: titleId },
      body: { family: body, weight: files[1]?.weight ?? 400, assetId: bodyId },
      bodyBold: { family: body, weight: files[2]?.weight ?? 700, assetId: boldId },
    };
    ctx.results.fonts = fonts;
    ctx.report.push(
      title === body
        ? `Fonte ${title} nos títulos e no corpo, incorporada ao projeto.`
        : `Fontes ${title} nos títulos e ${body} no corpo, incorporadas ao projeto.`,
    );
  },
};

/** The ready arrow, balloon, highlight and click mark, in the run's text palette and body font. */
const addElements: PipelineStep = {
  id: "elements",
  label: "Criar os elementos prontos (seta, balão, destaque e clique)",
  async run(ctx) {
    const fonts = ctx.results.fonts as DraftFonts | undefined;
    ctx.results.elements = ctx.editor.addArtboards(
      elementSvgs(runStyle(ctx).textPalette),
      fonts?.bodyBold.assetId,
    );
  },
};

/** The palette of the open artboard: the text colours first, then the images' (no repeats). */
const applyPalettes: PipelineStep = {
  id: "palettes",
  label: "Aplicar as paletas de texto e das imagens",
  async run(ctx) {
    const images = (ctx.results.imagePalette as string[] | undefined) ?? [];
    const colors = [
      ...new Set([...runStyle(ctx).textPalette, ...images].map((c) => c.toLowerCase())),
    ].slice(0, 64);
    ctx.editor.setPalette(colors);
    ctx.results.palette = colors;
  },
};

/**
 * A part of the draft: one conversation with the assistant, short and with a small context. A
 * theory lesson has the background first and then each shot (a long shot in pieces); the other
 * recipes go by a few sentences at a time.
 */
export interface DraftPart {
  id: string;
  label: string;
  /** Sentences (0-based) the part animates; none for the background. */
  lines: number[];
  background?: boolean;
  /** The shot (0-based) of a theory lesson the part is in. */
  shot?: number;
}

/** Sentences of a shot in one part, and of a part of the other recipes. */
export const SHOT_PART_LINES = 8;
export const DRAFT_PART_LINES = 6;

export function draftParts(
  count: number,
  shots?: readonly { lines: readonly number[] }[],
): DraftPart[] {
  if (shots?.length) {
    const parts: DraftPart[] = [{ id: "fundo", label: "Fundo", lines: [], background: true }];
    shots.forEach((shot, i) => {
      const split = shot.lines.length > SHOT_PART_LINES;
      for (let at = 0; at < shot.lines.length; at += SHOT_PART_LINES) {
        const lines = shot.lines.slice(at, at + SHOT_PART_LINES);
        const first = (lines[0] ?? 0) + 1;
        const last = (lines.at(-1) ?? 0) + 1;
        parts.push({
          id: split ? `corte-${i + 1}-${at / SHOT_PART_LINES + 1}` : `corte-${i + 1}`,
          label: split ? `Corte ${i + 1} (frases ${first}–${last})` : `Corte ${i + 1}`,
          lines,
          shot: i,
        });
      }
    });
    return parts;
  }
  const parts: DraftPart[] = [];
  for (let at = 0; at < count; at += DRAFT_PART_LINES) {
    const lines = Array.from({ length: Math.min(DRAFT_PART_LINES, count - at) }, (_, k) => at + k);
    const first = at + 1;
    const last = at + lines.length;
    parts.push({
      id: `frases-${first}-${last}`,
      label: first === last ? `Frase ${first}` : `Frases ${first}–${last}`,
      lines,
    });
  }
  return parts;
}

/**
 * The draft: the assistant animates the scene, each action in the time of its sentence, one part
 * at a time (each a new conversation). A part that fails is undone; the parts done stay, and
 * "Continuar de onde parou" asks only for the rest.
 */
const draftWithAssistant: PipelineStep = {
  id: "draft",
  label: "Pedir o rascunho da animação ao assistente",
  async run(ctx) {
    const clip = ctx.results.clip as { clipId: string; fps: number; frames: number } | undefined;
    const piece = ctx.results.piece as ScriptPiece | undefined;
    const lessonStart = ctx.results.lessonStart as number | undefined;
    if (!clip || !piece || lessonStart === undefined)
      throw new Error("A narração não foi preparada.");
    const frame = (seconds: number) =>
      Math.max(0, Math.min(clip.frames, Math.round((seconds - lessonStart) * clip.fps)));
    const video = ctx.results.video as DemoVideo | undefined;
    // The style guide goes first, in parts the assistant can read; a demonstration keeps room for
    // two frames of its video (a message takes IMAGE_LIMIT images).
    let guide: Awaited<ReturnType<typeof guideParts>> = [];
    if (ctx.inputs.guideImage) {
      ctx.progress(0.01, "Preparando o guia de estilo");
      const picture = await ctx.bridge.pipelineGuideRead(ctx.inputs.guideImage.id);
      guide = await guideParts(picture, video ? IMAGE_LIMIT - 2 : IMAGE_LIMIT);
    }
    // A theory lesson: the presenter's spot and where she stands in each shot.
    const presenter = ctx.results.presenter as Pick<Presenter, "name"> | undefined;
    const shots = ctx.results.shots as Shot[] | undefined;
    const stage = ctx.results.stage as PresenterStage | undefined;
    const lecture = presenter && shots && stage ? { presenter, shots, stage } : null;
    const parts = draftParts(piece.lines.length, lecture?.shots);
    const done = new Set((ctx.results.draftDone as string[] | undefined) ?? []);
    ctx.results.draftTotal = parts.length;
    ctx.checkpoint();
    const lines = piece.lines.map((l) => ({
      text: l.text,
      from: frame(l.start),
      to: frame(l.end),
    }));
    const artboard = ctx.editor.activeArtboard();
    for (const [index, part] of parts.entries()) {
      if (done.has(part.id)) continue;
      const many = parts.length > 1;
      const where = many ? `Parte ${index + 1} de ${parts.length} · ${part.label}` : "";
      const say = (detail: string) =>
        many ? ctx.progress(index / parts.length, `${where} · ${detail}`) : ctx.status(detail);
      let frames: { mediaType: string; data: string; name: string }[] = [];
      let demo: Parameters<typeof draftRequest>[0]["demo"];
      if (video) {
        // Up to four frames (two with a guide), a moment into the part's first sentences.
        const pickedLines = part.lines
          .slice(0, IMAGE_LIMIT - guide.length)
          .flatMap((i) => (piece.lines[i] ? [piece.lines[i]] : []));
        const times = pickedLines.map((l) =>
          Math.max(0, Math.min(video.duration - 0.1, l.start - piece.start + 0.3)),
        );
        if (times.length) {
          say("Tirando quadros do vídeo");
          try {
            const taken = await job(ctx, (jobId) =>
              ctx.bridge.pipelineVideoFrames(video.token, times, jobId),
            );
            frames = taken.map((f, i) => ({ ...f, name: `Quadro ${i + 1} do vídeo` }));
          } catch (error) {
            // A run continued after EdiSVG was reopened: its video is not open any more, and the
            // assistant goes on without frames (the clicks still say where she works).
            if (!ctx.results.restored || ctx.signal.aborted) throw error;
          }
        }
        demo = {
          video: { name: video.name, width: video.facts.width, height: video.facts.height },
          clicks:
            video.facts.clicks
              ?.filter((c) => c.t <= video.duration)
              .map((c) => ({
                frame: Math.round((c.t + video.offset) * clip.fps),
                x: c.x,
                y: c.y,
              })) ?? null,
          elements: (ctx.results.elements as DraftBoard[] | undefined) ?? [],
          attached: frames.length
            ? pickedLines.map((l, i) => ({
                frame: Math.round(((times[i] ?? 0) + video.offset) * clip.fps),
                text: l.text,
              }))
            : [],
        };
      }
      const request = draftRequest({
        recipe: ctx.recipe,
        artboard,
        clip: { id: clip.clipId, fps: clip.fps, frames: clip.frames },
        lines,
        images: (ctx.results.images as DraftBoard[] | undefined) ?? [],
        textPalette: runStyle(ctx).textPalette,
        fonts: (ctx.results.fonts as DraftFonts | undefined) ?? null,
        imagePalette: (ctx.results.imagePalette as string[] | undefined) ?? [],
        kit: ctx.editor.designKit(),
        // The recipe's guide picture stands for the guide chosen in the assistant panel.
        guide: guide.length ? null : ctx.editor.styleGuide(),
        guideParts: guide.length,
        lessonStart,
        ...(demo ? { demo } : {}),
        ...(lecture
          ? {
              presenter: {
                ...lecture.stage,
                video: lecture.presenter.name,
                shots: lecture.shots.map((shot) => {
                  const placement = placementOf(shot.placement);
                  return {
                    from: shot.from,
                    to: shot.to,
                    placement: placement.label,
                    side: placement.side,
                    lines: shot.lines,
                    column: contentColumn(placement.side),
                  };
                }),
              },
            }
          : {}),
        ...(many
          ? {
              part: {
                ...part,
                index,
                total: parts.length,
                done: parts.filter((p) => done.has(p.id)).map((p) => p.label),
              },
            }
          : {}),
      });
      // Cancelar while the frames were taken: the assistant is never asked.
      ctx.signal.throwIfAborted();
      const before = ctx.editor.partStart();
      const stop = () => ctx.editor.stopAssistant();
      ctx.signal.addEventListener("abort", stop, { once: true });
      try {
        // How far the assistant is cannot be known: the line says what it is doing and for how long.
        say("O assistente está animando");
        const about = many
          ? `${part.label}, parte ${index + 1} de ${parts.length}`
          : `${piece.lines.length} ${piece.lines.length === 1 ? "frase" : "frases"}`;
        const turn = await ctx.editor.askAssistant(
          request,
          `Pipeline "${ctx.recipe.name}": montar o rascunho da animação (${about}, tempos e imagens enviados${guide.length ? ", com o guia de estilo" : ""}).`,
          [...guide, ...frames],
          (activity) => say(assistantLine(activity)),
        );
        ctx.signal.throwIfAborted();
        if (turn.stopped) throw new Error("O assistente foi interrompido antes de terminar.");
        // Ended by a time limit or a failing client: what it did so far is not a finished part.
        if (turn.error)
          throw new Error(
            turn.edits
              ? `${turn.error} ${turn.edits === 1 ? "A alteração feita" : `As ${turn.edits} alterações feitas`} ${many ? "nesta parte" : "até ali"} ${turn.edits === 1 ? "foi desfeita" : "foram desfeitas"}.`
              : turn.error,
          );
        if (!turn.edits)
          throw new Error(
            `O assistente não alterou o projeto${turn.text.trim() ? `: ${turn.text.trim().slice(0, 300)}` : "."} Veja o painel Assistente.`,
          );
        ctx.report.push(
          `${many ? `${part.label}: o` : "O"} assistente fez ${turn.edits} ${turn.edits === 1 ? "alteração" : "alterações"} no rascunho.`,
        );
        if (turn.text.trim()) ctx.report.push(turn.text.trim().slice(0, many ? 1200 : 2000));
      } catch (error) {
        try {
          ctx.editor.undoPart(before);
        } catch {
          // Another file was opened meanwhile: nothing of the run is on it to undo.
        }
        if (!many || ctx.signal.aborted) throw error;
        throw new Error(`${where}: ${failureText(error)}`);
      } finally {
        ctx.signal.removeEventListener("abort", stop);
      }
      done.add(part.id);
      ctx.results.draftDone = parts.filter((p) => done.has(p.id)).map((p) => p.id);
      ctx.checkpoint();
    }
  },
};

/** The colours and fonts of the run: read from the style guide, or the recipe's when it has none. */
export const runStyle = (ctx: Pick<StepContext, "inputs" | "results">): GuideStyle =>
  (ctx.results.style as GuideStyle | undefined) ?? {
    textPalette: ctx.inputs.textPalette,
    fonts: ctx.inputs.fonts,
  };

/**
 * The colours and fonts of the style guide picture, read by the assistant the first time and kept
 * with the picture (main/pipelineGuides.ts), so later runs with the same guide go straight on.
 */
const readGuideStyle: PipelineStep = {
  id: "guide",
  label: "Ler as cores e as fontes do guia de estilo",
  async run(ctx) {
    const guide = ctx.inputs.guideImage;
    if (!guide) return;
    const kept = await ctx.bridge.pipelineGuideStyle(guide.id);
    let style: GuideStyle;
    if (kept) style = kept;
    else {
      ctx.progress(0.05, "Preparando o guia de estilo");
      const families = (await ctx.bridge.pipelineFonts()).map((f) => f.family);
      const parts = await guideParts(await ctx.bridge.pipelineGuideRead(guide.id), IMAGE_LIMIT);
      ctx.signal.throwIfAborted();
      const stop = () => ctx.editor.stopAssistant();
      ctx.signal.addEventListener("abort", stop, { once: true });
      try {
        ctx.status("O assistente está lendo o guia");
        const turn = await ctx.editor.askAssistant(
          guideStyleRequest(parts.length, families),
          `Pipeline "${ctx.recipe.name}": ler as cores e as fontes do guia de estilo ${guide.name}.`,
          parts,
          (activity) => ctx.status(assistantLine(activity)),
        );
        ctx.signal.throwIfAborted();
        if (turn.stopped) throw new Error("O assistente foi interrompido antes de ler o guia.");
        if (turn.error) throw new Error(turn.error);
        style = parseGuideStyle(turn.text, families);
      } finally {
        ctx.signal.removeEventListener("abort", stop);
      }
      await ctx.bridge.pipelineGuideStyleSave(guide.id, style);
    }
    ctx.results.style = style;
    ctx.report.push(
      `Do guia de estilo: cores ${style.textPalette.join(", ")}; ${style.fonts.title} nos títulos e ${style.fonts.body} no corpo.`,
    );
  },
};

/** The steps of each kind of recipe, in order (with a style guide, reading it comes first). */
export function stepsFor(kind: RecipeKind, guided = false): PipelineStep[] {
  const guide = guided ? [readGuideStyle] : [];
  if (kind === "presenter-talk")
    return [
      ...guide,
      findPiece,
      preparePresenter,
      prepareNarration,
      planFraming,
      applyPalettes,
      embedFonts,
      draftWithAssistant,
    ];
  if (kind === "game-scene")
    return [
      ...guide,
      importProject,
      findPiece,
      prepareNarration,
      applyPalettes,
      embedFonts,
      draftWithAssistant,
    ];
  return [
    ...guide,
    findPiece,
    prepareVideo,
    prepareNarration,
    applyPalettes,
    embedFonts,
    addElements,
    draftWithAssistant,
  ];
}

/** What failed, in the person's words: without Electron's "Error invoking remote method" wrapper. */
export function failureText(error: unknown): string {
  const text = error instanceof Error ? error.message : "A etapa falhou.";
  return (
    text.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, "") || "A etapa falhou."
  );
}

/** The record as kept in the profile: JSON, without media (the presenter's preview). */
export function recordForDisk(record: RunRecord): RunRecord {
  return JSON.parse(
    JSON.stringify(record, (_key, value: unknown) =>
      value instanceof Uint8Array ? undefined : value,
    ),
  );
}

/**
 * A record read back from the profile, for `recipe`. It continues only at the draft: the steps
 * before it work with media and picked files that a reopened EdiSVG no longer has. Null when it
 * cannot be continued.
 */
export function restoredRecord(value: unknown, recipe: Recipe): RunRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Partial<RunRecord>;
  const place = record.place;
  if (
    record.version !== 1 ||
    record.recipeId !== recipe.id ||
    !Array.isArray(record.done) ||
    !Array.isArray(record.report) ||
    typeof record.results !== "object" ||
    record.results === null ||
    typeof place !== "object" ||
    place === null ||
    typeof place.projectId !== "string"
  )
    return null;
  const inputs = runInputsSchema.safeParse(record.inputs);
  if (!inputs.success) return null;
  const done = record.done.filter((id): id is string => typeof id === "string");
  const next = stepsFor(recipe.kind, !!inputs.data.guideImage).find((s) => !done.includes(s.id));
  if (next?.id !== "draft") return null;
  return {
    version: 1,
    recipeId: recipe.id,
    inputs: inputs.data,
    place: {
      projectId: place.projectId,
      artboardId: typeof place.artboardId === "string" ? place.artboardId : null,
      clipId: typeof place.clipId === "string" ? place.clipId : null,
    },
    done,
    results: { ...record.results, restored: true },
    report: record.report.filter((line): line is string => typeof line === "string"),
    savedAt: typeof record.savedAt === "number" ? record.savedAt : 0,
  };
}

/** Where a kept run stopped, in words: the step, and the part of the draft. */
export function stoppedAt(record: RunRecord, steps: readonly PipelineStep[]): string {
  const next = steps.find((step) => !record.done.includes(step.id));
  if (!next) return "no fim";
  const total = record.results.draftTotal;
  const done = record.results.draftDone;
  return next.id === "draft" && typeof total === "number" && total > 1
    ? `${next.label} (parte ${(Array.isArray(done) ? done.length : 0) + 1} de ${total})`
    : next.label;
}

export interface RunOutcome {
  ok: boolean;
  report: string[];
  results: Record<string, unknown>;
}

/**
 * Runs the steps in order. With `resume` (a run that stopped), the steps it finished are not run
 * again: their results go on to the next ones. `onCheckpoint` hears the progress after every step
 * and every saved part of one, to keep it for a later "Continuar de onde parou".
 */
export async function runPipeline(
  recipe: Recipe,
  inputs: RunInputs,
  steps: readonly PipelineStep[],
  deps: { editor: PipelineEditor; bridge: PipelineBridge; signal: AbortSignal },
  onState: (stepId: string, state: StepState) => void,
  options: { resume?: RunProgress; onCheckpoint?: (progress: RunProgress) => void } = {},
): Promise<RunOutcome> {
  const results: Record<string, unknown> = { ...(options.resume?.results ?? {}) };
  const report: string[] = [...(options.resume?.report ?? [])];
  const done = new Set(options.resume?.done ?? []);
  const checkpoint = () =>
    options.onCheckpoint?.({
      done: steps.flatMap((s) => (done.has(s.id) ? [s.id] : [])),
      results,
      report,
    });
  for (const step of steps)
    onState(step.id, done.has(step.id) ? { status: "done" } : { status: "waiting" });
  for (const [index, step] of steps.entries()) {
    if (done.has(step.id)) continue;
    if (deps.signal.aborted) {
      for (const rest of steps.slice(index)) onState(rest.id, { status: "cancelled" });
      return { ok: false, report, results };
    }
    onState(step.id, { status: "running", ratio: 0 });
    try {
      await step.run({
        recipe,
        inputs,
        editor: deps.editor,
        bridge: deps.bridge,
        signal: deps.signal,
        results,
        report,
        progress: (ratio, detail) =>
          onState(step.id, {
            status: "running",
            ratio: Math.max(0, Math.min(1, ratio)),
            ...(detail ? { detail } : {}),
          }),
        status: (detail) => onState(step.id, { status: "running", detail }),
        checkpoint,
      });
      done.add(step.id);
      checkpoint();
      onState(step.id, { status: "done" });
    } catch (error) {
      const cancelled = deps.signal.aborted;
      onState(
        step.id,
        cancelled ? { status: "cancelled" } : { status: "failed", message: failureText(error) },
      );
      for (const rest of steps.slice(index + 1)) onState(rest.id, { status: "cancelled" });
      return { ok: false, report, results };
    }
  }
  return { ok: true, report, results };
}
