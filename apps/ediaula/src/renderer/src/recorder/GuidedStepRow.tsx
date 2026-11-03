import {
  ACTION_LABELS,
  type BrokenStep,
  COMMON_KEYS,
  DEFAULT_HOLD,
  DEFAULT_STEP_TIMEOUT,
  GUIDED_ACTIONS,
  type GuidedAction,
  type GuidedCondition,
  type GuidedPlanV2,
  type GuidedStepTarget,
  type GuidedStepV2,
  MAX_HOLD,
  MAX_STEP_TIMEOUT,
  WAIT_POLICIES,
  WAIT_POLICY_LABELS,
  type WaitPolicy,
} from "@shared/guidedPlan";
import { locatorLabel, TARGET_STATES, type TargetState } from "@shared/locators";
import type { ReactNode } from "react";

/** What a step's button marks: its target, where a drag ends, what to wait for or to check. */
export type MarkField = "target" | "to" | "until" | "expect";

const STATE_LABELS: Record<TargetState, string> = {
  visible: "aparecer",
  hidden: "sumir",
  enabled: "ficar disponível",
};

/** How a marked target reads on its button. */
export function targetText(
  target: GuidedStepTarget | undefined,
  mode: GuidedPlanV2["mode"],
): string {
  if (mode === "web") {
    const locator = target?.locator;
    if (!locator) return "";
    const first = locator.strategies[0];
    return `${first?.by === "blockly" ? "Bloco" : "Elemento"}: ${locatorLabel(locator)}`;
  }
  const screen = target?.screen;
  if (!screen) return "";
  return screen.browser
    ? screen.browser.kind === "element"
      ? `Elemento: ${screen.browser.label || "marcado"}`
      : "Jogo ou quadro: ponto relativo"
    : `Posição: ${screen.x}, ${screen.y}`;
}

function destinationText(step: GuidedStepV2, mode: GuidedPlanV2["mode"]): string {
  const point = step.to?.point;
  if (point)
    return point.space === "workspace"
      ? `Ponto da área de blocos: ${Math.round(point.x)}, ${Math.round(point.y)}`
      : `Posição: ${Math.round(point.x)}, ${Math.round(point.y)}`;
  const locator = step.to?.target?.locator;
  if (mode === "web" && locator) {
    const first = locator.strategies[0];
    return first?.by === "blockly" && first.below
      ? `Abaixo do bloco: ${locatorLabel(locator)}`
      : targetText(step.to?.target, mode);
  }
  return targetText(step.to?.target, mode);
}

const conditionText = (condition: GuidedCondition | undefined): string =>
  condition ? `“${locatorLabel(condition.locator)}”` : "";

/** Actions each mode can do: waiting for an element and the platform's own need the lesson window. */
export const actionsFor = (mode: GuidedPlanV2["mode"]): readonly GuidedAction[] =>
  mode === "web" ? GUIDED_ACTIONS : GUIDED_ACTIONS.filter((a) => a !== "wait" && a !== "platform");

