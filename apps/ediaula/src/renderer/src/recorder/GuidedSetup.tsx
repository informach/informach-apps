import {
  type BrokenStep,
  DEFAULT_TEMPOS,
  type GuidedPlanV2,
  type GuidedReplace,
  type GuidedStepTarget,
  type GuidedStepV2,
  type GuidedStore,
  MAX_PLANS,
  newPlan,
  planTiming,
  schedulePlan,
  VIEWPORTS,
} from "@shared/guidedPlan";
import { type GuidedStep, stepsFromScript, stepsFromWords } from "@shared/guidedRecording";
import type { Transcript } from "@shared/types";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { PreviewMedia } from "@/ui/PreviewMedia";
import { GuidedStepRow, type MarkField } from "./GuidedStepRow";
import "./guided.css";

/**
 * The guided recording's plans (shared/guidedPlan.ts): which plan, where it runs, its steps and
 * their targets, the narration and the tempos. Every change goes to the recorder window, which
 * saves it a second later in the project (and as a draft against a crash).
 */

/** Why this plan cannot be recorded from step `from` now, or null. */
export function guidedProblem(
  plan: GuidedPlanV2 | undefined,
  from: number,
  replace?: GuidedReplace,
): string | null {
  if (!plan) return "Crie um plano.";
  try {
    schedulePlan(plan, from);
  } catch (error) {
    return (error as Error).message;
  }
  if (replace && replace.planId === plan.id && planTiming(plan) !== replace.timing)
    return `Os tempos deste plano mudaram desde a gravação de “${replace.assetName}”. Volte aos tempos de antes para substituir, ou grave um take novo.`;
  return null;
}

/** Where a plan stopped last time, when it did not finish. */
export function resumeStep(store: GuidedStore, planId: string): number | null {
  const last = store.runs?.filter((r) => r.planId === planId).at(-1);
  return last && last.status !== "done" && last.step > 0 ? last.step : null;
}

const newPlanId = (): string => `plano-${crypto.randomUUID().slice(0, 8)}`;

/** Steps proposed from the script or the narration: timing and speech, no target yet. */
/** Proposed times to the hundredth of a second, as the teacher reads and types them. */
const hundredth = (t: number): number => Math.round(t * 100) / 100;
const proposed = (steps: GuidedStep[]): GuidedStepV2[] =>
  steps.map(({ id, speech, at, speechAt, action }) => ({
    id,
    speech,
    at: hundredth(at),
    ...(speechAt !== undefined ? { speechAt: hundredth(speechAt) } : {}),
    action,
  }));

