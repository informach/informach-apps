import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { LessonClip } from "../../../shared/lessonClips";
import { type LessonScript, lessonScript, pickedScript } from "../../../shared/lessonScript";
import {
  DEFAULT_FONTS,
  duplicateRecipe,
  emptyRecipeStore,
  fromLesson,
  type GuideImage,
  isBuiltIn,
  listRecipes,
  missingInputs,
  originalRecipe,
  type PickedFile,
  RECIPE_INPUTS,
  RECIPE_KIND_LABELS,
  RECIPE_KINDS,
  type Recipe,
  type RecipeKind,
  type RecipeStore,
  type RunInputs,
  removeRecipe,
  restoreRecipe,
  runInputsSchema,
  saveRecipe,
  withGuide,
} from "../../../shared/pipelines";
import {
  failureText,
  type PipelineBridge,
  type PipelineEditor,
  type RunProgress,
  type RunRecord,
  recordForDisk,
  restoredRecord,
  runPipeline,
  type StepState,
  stepsFor,
  stoppedAt,
} from "./runner";
import "./pipelines.css";

/** The desktop bridge as the panel uses it (preload). */
export interface PipelinesDesktop extends PipelineBridge {
  pipelinesRead(): Promise<RecipeStore>;
  pipelinesWrite(store: RecipeStore): Promise<RecipeStore>;
  pipelinePick(kind: PickedFile["kind"]): Promise<PickedFile | null>;
  /** Keeps a style guide picture in the profile (main/pipelineGuides.ts). */
  pipelineGuideSave(bytes: Uint8Array, name: string): Promise<GuideImage>;
  /** The lesson of a picked package: its id and script (lessonPackage.ts packageLesson). */
  pipelineLessonScript(token: string): Promise<{
    id: string | null;
    script: { text: string; section: number } | null;
  }>;
  /** Where a run stopped, by project (main/pipelineRuns.ts). */
  pipelineRunSave(projectId: string, record: RunRecord): Promise<void>;
  pipelineRunLoad(projectId: string): Promise<unknown>;
  pipelineRunClear(projectId: string): Promise<void>;
  /** The end of a run, for the phone notice the main process sends when it is set up. */
  pipelineNotify(notice: { ok: boolean; recipe: string; seconds: number }): Promise<void>;
  /** Opens another EdiSVG window (main/index.js openWindow), for another run at the same time. */
  newWindow(): Promise<void>;
}

/**
 * The runs that stopped in this window, by project, with their media: closing the dialog does
 * not lose them. The profile keeps a copy without media for after EdiSVG is reopened.
 */
const stoppedRuns = new Map<string, RunRecord>();

/** The phrases of the picked lesson's script, and which of them this run animates. */
interface LessonPick {
  script: LessonScript;
  picked: ReadonlySet<number>;
}

/** The lesson the audio comes from: its id in EdiAula and the section of its script. */
interface LessonRef {
  id: string;
  section: number;
}

/** Short names of the kinds, for the phrases already animated. */
const DONE_LABELS: Record<RecipeKind, string> = {
  "game-scene": "cena em tela inteira",
  "screen-demo": "demonstração sobre a tela",
  "presenter-talk": "aula teórica com a apresentadora",
};

/** The kinds of animation each phrase of the lesson's section already has in the project. */
function donePhrases(
  clips: readonly LessonClip[],
  lesson: LessonRef | null,
): ReadonlyMap<string, RecipeKind[]> {
  const out = new Map<string, RecipeKind[]>();
  if (!lesson) return out;
  for (const clip of clips) {
    if (clip.lessonId !== lesson.id || clip.section !== lesson.section) continue;
    for (const phrase of clip.phrases) {
      const kinds = out.get(phrase) ?? [];
      if (!kinds.includes(clip.kind)) kinds.push(clip.kind);
      out.set(phrase, kinds);
    }
  }
  return out;
}