export function GuidedStepRow({
  step,
  index,
  plan,
  keys,
  marking,
  broken,
  notices,
  update,
  remove,
  mark,
}: {
  step: GuidedStepV2;
  index: number;
  plan: GuidedPlanV2;
  keys: { target: string };
  /** The field being marked now, if it is one of this step's. */
  marking: MarkField | null;
  broken?: BrokenStep;
  /** What "Verificar plano" found the take will do there (a stretch sped up). */
  notices?: readonly string[];
  update: (patch: Partial<GuidedStepV2>) => void;
  remove: () => void;
  mark: (field: MarkField) => void;
}): ReactNode {
  const web = plan.mode === "web";
  const n = index + 1;
  const markButton = (field: MarkField, label: string, done: string, hint?: string): ReactNode => (
    <button
      type="button"
      className={done ? "is-marked" : ""}
      title={hint}
      disabled={marking !== null}
      onClick={() => mark(field)}
    >
      {marking === field ? `Marcando… (${keys.target})` : done || `${label} (${keys.target})`}
    </button>
  );
  const condition = (field: "until" | "expect", value: GuidedCondition | undefined): ReactNode => (
    <>
      <select
        aria-label={field === "until" ? `Esperar na etapa ${n}` : `Conferir depois da etapa ${n}`}
        value={value?.state ?? ""}
        onChange={(e) => {
          const state = e.target.value as TargetState | "";
          if (!state) update({ [field]: undefined });
          else if (value) update({ [field]: { ...value, state } });
          else mark(field);
        }}
      >
        {field === "expect" && <option value="">Sem conferência</option>}
        {field === "until" && !value && <option value="">Marque o elemento</option>}
        {TARGET_STATES.map((state) => (
          <option key={state} value={state}>
            até {STATE_LABELS[state]}
          </option>
        ))}
      </select>
      {(value || field === "until") && markButton(field, "Marcar o elemento", conditionText(value))}
    </>
  );
  const needsTarget =
    !["wait", "scroll", "key", "platform"].includes(step.action) || (step.action === "key" && !web);
  return (
    <div className={`guided-step ${broken ? "is-broken" : ""}`}>
      <span>{n}.</span>
      <input
        aria-label={`Fala da etapa ${n}`}
        value={step.speech}
        placeholder="Fala ou descrição"
        onChange={(e) => update({ speech: e.target.value })}
      />
      <label>
        Ação em (s)
        <input
          type="number"
          min="0"
          step="0.1"
          value={step.at}
          onChange={(e) => update({ at: Number(e.target.value) })}
        />
      </label>
      <label>
        Fala começa em (s)
        <input
          type="number"
          min="0"
          max={step.at}
          step="0.1"
          value={step.speechAt ?? step.at}
          onChange={(e) =>
            update({ speechAt: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
      </label>
      <select
        aria-label={`Ação da etapa ${n}`}
        value={step.action}
        onChange={(e) => {
          const action = e.target.value as GuidedAction;
          update({
            action,
            value: action === "type" ? (step.value ?? "") : undefined,
            chord:
              action === "key"
                ? (step.chord ?? "Enter")
                : action === "hold"
                  ? step.chord
                  : undefined,
            hold: action === "hold" ? step.hold : undefined,
            delta: action === "scroll" ? (step.delta ?? { x: 0, y: web ? 400 : 3 }) : undefined,
            to: action === "drag" ? step.to : undefined,
            until: action === "wait" || action === "scroll" ? step.until : undefined,
            platform: action === "platform" ? (step.platform ?? "") : undefined,
          });
        }}
      >
        {actionsFor(plan.mode).map((action) => (
          <option key={action} value={action}>
            {ACTION_LABELS[action]}
          </option>
        ))}
      </select>
      {(needsTarget || step.action === "key" || step.action === "scroll") &&
        markButton(
          "target",
          step.action === "drag"
            ? "Marcar o que arrastar"
            : step.action === "scroll"
              ? "Rolar sobre (opcional)"
              : step.action === "key" && web
                ? "Campo (opcional)"
                : step.action === "hold" && web
                  ? "Marcar o que segurar"
                  : "Marcar alvo",
          targetText(step.target, plan.mode),
        )}
      {step.action === "drag" &&
        markButton("to", "Marcar destino", destinationText(step, plan.mode))}
      {step.action === "platform" && (
        <input
          aria-label={`O que a plataforma faz na etapa ${n}`}
          title="O texto entre colchetes do roteiro. A plataforma diz de que gestos ele é feito; o Verificar plano confere."
          placeholder="ampliar jogo, verificar projeto…"
          maxLength={500}
          value={step.platform ?? ""}
          onChange={(e) => update({ platform: e.target.value })}
        />
      )}
      {step.action === "type" && (
        <label title="Seleciona o que o campo já tem antes de digitar, como um número trocado num bloco.">
          <input
            type="checkbox"
            checked={step.replace === true}
            onChange={(e) => update({ replace: e.target.checked ? true : undefined })}
          />
          Substituir o texto
        </label>
      )}
      {step.action === "type" && (
        <input
          aria-label={`Texto a digitar na etapa ${n}`}
          placeholder="Texto a digitar"
          maxLength={1000}
          value={step.value ?? ""}
          onChange={(e) => update({ value: e.target.value })}
        />
      )}
      {step.action === "key" && (
        <>
          <input
            aria-label={`Tecla ou atalho da etapa ${n}`}
            placeholder="Enter, Ctrl+Z…"
            list="guided-keys"
            value={step.chord ?? ""}
            onChange={(e) => update({ chord: e.target.value })}
          />
          <datalist id="guided-keys">
            {COMMON_KEYS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </>
      )}
      {step.action === "hold" && web && (
        <input
          aria-label={`Tecla a segurar na etapa ${n}`}
          title="Vazio: segura o botão do mouse no alvo. Com uma tecla (ArrowRight…), segura a tecla."
          placeholder="Tecla (opcional)"
          value={step.chord ?? ""}
          onChange={(e) => update({ chord: e.target.value || undefined })}
        />
      )}
      {step.action === "hold" && (
        <label>
          Segurar por (s)
          <input
            type="number"
            min="0.1"
            max={MAX_HOLD}
            step="0.1"
            value={step.hold ?? DEFAULT_HOLD}
            onChange={(e) => update({ hold: Number(e.target.value) })}
          />
        </label>
      )}
      {step.action === "scroll" && (
        <label>
          {web ? "Pixels (para baixo +)" : "Entalhes (para baixo +)"}
          <input
            type="number"
            step={web ? 50 : 1}
            value={step.delta?.y ?? 0}
            onChange={(e) => update({ delta: { x: 0, y: Number(e.target.value) } })}
          />
        </label>
      )}
      {step.action === "scroll" && web && condition("until", step.until)}
      {step.action === "wait" && condition("until", step.until)}
      {web && step.action !== "wait" && condition("expect", step.expect)}
      {web && (step.expect || step.until || step.action === "platform") && (
        <label title="O que o vídeo faz quando a página demora mais do que a fala dá: o trecho entra acelerado sob a fala (tela sem voz) ou a espera é cortada.">
          Se a página demorar
          <select
            aria-label={`Se a página demorar na etapa ${n}`}
            value={step.wait?.policy ?? "lapse"}
            onChange={(e) => {
              const policy = e.target.value as WaitPolicy;
              update({ wait: policy === "lapse" ? undefined : { policy } });
            }}
          >
            {WAIT_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {WAIT_POLICY_LABELS[policy]}
              </option>
            ))}
          </select>
        </label>
      )}
      {web && (
        <label title="Quanto a etapa espera pelo alvo ou pela condição antes de dar erro.">
          Espera máxima (s)
          <input
            type="number"
            min="0.5"
            max={MAX_STEP_TIMEOUT}
            step="0.5"
            value={step.timeout ?? DEFAULT_STEP_TIMEOUT}
            onChange={(e) => update({ timeout: Number(e.target.value) })}
          />
        </label>
      )}
      <button type="button" aria-label={`Remover etapa ${n}`} onClick={remove}>
        ×
      </button>
      {broken && (
        <div className="guided-broken" role="alert">
          {broken.screenshot && (
            <img src={broken.screenshot} alt={`A página quando a etapa ${n} falhou`} />
          )}
          <span>{broken.message}</span>
        </div>
      )}
      {notices?.map((message) => (
        <p key={message} className="guided-notice" role="status">
          {message}
        </p>
      ))}
    </div>
  );
}
