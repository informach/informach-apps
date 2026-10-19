import { type ReactNode, useId, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { AnimationKeyReference } from "../../shared/animationKeyReference";
import type { AnimationKeysCommand } from "../../shared/animationKeys";
import type { TimelineClip, TimelineKey } from "../../shared/animationTimeline";
import { numberValue, textValue } from "./form-values";
import { KeyCurveEditor } from "./key-curve-editor";
import { useKeyCurve } from "./useKeyCurve";

interface KeyProps {
  clip: TimelineClip;
  selection: TimelineKey;
  apply(command: {
    type: "animation-keys";
    command: Extract<AnimationKeysCommand["command"], { operation: "update" }>;
  }): void;
  close(): void;
}
function KeyDialog({ clip, selection, apply, close }: KeyProps) {
  const curve = useKeyCurve(selection.key.easing, selection.track.definition.discrete),
    { easing, discrete } = curve,
    [error, setError] = useState(""),
    id = useId();
  const unit = discrete
    ? "Índice inteiro; interpolação Degrau obrigatória."
    : selection.track.property === "offset" ||
        selection.track.property === "rotation" ||
        selection.track.property === "skewX"
      ? "Valor em graus."
      : selection.reference.kind === "rig"
        ? "Valor normalizado em 0–1, não em porcentagem."
        : "Limites da propriedade selecionada.";
  return (
    <form
      className="key-dialog-form"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          if (!easing) throw new Error("Curva inválida; verifique os limites dos controles.");
          const data = new FormData(event.currentTarget);
          apply({
            type: "animation-keys",
            command: {
              operation: "update",
              animationId: clip.id,
              reference: selection.reference,
              frame: numberValue(data, "frame"),
              value: numberValue(data, "value"),
              easing,
            },
          });
        } catch (error) {
          setError(error instanceof Error ? error.message : "Edição de chave recusada.");
        }
      }}
    >
      <div className="dialog-heading">
        <h2>Editar chave · {selection.track.property}</h2>
        <button type="button" data-close-key aria-label="Fechar" onClick={close}>
          ×
        </button>
      </div>
      <div className="help-content">
        <p>{selection.track.label}</p>
        <label className="scene-field">
          Quadro
          <input
            name="frame"
            type="number"
            min="0"
            max={clip.frames}
            step="any"
            defaultValue={selection.key.frame}
            required
          />
        </label>
        <label className="scene-field">
          Valor
          <input
            name="value"
            aria-describedby={`${id}-unit`}
            type="number"
            min={selection.track.definition.bounds[0]}
            max={selection.track.definition.bounds[1]}
            step={discrete ? 1 : "any"}
            defaultValue={selection.key.value}
            required
          />
        </label>
        <p id={`${id}-unit`} className="micro">
          {unit}
        </p>
        <KeyCurveEditor curve={curve} />
        <p className="micro">
          A curva vale até a próxima chave. Colisões são recusadas; nenhuma chave é sobrescrita.
          Arraste um controle ou use os campos/setas; Escape durante o arraste restaura só o draft.
        </p>
        <p role="alert" data-key-error>
          {error || (!easing ? "Curva inválida; verifique os limites dos controles." : "")}
        </p>
      </div>
      <div className="dialog-footer">
        <button type="submit" className="primary" disabled={!easing}>
          Aplicar chave
        </button>
      </div>
    </form>
  );
}

interface RetimeProps {
  clip: TimelineClip;
  references: AnimationKeyReference[];
  apply(command: AnimationKeysCommand): void;
  close(): void;
}
function RetimeDialog({ clip, references, apply, close }: RetimeProps) {
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget),
            operation = textValue(data, "operation");
          if (operation !== "move-keys" && operation !== "copy-keys")
            throw new Error("Operação de chaves inválida.");
          apply({
            type: "animation-keys",
            command: {
              operation: operation === "move-keys" ? "move" : "copy",
              animationId: clip.id,
              references,
              deltaFrames: numberValue(data, "delta"),
              scale: numberValue(data, "scale"),
              anchorFrame: numberValue(data, "anchor"),
            },
          });
        } catch (error) {
          setError(error instanceof Error ? error.message : "Reposicionamento recusado.");
        }
      }}
    >
      <div className="dialog-heading">
        <h2>Mover ou copiar {references.length} chaves</h2>
        <button type="button" data-close-key aria-label="Fechar" onClick={close}>
          ×
        </button>
      </div>
      <div className="help-content">
        <label className="scene-field">
          Operação
          <select name="operation">
            <option value="move-keys">Mover</option>
            <option value="copy-keys">Copiar</option>
          </select>
        </label>
        <label className="scene-field">
          Deslocamento em quadros
          <input
            name="delta"
            type="number"
            required
            step="any"
            min="-360000"
            max="360000"
            defaultValue="1"
          />
        </label>
        <label className="scene-field">
          Escala temporal
          <input
            name="scale"
            type="number"
            required
            step=".01"
            min=".01"
            max="100"
            defaultValue="1"
          />
        </label>
        <label className="scene-field">
          Quadro âncora
          <input
            name="anchor"
            type="number"
            required
            step="any"
            min="0"
            max={clip.frames}
            defaultValue="0"
          />
        </label>
        <p className="micro">
          Novo quadro = âncora + (quadro − âncora) × escala + deslocamento. Motion e rig são
          editados na mesma transação. Colisões/limites recusam tudo; nenhuma chave é sobrescrita.
          Amplie o zoom para separar glifos próximos.
        </p>
        <p role="alert" data-key-error>
          {error}
        </p>
      </div>
      <div className="dialog-footer">
        <button type="submit" className="primary">
          Aplicar às chaves
        </button>
      </div>
    </form>
  );
}
function mountDialog(
  dialog: HTMLDialogElement,
  render: (close: () => void) => ReactNode,
  closed: () => void,
) {
  const root = createRoot(dialog);
  let live = true;
  const dispose = () => {
    if (!live) return;
    live = false;
    dialog.removeEventListener("cancel", cancel);
    root.unmount();
  };
  const close = () => {
    dispose();
    dialog.close();
    closed();
  };
  const cancel = (event: Event) => {
    event.preventDefault();
    close();
  };
  dialog.addEventListener("cancel", cancel);
  flushSync(() => root.render(render(close)));
  dialog.showModal();
  return dispose;
}
export function mountKeyDialog(
  dialog: HTMLDialogElement,
  props: Omit<KeyProps, "close">,
  closed: () => void,
) {
  return mountDialog(dialog, (close) => <KeyDialog {...props} close={close} />, closed);
}
export function mountRetimeDialog(
  dialog: HTMLDialogElement,
  props: Omit<RetimeProps, "close">,
  closed: () => void,
) {
  return mountDialog(dialog, (close) => <RetimeDialog {...props} close={close} />, closed);
}