export function GuidedSetup({
  store,
  planId,
  onStore,
  onPlanId,
  script,
  busy,
  onBusy,
  keys,
  replace,
  problem,
  onStart,
}: {
  store: GuidedStore;
  planId: string;
  onStore: (store: GuidedStore) => void;
  onPlanId: (id: string) => void;
  script: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  /** The recorder's shortcuts as configured: target, start and pause, stop. */
  keys: { target: string; toggle: string; stop: string };
  replace?: GuidedReplace;
  /** Why the plans cannot be saved as they are (a value to fix), or null. */
  problem?: string | null;
  /** Records the plan from a step (the recorder's Gravar starts it from the first). */
  onStart: (from: number) => void;
}) {
  const plan = store.plans.find((p) => p.id === planId);
  const [text, setText] = useState(script);
  /** Screen plans: the field waiting for the target key over the real pointer. */
  const [picking, setPicking] = useState<{ id: string; field: MarkField } | null>(null);
  /** Lesson window plans: the field being marked there. */
  const [marking, setMarking] = useState<{ id: string; field: MarkField } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verify, setVerify] = useState<{
    running: boolean;
    step: number;
    broken: BrokenStep[] | null;
  } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [notice, setNotice] = useState("");
  /** The plans as last handed to the recorder: edits that follow each other build on it. */
  const storeRef = useRef(store);
  storeRef.current = store;
  const audioCues = useMemo(
    () =>
      (plan?.steps ?? []).map((step, index, steps) => ({
        start: step.speechAt ?? step.at,
        end: steps[index + 1]?.speechAt ?? steps[index + 1]?.at ?? plan?.audio?.duration ?? 0,
        text: step.speech,
      })),
    [plan?.steps, plan?.audio?.duration],
  );
  useEffect(() => {
    setText((value) => value || script);
  }, [script]);
  const notifyBusy = useEffectEvent(onBusy);
  const verifying = !!verify?.running;
  useEffect(() => {
    notifyBusy(loading || !!picking || !!marking || verifying);
    return () => notifyBusy(false);
  }, [loading, picking, marking, verifying]);

  /** Changes one plan as it is now (after an await too), in one save. */
  const editPlan = (id: string, edit: (plan: GuidedPlanV2) => GuidedPlanV2): void => {
    const now = Date.now();
    const current = storeRef.current;
    const next: GuidedStore = {
      ...current,
      plans: current.plans.map((p) => (p.id === id ? { ...edit(p), updatedAt: now } : p)),
      updatedAt: now,
    };
    storeRef.current = next;
    onStore(next);
  };
  const savePlan = (next: GuidedPlanV2): void => editPlan(next.id, () => next);
  const change = (patch: Partial<GuidedPlanV2>): void => {
    if (plan) editPlan(plan.id, (p) => ({ ...p, ...patch }));
  };
  const withStep = (p: GuidedPlanV2, id: string, patch: Partial<GuidedStepV2>): GuidedPlanV2 => ({
    ...p,
    steps: p.steps.map((s) => {
      if (s.id !== id) return s;
      const next: GuidedStepV2 = { ...s, ...patch };
      for (const key of Object.keys(patch) as (keyof GuidedStepV2)[])
        if (patch[key] === undefined) delete next[key];
      return next;
    }),
  });
  const updateStep = (id: string, patch: Partial<GuidedStepV2>): void => {
    if (!plan) return;
    // Old answers do not describe the changed step.
    if (verify?.broken) setVerify(null);
    editPlan(plan.id, (p) => withStep(p, id, patch));
  };

  // Screen plans: the target key samples the real pointer (for programs outside the lesson).
  const picked = useEffectEvent(
    (pick: { id: string; field: MarkField }, target: GuidedStepTarget) => {
      const screen = target.screen;
      if (!screen) return;
      if (pick.field === "to")
        updateStep(pick.id, { to: { point: { x: screen.x, y: screen.y, space: "screen" } } });
      else updateStep(pick.id, { target });
    },
  );
  useEffect(() => {
    if (!picking) return;
    void window.api.recorder.interactive(false);
    return window.api.recorder.onHotkey((name) => {
      if (name !== "guided-target") return;
      void window.api.recorder
        .guidedPick()
        .then((screen) => picked(picking, { screen }))
        .catch((e) => setError((e as Error).message))
        .finally(() => setPicking(null));
    });
  }, [picking]);

  // Verification reports its progress like a take.
  useEffect(() => {
    if (!verifying) return;
    return window.api.recorder.onGuidedStatus((s) =>
      setVerify((v) => (v?.running ? { ...v, step: s.step } : v)),
    );
  }, [verifying]);

  if (!plan)
    return (
      <section className="guided-setup">
        <h3>Gravação guiada</h3>
        <p>Um plano guarda as etapas, os alvos e os tempos de uma demonstração.</p>
        <button
          type="button"
          onClick={() => {
            const created = newPlan(newPlanId(), "Plano 1");
            onStore({ ...store, plans: [...store.plans, created], updatedAt: Date.now() });
            onPlanId(created.id);
          }}
        >
          Criar um plano
        </button>
      </section>
    );

  const web = plan.mode === "web";
  async function mark(step: GuidedStepV2, field: MarkField): Promise<void> {
    setError("");
    if (!web) {
      setPicking({ id: step.id, field });
      return;
    }
    if (!plan) return;
    const id = plan.id;
    setMarking({ id: step.id, field });
    setNotice("");
    try {
      const marked = await window.api.recorder.guidedMark(
        field === "to" ? "destination" : field === "target" ? "target" : "condition",
        plan.viewport,
      );
      if (!marked) return;
      const locator = marked.locator;
      let patch: Partial<GuidedStepV2>;
      if (field === "to")
        patch = {
          to: marked.workspace
            ? { point: { ...marked.workspace, space: "workspace" } }
            : { target: { locator } },
        };
      else if (!locator) return;
      else if (field === "target") patch = { target: { locator } };
      else patch = { [field]: { locator, state: step[field]?.state ?? "visible" } };
      if (verify?.broken) setVerify(null);
      // One save: the target and, for the first page marked, where the take starts.
      editPlan(id, (p) => ({
        ...withStep(p, step.id, patch),
        ...(p.url ? {} : { url: marked.url }),
      }));
      if (marked.notice) setNotice(marked.notice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMarking(null);
    }
  }

  async function audio(): Promise<void> {
    if (!plan) return;
    setLoading(true);
    setError("");
    try {
      const path = await window.api.recorder.pickNarration();
      if (!path) return;
      const info = await window.api.probe(path);
      if (!info.hasAudio) throw new Error("Selecione um arquivo com narração.");
      change({ audio: { path, duration: info.duration } });
      const transcript = await window.api.transcribe(
        `guided-${Date.now()}`,
        path,
        info.duration,
        "pt",
        [],
      );
      const response = await fetch(mediaUrl(transcript));
      if (!response.ok) throw new Error("Não foi possível ler a transcrição.");
      const data: Transcript = await response.json();
      // Words the hallucination filter set aside are not narration.
      const steps = proposed(stepsFromWords(data.words.filter((w) => !w.dropped)));
      savePlan({ ...plan, audio: { path, duration: info.duration }, steps });
      if (!steps.length)
        setError(
          "Áudio carregado. Não encontrei comandos “clique”; adicione etapas e seus tempos manualmente.",
        );
    } catch (e) {
      setError(
        `${(e as Error).message} Você também pode definir os tempos das etapas manualmente.`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function check(): Promise<void> {
    if (!plan) return;
    setError("");
    setVerify({ running: true, step: 0, broken: null });
    try {
      const broken = await window.api.recorder.guidedVerify(plan);
      setVerify({ running: false, step: plan.steps.length, broken });
    } catch (e) {
      setVerify(null);
      setError((e as Error).message);
    }
  }

  const resume = resumeStep(store, plan.id);
  const replacing = replace?.planId === plan.id ? replace : undefined;
  const validation = guidedProblem(plan, replacing?.from ?? 0, replacing);
  const brokenOf = new Map((verify?.broken ?? []).map((b) => [b.index, b]));

  if (picking)
    return (
      <section className="guided-setup is-picking">
        <div className="guided-pick">
          Posicione o mouse no {picking.field === "to" ? "destino" : "alvo"} e pressione{" "}
          <b>{keys.target}</b>. Não precisa clicar.{" "}
          <button
            type="button"
            onMouseEnter={() => void window.api.recorder.interactive(true)}
            onClick={() => {
              setPicking(null);
              void window.api.recorder.interactive(true);
            }}
          >
            Cancelar
          </button>
        </div>
      </section>
    );

  return (
    <section className="guided-setup">
      <h3>Gravação guiada · ritmo didático · 9 a 14 anos</h3>
      {replacing && (
        <p className="guided-replace">
          Regravando “{replacing.assetName}”. O take novo entra no lugar dele, nos mesmos clipes, e
          precisa ter os mesmos tempos.
        </p>
      )}
      <fieldset disabled={busy || loading || !!marking || verifying}>
        <div className="guided-actions">
          <label>
            Plano{" "}
            <select
              aria-label="Plano guiado"
              value={plan.id}
              onChange={(e) => {
                setVerify(null);
                onPlanId(e.target.value);
              }}
            >
              {store.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "Sem nome"}
                </option>
              ))}
            </select>
          </label>
          {renaming ? (
            <input
              aria-label="Nome do plano"
              value={plan.name}
              maxLength={200}
              onChange={(e) => change({ name: e.target.value })}
              onBlur={() => setRenaming(false)}
            />
          ) : (
            <button type="button" onClick={() => setRenaming(true)}>
              Renomear
            </button>
          )}
          <button
            type="button"
            title={
              store.plans.length >= MAX_PLANS
                ? `Um projeto guarda até ${MAX_PLANS} planos. Exclua um que não use mais.`
                : undefined
            }
            onClick={() => {
              if (store.plans.length >= MAX_PLANS) {
                setError(`Um projeto guarda até ${MAX_PLANS} planos. Exclua um que não use mais.`);
                return;
              }
              const created = newPlan(newPlanId(), `Plano ${store.plans.length + 1}`, plan.mode);
              onStore({ ...store, plans: [...store.plans, created], updatedAt: Date.now() });
              onPlanId(created.id);
            }}
          >
            Novo plano
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  `Excluir o plano “${plan.name}”? As gravações já feitas continuam no projeto.`,
                )
              )
                return;
              const plans = store.plans.filter((p) => p.id !== plan.id);
              onStore({ ...store, plans, updatedAt: Date.now() });
              onPlanId(plans[0]?.id ?? "");
            }}
          >
            Excluir plano
          </button>
          <label>
            Onde acontece{" "}
            <select
              aria-label="Onde a demonstração acontece"
              value={plan.mode}
              onChange={(e) => {
                const mode = e.target.value === "screen" ? "screen" : "web";
                const marked = plan.steps.filter(
                  (s) => s.target || s.to || s.until || s.expect,
                ).length;
                if (
                  marked &&
                  !window.confirm(
                    `Trocar onde a demonstração acontece apaga os alvos e as esperas marcados em ${marked === 1 ? "1 etapa" : `${marked} etapas`}: eles valem só para o lugar em que foram marcados. Trocar mesmo assim?`,
                  )
                )
                  return;
                // Targets of one kind mean nothing to the other.
                savePlan({
                  ...plan,
                  mode,
                  steps: plan.steps.map(({ target: _t, to: _to, until: _u, expect: _e, ...s }) =>
                    s.action === "wait" && mode === "screen" ? { ...s, action: "point" } : s,
                  ),
                });
              }}
            >
              <option value="web">Na janela da aula (recomendado)</option>
              <option value="screen">Na tela, em outros programas</option>
            </select>
          </label>
        </div>
        {web ? (
          <>
            <p>
              Na janela da aula, o EdiAula clica, arrasta e digita dentro da própria página, sem
              mexer no seu mouse, e grava a página num tamanho fixo. O cursor é desenhado depois, no
              editor. Se a página demorar, o vídeo espera junto e a narração continua alinhada.
            </p>
            <div className="guided-actions">
              <input
                aria-label="Endereço da aula"
                type="url"
                placeholder="https://sua-plataforma/aula"
                value={plan.url ?? ""}
                onChange={(e) => change({ url: e.target.value || undefined })}
              />
              <button
                type="button"
                onClick={() => {
                  setError("");
                  void window.api.recorder
                    .guidedBrowser(plan.url ?? "")
                    .catch((e) => setError((e as Error).message));
                }}
              >
                Abrir janela da aula
              </button>
              <label>
                Tamanho{" "}
                <select
                  aria-label="Tamanho da captura"
                  value={`${plan.viewport.width}x${plan.viewport.height}`}
                  onChange={(e) => {
                    const [width, height] = e.target.value.split("x").map(Number);
                    change({ viewport: { width, height } });
                  }}
                >
                  {VIEWPORTS.map((v) => (
                    <option key={v.width} value={`${v.width}x${v.height}`}>
                      {v.width} × {v.height}
                    </option>
                  ))}
                </select>
              </label>
              <label title="A 60 quadros, páginas com muita animação podem fazer o vídeo esperar pelo codificador. O padrão é 30.">
                Quadros por segundo{" "}
                <select
                  aria-label="Quadros por segundo"
                  value={plan.fps ?? 30}
                  onChange={(e) => change({ fps: e.target.value === "60" ? 60 : 30 })}
                >
                  <option value="30">30</option>
                  <option value="60">60</option>
                </select>
              </label>
            </div>
            {plan.fps === 60 && (
              <p className="guided-warning">
                A 60 quadros a captura usa o dobro de processador e até 1,7 GB de memória, e numa
                página com animação o vídeo pode esperar pelo codificador. Prefira 30, a não ser que
                a aula precise de movimento muito fluido.
              </p>
            )}
            <p>
              Abra a aula e entre na plataforma. Para marcar um alvo, vá até ele na janela da aula,
              pressione {keys.target} e clique no elemento; {keys.target} de novo cancela. O login
              fica só no perfil dessa janela.
            </p>
          </>
        ) : (
          <p>
            Na tela, o EdiAula move o mouse do Windows, para programas fora da janela da aula.
            Mantenha as janelas no mesmo lugar. {keys.toggle} pausa; {keys.stop} interrompe e salva.
          </p>
        )}
        <textarea
          aria-label="Roteiro da demonstração"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cole o roteiro, uma etapa por linha"
          rows={3}
        />
        <div className="guided-actions">
          <button
            type="button"
            onClick={() =>
              savePlan({ ...plan, steps: proposed(stepsFromScript(text)), audio: undefined })
            }
          >
            Criar etapas do roteiro
          </button>
          <button type="button" onClick={() => void audio()}>
            Importar narração (áudio ou vídeo)
          </button>
        </div>
        <p>
          Escolha o áudio da narração ou o vídeo do apresentador com a voz. Do vídeo, a voz é
          separada automaticamente e usada para ouvir, transcrever e sincronizar as ações; o arquivo
          original fica como está. Roteiro: tempos estimados para narrar depois. Áudio: tempos de
          “clique” sugeridos pela transcrição; revise-os antes de gravar.
        </p>
        {plan.audio && (
          <div>
            Áudio: {plan.audio.path.split(/[\\/]/).pop()}{" "}
            <button type="button" onClick={() => change({ audio: undefined })}>
              Remover áudio
            </button>
            <PreviewMedia
              kind="audio"
              controls
              src={mediaUrl(plan.audio.path)}
              cues={audioCues}
              label="Prévia da narração guiada"
            />
            <p>
              {web
                ? "A narração entra numa faixa própria, alinhada ao vídeo da aula."
                : "Use fones. A narração entra numa faixa própria e o microfone fica desligado neste modo. O áudio do PC é opcional e não grava a narração de novo."}
            </p>
          </div>
        )}
        <div className="guided-timing">
          {(
            [
              ["move", "Movimento", 0.5, 5],
              ["anticipation", "Antes da fala", 0.3, 5],
              ["dwell", "Antes do clique", 0.3, 5],
              ["after", "Após a ação", 0.5, 15],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label} (s)
              <input
                type="number"
                min={min}
                max={max}
                step="0.1"
                value={plan.tempos[key] ?? DEFAULT_TEMPOS[key]}
                onChange={(e) =>
                  change({ tempos: { ...plan.tempos, [key]: Number(e.target.value) } })
                }
              />
            </label>
          ))}
        </div>
        <p>
          Informe o início da frase e o instante da ação no áudio. O cursor chega antes dos dois.
          Etapas sem espaço para movimento e pausas precisam ser espaçadas.
        </p>
        <div className="guided-steps">
          {plan.steps.map((s, i) => (
            <GuidedStepRow
              key={s.id}
              step={s}
              index={i}
              plan={plan}
              keys={keys}
              marking={marking?.id === s.id ? marking.field : null}
              broken={brokenOf.get(i)}
              update={(patch) => updateStep(s.id, patch)}
              remove={() => savePlan({ ...plan, steps: plan.steps.filter((x) => x.id !== s.id) })}
              mark={(field) => void mark(s, field)}
            />
          ))}
        </div>
        <div className="guided-actions">
          <button
            type="button"
            onClick={() =>
              savePlan({
                ...plan,
                steps: [
                  ...plan.steps,
                  {
                    id: crypto.randomUUID(),
                    speech: "",
                    at: (plan.steps.at(-1)?.at ?? -5) + 5,
                    action: "click",
                  },
                ],
              })
            }
          >
            Adicionar etapa
          </button>
          {web && (
            <button type="button" onClick={() => void check()} disabled={!plan.steps.length}>
              Verificar plano
            </button>
          )}
          {web && resume !== null && resume < plan.steps.length && !replacing && (
            <button
              type="button"
              title={`As etapas antes da ${resume + 1} são refeitas sem gravar; o take novo começa na etapa ${resume + 1}.`}
              onClick={() => onStart(resume)}
              disabled={!!guidedProblem(plan, resume)}
            >
              Continuar da etapa {resume + 1}
            </button>
          )}
        </div>
      </fieldset>
      {verify?.running && (
        <p role="status">
          Verificando a etapa {Math.min(verify.step + 1, plan.steps.length)} de {plan.steps.length},
          sem gravar…{" "}
          <button type="button" onClick={() => void window.api.recorder.guidedVerifyCancel()}>
            Parar
          </button>
        </p>
      )}
      {verify?.broken && (
        <p role="status">
          {verify.broken.length
            ? `${verify.broken.length === 1 ? "1 etapa com problema" : `${verify.broken.length} etapas com problema`}. Marque de novo só essas e verifique outra vez.`
            : "Todas as etapas funcionaram na página."}
        </p>
      )}
      {marking && (
        <p role="status">Marque na janela da aula: vá até o elemento e pressione {keys.target}.</p>
      )}
      {loading && <p role="status">Preparando o áudio e transcrevendo a narração…</p>}
      {notice && <p role="status">{notice}</p>}
      {problem && <p role="alert">{problem}</p>}
      {error && <p role="alert">{error}</p>}
      <p className="guided-validation">
        {validation ||
          "Pronto. O cursor chega antes da fala, aguarda e executa a ação no tempo indicado."}
      </p>
      <small>
        {web
          ? "Cada alvo é reencontrado na página a cada etapa: identificação de teste, atributos, papel e nome, rótulo, texto, blocos de programação (como os do Blockly) e, por último, a posição no HTML. Se a plataforma mudar, use Verificar plano e marque de novo só o que quebrou."
          : "Na janela de aula, botões são localizados novamente antes da ação. Jogos em canvas e quadros incorporados usam pontos relativos; em outros programas, posições fixas."}
      </small>
    </section>
  );
}