/** The lesson's script as phrases to pick: a direction shows before the phrases it goes with. */
function LessonPhrases({
  lesson,
  done,
  disabled,
  onChange,
  onHand,
}: {
  lesson: LessonPick;
  done: ReadonlyMap<string, RecipeKind[]>;
  disabled: boolean;
  onChange(picked: ReadonlySet<number>): void;
  onHand(): void;
}) {
  const all = () => new Set(Array.from({ length: lesson.script.phrases }, (_, i) => i));
  const animated = lesson.script.rows.filter(
    (row) => row.kind === "phrase" && done.has(row.text),
  ).length;
  return (
    <fieldset className="pipeline-phrases" disabled={disabled}>
      <legend>Roteiro da aula · {lesson.script.title}</legend>
      <p className="micro">
        {lesson.picked.size} de {lesson.script.phrases} frases nesta animação
        {animated
          ? ` · ${animated} já ${animated === 1 ? "animada" : "animadas"} neste projeto`
          : ""}
        . As indicações "Na tela" vão junto, como anotação.
      </p>
      <div className="pipeline-phrase-actions">
        <button type="button" onClick={() => onChange(all())}>
          Marcar todas
        </button>
        <button type="button" onClick={() => onChange(new Set())}>
          Desmarcar todas
        </button>
        <button type="button" onClick={onHand}>
          Escrever à mão
        </button>
      </div>
      <ol>
        {lesson.script.rows.map((row, i) =>
          row.kind === "screen" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: the rows are fixed for this lesson.
            <li key={`tela-${i}`} className="pipeline-direction" title={row.text}>
              Na tela: {row.text}
            </li>
          ) : (
            <li key={`frase-${row.index}`}>
              <label>
                <input
                  type="checkbox"
                  checked={lesson.picked.has(row.index)}
                  onChange={(event) => {
                    const next = new Set(lesson.picked);
                    if (event.target.checked) next.add(row.index);
                    else next.delete(row.index);
                    onChange(next);
                  }}
                />
                <span>
                  {row.text}
                  {done.has(row.text) && (
                    <small className="pipeline-done">
                      Já animada: {(done.get(row.text) ?? []).map((k) => DONE_LABELS[k]).join(", ")}
                    </small>
                  )}
                </span>
              </label>
            </li>
          ),
        )}
      </ol>
    </fieldset>
  );
}

/** A lesson given to the pipelines already chosen (a picked file of this session). */
interface HandedLesson {
  name: string;
  file: PickedFile;
}

interface Props {
  desktop: PipelinesDesktop;
  editor: PipelineEditor;
  /** The lesson EdiAula sent: every run starts with it chosen. */
  handed?: HandedLesson;
  report(message: string): void;
  close(): void;
  /** Tells the dialog a run is going (it then refuses to close). */
  setBusy(busy: boolean): void;
}

type View =
  | { name: "list" }
  | { name: "edit"; recipe: Recipe; isNew: boolean }
  | { name: "run"; recipe: Recipe };

const newRecipeId = () => `recipe-${crypto.randomUUID()}`;

/** The biggest style guide picture taken (main/pipelineGuides.ts GUIDE_BYTES). */
const GUIDE_BYTES = 40 * 1024 * 1024;

/**
 * The style guide picture of a recipe or a run: chosen from a file, shown small, replaced or
 * taken away. The run reads its colours and fonts, and the assistant follows it.
 */
