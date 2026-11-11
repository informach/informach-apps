import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { LessonClip } from "../../../shared/lessonClips";
import { type LessonScript, lessonScript, pickedScript } from "../../../shared/lessonScript";
import {
  type BundledFamily,
  DEFAULT_FONTS,
  duplicateRecipe,
  emptyRecipeStore,
  type FontPair,
  fromLesson,
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
} from "../../../shared/pipelines";
import { paletteFromImage } from "./imagePalette";
import {
  failureText,
  type PipelineBridge,
  type PipelineEditor,
  runPipeline,
  type StepState,
  stepsFor,
} from "./runner";
import "./pipelines.css";

/** The desktop bridge as the panel uses it (preload). */
export interface PipelinesDesktop extends PipelineBridge {
  pipelinesRead(): Promise<RecipeStore>;
  pipelinesWrite(store: RecipeStore): Promise<RecipeStore>;
  pipelinePick(kind: PickedFile["kind"]): Promise<PickedFile | null>;
  /** The lesson of a picked package: its id and script (lessonPackage.ts packageLesson). */
  pipelineLessonScript(token: string): Promise<{
    id: string | null;
    script: { text: string; section: number } | null;
  }>;
}

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

/** The biggest picture the palette reads colours from. */
const IMAGE_BYTES = 50 * 1024 * 1024;

