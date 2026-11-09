import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  duplicateRecipe,
  emptyRecipeStore,
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
import {
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
}

interface Props {
  desktop: PipelinesDesktop;
  editor: PipelineEditor;
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

function Palette({
  colors,
  onChange,
  label,
}: {
  colors: string[];
  onChange(colors: string[]): void;
  label: string;
}) {
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
      </div>
    </fieldset>
  );
}

function RecipeEditor({
  recipe,
  isNew,
  onSave,
  onCancel,
}: {
  recipe: Recipe;
  isNew: boolean;
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
          onChange={(textPalette) => setDraft({ ...draft, textPalette })}
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
  `${file.name}${file.kind === "lesson" ? " (aula do EdiAula)" : ""}`;

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
}: {
  recipe: Recipe;
  desktop: PipelinesDesktop;
  editor: PipelineEditor;
  report(message: string): void;
  onBack(): void;
  setBusy(busy: boolean): void;
}) {
  const id = useId();
  const [files, setFiles] = useState<RunInputs["files"]>({});
  const [script, setScript] = useState("");
  const [palette, setPalette] = useState(recipe.textPalette);
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
  const inputs = { recipeId: recipe.id, files, script, textPalette: palette };
  const missing = missingInputs(recipe, inputs);
  const pick = async (key: keyof RunInputs["files"], kind: PickedFile["kind"]) => {
    try {
      const file = await desktop.pipelinePick(kind);
      if (file && live.current) setFiles((current) => ({ ...current, [key]: file }));
    } catch (error) {
      report(error instanceof Error ? error.message : "Não foi possível escolher o arquivo.");
    }
  };
  const start = async () => {
    const parsed = runInputsSchema.safeParse(inputs);
    if (!parsed.success || missing.length) return;
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
        <label className="scene-field" htmlFor={`${id}-script`}>
          Roteiro do trecho (só a parte desta cena)
          <textarea
            id={`${id}-script`}
            rows={8}
            maxLength={20000}
            disabled={running}
            value={script}
            placeholder="Cole aqui o que é narrado nesta cena."
            onChange={(event) => setScript(event.target.value)}
          />
        </label>
        <Palette label="Paleta de texto desta vez" colors={palette} onChange={setPalette} />
        {steps.length > 0 && (
          <ol className="pipeline-steps" aria-label="Etapas">
            {steps.map((step) => {
              const state = states[step.id] ?? { status: "waiting" };
              return (
                <li key={step.id} className={`is-${state.status}`}>
                  <span>{step.label}</span>
                  <span className="pipeline-step-state">
                    {state.status === "running"
                      ? `${state.detail ?? STEP_TEXT.running} · ${Math.round(state.ratio * 100)}%`
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

function PipelinesPanel({ desktop, editor, report, close, setBusy }: Props) {
  const [running, setRunning] = useState(false);
  const busy = (value: boolean) => {
    setRunning(value);
    setBusy(value);
  };
  const [store, setStore] = useState<RecipeStore | null>(null);
  const [view, setView] = useState<View>({ name: "list" });
  useEffect(() => {
    let live = true;
    desktop
      .pipelinesRead()
      .then((value) => live && setStore(value))
      .catch((error: unknown) => {
        report(error instanceof Error ? error.message : "Não foi possível ler as receitas.");
        if (live) setStore(emptyRecipeStore());
      });
    return () => {
      live = false;
    };
  }, [desktop, report]);
  const persist = async (next: RecipeStore) => {
    try {
      setStore(await desktop.pipelinesWrite(next));
    } catch (error) {
      report(error instanceof Error ? error.message : "Não foi possível salvar as receitas.");
    }
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
          onCancel={() => setView({ name: "list" })}
          onSave={(recipe) => {
            void persist(saveRecipe(store, recipe));
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
        />
      ) : (
        <>
          <div className="help-content pipeline-body">
            <p>
              Uma receita guarda o que se repete: o tipo de trabalho, as instruções para o
              assistente e a paleta de texto. Ao rodar, você escolhe só os arquivos e o roteiro
              desta vez.
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
                      onClick={() => void persist(duplicateRecipe(store, recipe.id, newRecipeId()))}
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${recipe.name}`}
                      onClick={() => void persist(removeRecipe(store, recipe.id))}
                    >
                      Excluir
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
                    onClick={() => void persist(restoreRecipe(store, id))}
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
  dialog.addEventListener("cancel", cancelEvent);
  flushSync(() =>
    root.render(
      <PipelinesPanel
        {...props}
        close={close}
        setBusy={(value) => {
          busy = value;
        }}
      />,
    ),
  );
  dialog.showModal();
  return dispose;
}