function GuideField({
  guide,
  desktop,
  label,
  report,
  onChange,
  disabled = false,
}: {
  guide: GuideImage | undefined;
  desktop: Pick<PipelinesDesktop, "pipelineGuideSave" | "pipelineGuideRead">;
  label: string;
  report(message: string): void;
  onChange(guide: GuideImage | undefined): void;
  disabled?: boolean;
}) {
  const picture = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const id = guide?.id;
  useEffect(() => {
    if (!id) return;
    let url: string | null = null;
    let live = true;
    desktop.pipelineGuideRead(id).then(
      (kept) => {
        if (!live) return;
        url = URL.createObjectURL(new Blob([kept.bytes.slice().buffer], { type: kept.mediaType }));
        setPreview({ id, url });
      },
      () => {
        if (live) setMissing(id);
      },
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, desktop]);
  const shown = id && preview?.id === id ? preview.url : null;
  const choose = async (file: File) => {
    if (file.size > GUIDE_BYTES) {
      report("O guia de estilo passa de 40 MB.");
      return;
    }
    setReading(true);
    try {
      onChange(
        await desktop.pipelineGuideSave(new Uint8Array(await file.arrayBuffer()), file.name),
      );
    } catch (error) {
      report(failureText(error));
    } finally {
      setReading(false);
    }
  };
  const chooseButton = (text: string) => (
    <button type="button" disabled={disabled || reading} onClick={() => picture.current?.click()}>
      {reading ? "Lendo a imagem…" : text}
    </button>
  );
  return (
    <fieldset className="pipeline-palette pipeline-guide">
      <legend>{label}</legend>
      {guide ? (
        <div className="pipeline-guide-row">
          {shown ? (
            <img
              className="pipeline-guide-thumb"
              src={shown}
              alt={`Guia de estilo ${guide.name}`}
            />
          ) : (
            <span className="pipeline-guide-thumb" aria-hidden="true" />
          )}
          <div className="pipeline-guide-info">
            <strong title={guide.name}>{guide.name}</strong>
            <span className="micro">
              {missing === guide.id
                ? "Esta imagem não está mais neste computador: escolha de novo."
                : "As cores e as fontes da execução saem desta imagem (lidas na primeira vez e guardadas com ela), e o assistente segue as regras, os tamanhos e os componentes dela. Quando ela e as instruções discordarem, vale o guia."}
            </span>
            <div className="pipeline-swatches">
              {chooseButton("Trocar imagem…")}
              <button type="button" disabled={disabled} onClick={() => onChange(undefined)}>
                Sem guia
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="pipeline-guide-row">
          <span className="micro">
            Uma imagem (PNG, JPEG ou WebP) com o guia de estilo das aulas: paleta, tipografia,
            componentes e regras. As cores e as fontes saem dele. Sem guia, a execução usa as cores
            da receita e as fontes Baloo 2 e Nunito.
          </span>
          {chooseButton("Carregar guia de estilo…")}
        </div>
      )}
      <input
        ref={picture}
        type="file"
        hidden
        aria-label={`Imagem do ${label.toLowerCase()}`}
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The same picture can be chosen again.
          event.target.value = "";
          if (file) void choose(file);
        }}
      />
    </fieldset>
  );
}

function RecipeEditor({
  recipe,
  isNew,
  desktop,
  report,
  onSave,
  onCancel,
}: {
  recipe: Recipe;
  isNew: boolean;
  desktop: PipelinesDesktop;
  report(message: string): void;
  onSave(recipe: Recipe): void;
  onCancel(): void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(recipe);
  const original = originalRecipe(recipe.id);
  return (
    <>
      <div className="help-content pipeline-body">
        <label className="scene-field" htmlFor={`${id}-name`}>
          Nome
          <input
            id={`${id}-name`}
            value={draft.name}
            maxLength={80}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="scene-field" htmlFor={`${id}-kind`}>
          Tipo
          <select
            id={`${id}-kind`}
            value={draft.kind}
            disabled={!isNew}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as RecipeKind })}
          >
            {RECIPE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {RECIPE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="scene-field" htmlFor={`${id}-style`}>
          Instruções para o assistente
          <textarea
            id={`${id}-style`}
            rows={7}
            maxLength={4000}
            value={draft.style}
            onChange={(event) => setDraft({ ...draft, style: event.target.value })}
          />
        </label>
        <GuideField
          label="Guia de estilo"
          guide={draft.guideImage}
          desktop={desktop}
          report={report}
          onChange={(guide) => setDraft(withGuide(draft, guide))}
        />
      </div>
      <div className="dialog-footer">
        {original && (
          <button type="button" onClick={() => setDraft(original)}>
            Voltar ao original
          </button>
        )}
        <span />
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="primary"
          disabled={!draft.name.trim()}
          onClick={() => onSave({ ...draft, name: draft.name.trim() })}
        >
          Salvar receita
        </button>
      </div>
    </>
  );
}