function Palette({
  colors,
  onChange,
  label,
  report,
}: {
  colors: string[];
  onChange(colors: string[]): void;
  label: string;
  report(message: string): void;
}) {
  const picture = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const fromImage = async (file: File) => {
    if (file.size > IMAGE_BYTES) {
      report("A imagem passa de 50 MB.");
      return;
    }
    setReading(true);
    try {
      onChange(await paletteFromImage(file));
    } catch (error) {
      report(failureText(error));
    } finally {
      setReading(false);
    }
  };
  return (
    <fieldset className="pipeline-palette">
      <legend>{label}</legend>
      <div className="pipeline-swatches">
        {colors.map((color, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a colour may repeat; the slot is its identity
          <span key={index} className="pipeline-swatch">
            <input
              type="color"
              value={color}
              aria-label={`Cor ${index + 1} da paleta`}
              onChange={(event) =>
                onChange(colors.map((c, i) => (i === index ? event.target.value : c)))
              }
            />
            <code>{color}</code>
            {colors.length > 1 && (
              <button
                type="button"
                aria-label={`Tirar a cor ${index + 1}`}
                onClick={() => onChange(colors.filter((_, i) => i !== index))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {colors.length < 12 && (
          <button type="button" onClick={() => onChange([...colors, "#ffffff"])}>
            + Cor
          </button>
        )}
        <button
          type="button"
          disabled={reading}
          title="Troca a paleta pelas cores principais de uma imagem: a mais clara primeiro, a mais escura em seguida e a mais viva por último."
          onClick={() => picture.current?.click()}
        >
          {reading ? "Lendo a imagem…" : "Cores de uma imagem…"}
        </button>
        <input
          ref={picture}
          type="file"
          hidden
          aria-label={`Imagem para a ${label.toLowerCase()}`}
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // The same picture can be chosen again after editing the colours.
            event.target.value = "";
            if (file) void fromImage(file);
          }}
        />
      </div>
    </fieldset>
  );
}

/** The families of a select: the bundle's, by group, and the chosen one even if it is not there. */
function FamilyOptions({ families, current }: { families: BundledFamily[]; current: string }) {
  const groups = [...new Set(families.map((f) => f.group))];
  return (
    <>
      {!families.some((f) => f.family === current) && <option value={current}>{current}</option>}
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {families
            .filter((f) => f.group === group)
            .map((f) => (
              <option key={f.family} value={f.family}>
                {f.family}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

/** The fonts of titles and body text, from the fonts that come with EdiSVG (EdiAula's). */
function Fonts({
  fonts,
  families,
  onChange,
  label,
  disabled = false,
}: {
  fonts: FontPair;
  families: BundledFamily[];
  onChange(fonts: FontPair): void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="pipeline-palette pipeline-fonts">
      <legend>{label}</legend>
      <label htmlFor={`${id}-title`}>
        Título
        <select
          id={`${id}-title`}
          value={fonts.title}
          disabled={disabled}
          onChange={(event) => onChange({ ...fonts, title: event.target.value })}
        >
          <FamilyOptions families={families} current={fonts.title} />
        </select>
      </label>
      <label htmlFor={`${id}-body`}>
        Corpo
        <select
          id={`${id}-body`}
          value={fonts.body}
          disabled={disabled}
          onChange={(event) => onChange({ ...fonts, body: event.target.value })}
        >
          <FamilyOptions families={families} current={fonts.body} />
        </select>
      </label>
    </fieldset>
  );
}

function RecipeEditor({
  recipe,
  isNew,
  families,
  report,
  onSave,
  onCancel,
}: {
  recipe: Recipe;
  isNew: boolean;
  families: BundledFamily[];
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
        <Palette
          label="Paleta de texto padrão"
          colors={draft.textPalette}
          report={report}
          onChange={(textPalette) => setDraft({ ...draft, textPalette })}
        />
        <Fonts
          label="Fontes padrão"
          fonts={draft.fonts}
          families={families}
          onChange={(fonts) => setDraft({ ...draft, fonts })}
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
  families,
  desktop,
  editor,
  report,
  onBack,
  setBusy,
  handed,
}: {
  recipe: Recipe;
  families: BundledFamily[];
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
  const [palette, setPalette] = useState(recipe.textPalette);
  const [fonts, setFonts] = useState(recipe.fonts);
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
  const steps = stepsFor(recipe.kind);
  const inputs = {
    recipeId: recipe.id,
    files,
    script,
    textPalette: palette,
    fonts,
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
  const start = async () => {
    const parsed = runInputsSchema.safeParse(inputs);
    if (!parsed.success || missing.length) return;
    // A reply the assistant is writing would land on the file in the middle of the run.
    if (editor.assistantBusy()) {
      report("Espere o assistente terminar a resposta, ou interrompa, antes de rodar o pipeline.");
      return;
    }
    const abort = new AbortController();
    control.current = abort;
    setRunning(true);
    setBusy(true);
    setOutcome(null);
    editor.beginRun();
    try {
      const result = await runPipeline(
        recipe,
        parsed.data,
        steps,
        { editor, bridge: desktop, signal: abort.signal },
        (stepId, state) => {
          if (live.current) setStates((current) => ({ ...current, [stepId]: state }));
        },
      );
      if (live.current) setOutcome({ ok: result.ok, report: result.report });
    } finally {
      // Whatever the run did (also when it stopped) is undone by one Ctrl+Z.
      editor.endRun();
      if (live.current) setRunning(false);
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
                        : "Escolher…"}
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
        <Palette
          label="Paleta de texto desta vez"
          colors={palette}
          report={report}
          onChange={setPalette}
        />
        <Fonts
          label="Fontes desta vez"
          fonts={fonts}
          families={families}
          disabled={running}
          onChange={setFonts}
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
          <button
            type="button"
            className="primary"
            disabled={missing.length > 0}
            onClick={() => void start()}
          >
            Rodar pipeline
          </button>
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
  /** The fonts that come with EdiSVG (EdiAula's), for titles and body text. */
  const [families, setFamilies] = useState<BundledFamily[]>([]);
  useEffect(() => {
    let live = true;
    desktop
      .pipelineFonts()
      .then((value) => {
        if (live) setFamilies(value);
      })
      .catch((error: unknown) => report(failureText(error)));
    return () => {
      live = false;
    };
  }, [desktop, report]);
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
      {!store ? (
        <div className="help-content">
          <p>Carregando as receitas…</p>
        </div>
      ) : view.name === "edit" ? (
        <RecipeEditor
          recipe={view.recipe}
          isNew={view.isNew}
          families={families}
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
          families={families}
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