const fileLabel = (file: PickedFile) =>
  `${file.name}${file.kind === "lesson" ? " (pacote da aula do EdiAula)" : ""}`;

const STEP_TEXT: Record<StepState["status"], string> = {
  waiting: "Aguardando",
  running: "Em andamento",
  done: "Pronto",
  failed: "Falhou",
  cancelled: "Não feito",
};

function RunForm({
  recipe,
  desktop,
  editor,
  report,
  onBack,
  setBusy,
  handed,
}: {
  recipe: Recipe;
  desktop: PipelinesDesktop;
  editor: PipelineEditor;
  handed?: HandedLesson;
  report(message: string): void;
  onBack(): void;
  setBusy(busy: boolean): void;
}) {
  const id = useId();
  const [files, setFiles] = useState<RunInputs["files"]>({});
  const [typed, setScript] = useState("");
  // The lesson's own script, as phrases to pick; null for an audio file, a lesson without a
  // script, or after "Escrever à mão" (the typed roteiro then starts from the phrases picked).
  const [lesson, setLesson] = useState<LessonPick | null>(null);
  const [lessonRef, setLessonRef] = useState<LessonRef | null>(null);
  const script = lesson ? pickedScript(lesson.script, lesson.picked) : typed;
  // What this project already animated of the lesson's section (each run records its phrases).
  const done = donePhrases(editor.lessonClips(), lessonRef);
  const [guide, setGuide] = useState(recipe.guideImage);
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; report: string[] } | null>(null);
  const control = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
      control.current?.abort();
    },
    [],
  );
  // A run of this recipe that stopped on this project: "Continuar de onde parou".
  const [stopped, setStopped] = useState<RunRecord | null>(null);
  // The steps of the run going (a continued run keeps the guide it was started with).
  const [runSteps, setRunSteps] = useState<ReturnType<typeof stepsFor> | null>(null);
  useEffect(() => {
    const projectId = editor.runPlace().projectId;
    const kept = stoppedRuns.get(projectId);
    if (kept) {
      if (kept.recipeId === recipe.id) setStopped(kept);
      return;
    }
    let current = true;
    Promise.resolve()
      .then(() => desktop.pipelineRunLoad(projectId))
      .then((value) => {
        const record = restoredRecord(value, recipe);
        if (current && live.current && record) setStopped(record);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [desktop, editor, recipe]);
  const forget = (projectId: string) => {
    stoppedRuns.delete(projectId);
    // The copy in the profile only helps after a reopening: failing to keep it stops nothing.
    Promise.resolve()
      .then(() => desktop.pipelineRunClear(projectId))
      .catch(() => undefined);
  };
  const steps = runSteps ?? stepsFor(recipe.kind, !!guide);
  // The colours and fonts come from the style guide; the recipe's are used only without one.
  const inputs = {
    recipeId: recipe.id,
    files,
    script,
    textPalette: recipe.textPalette,
    fonts: recipe.fonts,
    ...(guide ? { guideImage: guide } : {}),
    ...(lessonRef
      ? {
          lesson: {
            ...lessonRef,
            phrases: lesson
              ? lesson.script.rows.flatMap((row) =>
                  row.kind === "phrase" && lesson.picked.has(row.index) ? [row.text] : [],
                )
              : [],
          },
        }
      : {}),
  };
  const missing = missingInputs(recipe, inputs);
  /** Takes `file` as the input `key`; a lesson package brings its script's phrases. */
  const choose = async (key: keyof RunInputs["files"], file: PickedFile) => {
    setFiles((current) => ({ ...current, [key]: file }));
    if (key !== "audio") return;
    // The lesson's script comes with it: its phrases, all picked, instead of pasting them.
    setLesson(null);
    setLessonRef(null);
    if (file.kind !== "lesson") return;
    const found = await desktop.pipelineLessonScript(file.token);
    const parsed = found.script ? lessonScript(found.script.text, found.script.section) : null;
    if (!live.current) return;
    const ref = found.id ? { id: found.id, section: found.script?.section ?? 0 } : null;
    setLessonRef(ref);
    if (!parsed) {
      report("A aula não tem roteiro com falas: escreva o roteiro do trecho.");
      return;
    }
    // The phrases this project has not animated yet start picked: the next stretch.
    const already = donePhrases(editor.lessonClips(), ref);
    setLesson({
      script: parsed,
      picked: new Set(
        parsed.rows.flatMap((row) =>
          row.kind === "phrase" && !already.has(row.text) ? [row.index] : [],
        ),
      ),
    });
  };
  const pick = async (key: keyof RunInputs["files"], kind: PickedFile["kind"]) => {
    try {
      const file = await desktop.pipelinePick(kind);
      if (!file || !live.current) return;
      await choose(key, file);
    } catch (error) {
      report(failureText(error));
    }
  };
  // The lesson EdiAula sent comes chosen, once, when the run form opens.
  const handedAtStart = useRef(handed);
  const chooseAtStart = useRef(choose);
  useEffect(() => {
    const lesson = handedAtStart.current;
    const input = RECIPE_INPUTS[recipe.kind].find((item) => item.accepts.includes("lesson"));
    if (!lesson || !input) return;
    chooseAtStart.current(input.key, lesson.file).catch((error: unknown) => {
      if (live.current) report(failureText(error));
    });
  }, [recipe.kind, report]);
  /** Runs the recipe from the start, or continues `from` (a run that stopped) where it stopped. */
  const start = async (from?: RunRecord) => {
    const parsed = runInputsSchema.safeParse(from ? from.inputs : inputs);
    if (!parsed.success || (!from && missing.length)) return;
    // A reply the assistant is writing would land on the file in the middle of the run.
    if (editor.assistantBusy()) {
      report("Espere o assistente terminar a resposta, ou interrompa, antes de rodar o pipeline.");
      return;
    }
    const projectId = editor.runPlace().projectId;
    // Continuing: the artboard and animation of the run open again, if they are still there.
    if (from && !editor.resumeRun(from.place)) {
      forget(from.place.projectId);
      setStopped(null);
      report("O que o pipeline tinha feito não está mais neste projeto: rode o pipeline de novo.");
      return;
    }
    // Rodar starts over: the run that had stopped is no longer continued.
    if (!from) forget(projectId);
    const runInputs = parsed.data;
    const used = stepsFor(recipe.kind, !!runInputs.guideImage);
    const keep = (progress: RunProgress) => {
      const record: RunRecord = {
        version: 1,
        recipeId: recipe.id,
        inputs: runInputs,
        place: editor.runPlace(),
        done: [...progress.done],
        results: { ...progress.results },
        report: [...progress.report],
        savedAt: Date.now(),
      };
      stoppedRuns.set(projectId, record);
      Promise.resolve()
        .then(() => desktop.pipelineRunSave(projectId, recordForDisk(record)))
        .catch(() => undefined);
    };
    const abort = new AbortController();
    control.current = abort;
    setRunning(true);
    setBusy(true);
    setOutcome(null);
    setStopped(null);
    setStates({});
    setRunSteps(used);
    editor.beginRun();
    const startedAt = performance.now();
    try {
      const result = await runPipeline(
        recipe,
        runInputs,
        used,
        { editor, bridge: desktop, signal: abort.signal },
        (stepId, state) => {
          if (live.current) setStates((current) => ({ ...current, [stepId]: state }));
        },
        { ...(from ? { resume: from } : {}), onCheckpoint: keep },
      );
      // Done: nothing to continue. Stopped: Continuar picks up after the last step or part done.
      if (result.ok) forget(projectId);
      const kept = stoppedRuns.get(projectId);
      if (live.current) {
        setOutcome({ ok: result.ok, report: result.report });
        setStopped(!result.ok && kept?.recipeId === recipe.id ? kept : null);
      }
      // Stopped by the person: they are at the computer, no notice.
      if (!abort.signal.aborted)
        desktop
          .pipelineNotify({
            ok: result.ok,
            recipe: recipe.name,
            seconds: (performance.now() - startedAt) / 1000,
          })
          .catch(() => undefined);
    } finally {
      // Whatever the run did (also when it stopped) is undone by one Ctrl+Z.
      editor.endRun();
      if (live.current) {
        setRunning(false);
        setRunSteps(null);
      }
      setBusy(false);
      control.current = null;
    }
  };
  return (
    <>
      <div className="help-content pipeline-body">
        <p className="pipeline-recipe-line">
          <strong>{recipe.name}</strong> · {RECIPE_KIND_LABELS[recipe.kind]}
        </p>
        {RECIPE_INPUTS[recipe.kind].map((input) => {
          const file = files[input.key];
          if (fromLesson(input, files))
            return (
              <div key={input.key} className="pipeline-input">
                <span>{input.label}</span>
                <div className="pipeline-input-row">
                  <span className="pipeline-file">{input.inLesson}</span>
                </div>
              </div>
            );
          return (
            <div key={input.key} className="pipeline-input">
              <span>{input.label}</span>
              <div className="pipeline-input-row">
                <span className="pipeline-file">{file ? fileLabel(file) : "Nenhum arquivo"}</span>
                {input.accepts.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={running}
                    onClick={() => void pick(input.key, kind)}
                  >
                    {kind === "lesson"
                      ? "Escolher aula…"
                      : kind === "audio"
                        ? "Escolher áudio…"
                        : (input.button ?? "Escolher…")}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {lesson ? (
          <LessonPhrases
            lesson={lesson}
            done={done}
            disabled={running}
            onChange={(picked) => setLesson({ ...lesson, picked })}
            onHand={() => {
              setScript(pickedScript(lesson.script, lesson.picked));
              setLesson(null);
            }}
          />
        ) : (
          <>
            <label className="scene-field" htmlFor={`${id}-script`}>
              Roteiro do trecho (só a parte desta cena)
              <textarea
                id={`${id}-script`}
                rows={8}
                maxLength={20000}
                disabled={running}
                value={typed}
                placeholder="Cole aqui o que é narrado nesta cena."
                onChange={(event) => setScript(event.target.value)}
              />
            </label>
            <p className="micro">
              Texto entre [colchetes] é anotação (o que acontece na tela, uma indicação) e fica fora
              da busca no áudio.
            </p>
          </>
        )}
        <GuideField
          label="Guia de estilo desta vez"
          guide={guide}
          desktop={desktop}
          report={report}
          disabled={running}
          onChange={setGuide}
        />
        {steps.length > 0 && (
          <ol className="pipeline-steps" aria-label="Etapas">
            {steps.map((step) => {
              const state = states[step.id] ?? { status: "waiting" };
              return (
                <li key={step.id} className={`is-${state.status}`}>
                  <span>{step.label}</span>
                  <span className="pipeline-step-state">
                    {state.status === "running"
                      ? `${state.detail ?? STEP_TEXT.running}${state.ratio === undefined ? "" : ` · ${Math.round(state.ratio * 100)}%`}`
                      : state.status === "failed"
                        ? `${STEP_TEXT.failed}: ${state.message}`
                        : STEP_TEXT[state.status]}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {outcome && (
          <div className={`pipeline-outcome ${outcome.ok ? "is-ok" : "is-failed"}`} role="status">
            <strong>{outcome.ok ? "Pipeline concluído." : "O pipeline parou."}</strong>
            {outcome.report.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        {stopped && !running && (
          <p className="micro pipeline-resume">
            A última execução desta receita neste projeto parou em:{" "}
            {stoppedAt(stopped, stepsFor(recipe.kind, !!stopped.inputs.guideImage))}. Continuar
            refaz só o que falta, com os mesmos arquivos e roteiro; Rodar pipeline começa do zero.
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" disabled={running} onClick={onBack}>
          Voltar
        </button>
        <span>{missing.length && !running ? `Falta: ${missing.join(", ")}.` : ""}</span>
        {running ? (
          <button type="button" onClick={() => control.current?.abort()}>
            Cancelar
          </button>
        ) : (
          <>
            {stopped && (
              <button type="button" className="primary" onClick={() => void start(stopped)}>
                Continuar de onde parou
              </button>
            )}
            <button
              type="button"
              className={stopped ? undefined : "primary"}
              disabled={missing.length > 0}
              onClick={() => void start()}
            >
              Rodar pipeline
            </button>
          </>
        )}
      </div>
    </>
  );
}

function PipelinesPanel({ desktop, editor, handed, report, close, setBusy }: Props) {
  const [running, setRunning] = useState(false);
  const busy = (value: boolean) => {
    setRunning(value);
    setBusy(value);
  };
  const [store, setStore] = useState<RecipeStore | null>(null);
  const [view, setView] = useState<View>({ name: "list" });
  /** The user recipe whose Excluir was pressed once (a second press removes it). */
  const [confirming, setConfirming] = useState<string | null>(null);
  // The store as last saved, and the saves in order: two quick changes never undo each other.
  const saved = useRef<RecipeStore | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let live = true;
    desktop
      .pipelinesRead()
      .then((value) => {
        if (!live) return;
        saved.current = value;
        setStore(value);
      })
      .catch((error: unknown) => {
        report(failureText(error));
        if (live) setStore(emptyRecipeStore());
      });
    return () => {
      live = false;
    };
  }, [desktop, report]);
  const persist = (change: (current: RecipeStore) => RecipeStore) => {
    saving.current = saving.current.then(async () => {
      const current = saved.current;
      // The recipes could not be read: nothing is written over the file.
      if (!current) return;
      try {
        const next = await desktop.pipelinesWrite(change(current));
        saved.current = next;
        setStore(next);
      } catch (error) {
        report(failureText(error));
      }
    });
  };
  const title =
    view.name === "list"
      ? "Pipelines"
      : view.name === "run"
        ? "Rodar pipeline"
        : view.isNew
          ? "Nova receita"
          : "Editar receita";
  return (
    <>
      <div className="dialog-heading">
        <h2>{title}</h2>
        <div className="pipeline-heading-actions">
          {/* The dialog covers the editor's menu and stays open while a run goes: another run
              starts in another window from here (Arquivo › Nova janela, Ctrl+Shift+N). */}
          <button
            type="button"
            className="pipeline-new-window"
            title="Abre outra janela do EdiSVG para rodar outro pipeline ao mesmo tempo (Ctrl+Shift+N)"
            onClick={() => {
              desktop.newWindow().catch((error: unknown) => report(failureText(error)));
            }}
          >
            Nova janela
          </button>
          <button
            type="button"
            aria-label="Fechar pipelines"
            title={running ? "Cancele o pipeline para fechar" : undefined}
            disabled={running}
            onClick={close}
          >
            ×
          </button>
        </div>
      </div>
      {!store ? (
        <div className="help-content">
          <p>Carregando as receitas…</p>
        </div>
      ) : view.name === "edit" ? (
        <RecipeEditor
          recipe={view.recipe}
          isNew={view.isNew}
          desktop={desktop}
          report={report}
          onCancel={() => setView({ name: "list" })}
          onSave={(recipe) => {
            persist((current) => saveRecipe(current, recipe));
            setView({ name: "list" });
          }}
        />
      ) : view.name === "run" ? (
        <RunForm
          recipe={view.recipe}
          desktop={desktop}
          editor={editor}
          report={report}
          onBack={() => setView({ name: "list" })}
          setBusy={busy}
          {...(handed ? { handed } : {})}
        />
      ) : (
        <>
          <div className="help-content pipeline-body">
            {handed && (
              <p className="pipeline-handed" role="status">
                Aula <strong>{handed.name}</strong>: escolha a receita, a aula já vem escolhida com
                as frases do roteiro. O resultado vai para a animação vinculada a ela.
              </p>
            )}
            <p>
              Uma receita guarda o que se repete: o tipo de trabalho, as instruções para o
              assistente, a paleta de texto e as fontes. Ao rodar, você escolhe só os arquivos e o
              roteiro desta vez.
            </p>
            <ul className="pipeline-list">
              {listRecipes(store).map((recipe) => (
                <li key={recipe.id}>
                  <div>
                    <strong>{recipe.name}</strong>
                    <small>
                      {RECIPE_KIND_LABELS[recipe.kind]}
                      {isBuiltIn(recipe.id) ? " · pronta" : ""}
                    </small>
                  </div>
                  <div className="pipeline-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setView({ name: "run", recipe })}
                    >
                      Rodar
                    </button>
                    <button
                      type="button"
                      onClick={() => setView({ name: "edit", recipe, isNew: false })}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const id = newRecipeId();
                        persist((current) => duplicateRecipe(current, recipe.id, id));
                      }}
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      aria-label={
                        confirming === recipe.id
                          ? `Confirmar a exclusão de ${recipe.name}`
                          : `Excluir ${recipe.name}`
                      }
                      className={confirming === recipe.id ? "danger" : undefined}
                      onBlur={() => setConfirming((id) => (id === recipe.id ? null : id))}
                      onClick={() => {
                        // A ready recipe comes back with Restaurar; one of the person's own does
                        // not, so it asks once more.
                        if (!isBuiltIn(recipe.id) && confirming !== recipe.id) {
                          setConfirming(recipe.id);
                          return;
                        }
                        setConfirming(null);
                        persist((current) => removeRecipe(current, recipe.id));
                      }}
                    >
                      {confirming === recipe.id ? "Excluir de vez?" : "Excluir"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {store.hidden.length > 0 && (
              <p className="micro">
                Receitas prontas excluídas:{" "}
                {store.hidden.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => persist((current) => restoreRecipe(current, id))}
                  >
                    Restaurar {originalRecipe(id)?.name ?? id}
                  </button>
                ))}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <span />
            <button
              type="button"
              onClick={() =>
                setView({
                  name: "edit",
                  isNew: true,
                  recipe: {
                    id: newRecipeId(),
                    name: "Nova receita",
                    kind: "game-scene",
                    style: "",
                    textPalette: ["#ffffff"],
                    fonts: DEFAULT_FONTS,
                  },
                })
              }
            >
              + Nova receita
            </button>
          </div>
        </>
      )}
    </>
  );
}

export function mountPipelines(dialog: HTMLDialogElement, props: Omit<Props, "close" | "setBusy">) {
  dialog.setAttribute("aria-label", "Pipelines");
  dialog.classList.add("pipelines-dialog");
  let live = true;
  const root = createRoot(dialog);
  const dispose = () => {
    if (!live) return;
    live = false;
    dialog.removeAttribute("aria-label");
    dialog.classList.remove("pipelines-dialog");
    dialog.removeEventListener("cancel", cancelEvent);
    dialog.removeEventListener("close", closeEvent);
    dialog.removeAttribute("closedby");
    root.unmount();
  };
  let busy = false;
  const close = () => {
    // A run in progress is stopped with Cancelar, never by closing the dialog under it.
    if (busy) return;
    dispose();
    dialog.close();
  };
  const cancelEvent = (event: Event) => {
    event.preventDefault();
    close();
  };
  // Chromium lets a repeated Esc close a modal even when "cancel" is prevented: while a run goes
  // the dialog takes no close request at all, and if it closes anyway it opens again.
  const closeEvent = () => {
    if (busy) dialog.showModal();
    else dispose();
  };
  dialog.addEventListener("cancel", cancelEvent);
  dialog.addEventListener("close", closeEvent);
  flushSync(() =>
    root.render(
      <PipelinesPanel
        {...props}
        close={close}
        setBusy={(value) => {
          busy = value;
          dialog.setAttribute("closedby", value ? "none" : "closerequest");
        }}
      />,
    ),
  );
  dialog.showModal();
  return dispose;
}
