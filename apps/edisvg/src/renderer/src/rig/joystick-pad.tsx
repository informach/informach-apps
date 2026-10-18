import type { RigJoystick } from "@informach/edi-motion/rig";
import { useId, useLayoutEffect, useRef } from "react";
import { type JoystickPoint, type JoystickPreview, useJoystickPad } from "./use-joystick-pad";

export type JoystickRestore = "pad" | "x" | "y";
export function JoystickPad({
  value,
  disabled,
  preview,
  commit,
  report,
  restore,
  restored,
}: {
  value: RigJoystick;
  disabled: boolean;
  preview: JoystickPreview;
  commit(point: JoystickPoint, restore: JoystickRestore): void;
  report(error: unknown): void;
  restore?: JoystickRestore;
  restored(): void;
}) {
  const control = useJoystickPad({ value, preview, commit, report }),
    description = useId(),
    pad = useRef<HTMLButtonElement>(null),
    x = useRef<HTMLInputElement>(null),
    y = useRef<HTMLInputElement>(null),
    didRestore = useRef(false);
  useLayoutEffect(() => {
    if (!restore || didRestore.current) return;
    didRestore.current = true;
    ({ pad, x, y })[restore].current?.focus();
    restored();
  }, [restore, restored]);
  return (
    <fieldset disabled={disabled} className="joystick-control">
      <legend>Posição base · {value.name}</legend>
      <p id={description} className="micro">
        Arraste ou use setas (0,1), Shift + setas (0,01), Home para centralizar. Escape cancela.
        Soltar confirma uma alteração. X cresce à direita; Y, para baixo. Enter/Tab abre os campos.
      </p>
      <button
        {...control.pad}
        type="button"
        className="joystick-pad"
        ref={pad}
        aria-label={`Pad 2D de ${value.name}`}
        aria-describedby={description}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            x.current?.focus();
          } else control.pad.onKeyDown(event);
        }}
      >
        <svg aria-hidden="true" viewBox="-1.2 -1.2 2.4 2.4">
          {value.limit === "circle" ? (
            <circle className="joystick-envelope" r="1" />
          ) : (
            <rect className="joystick-envelope" x="-1" y="-1" width="2" height="2" />
          )}
          <path className="joystick-axes" d="M-1,0 H1 M0,-1 V1" />
          <circle className="joystick-center" r=".035" />
          {control.effective && (
            <>
              <path
                className="joystick-vector"
                d={`M0,0 L${control.effective.x},${control.effective.y}`}
              />
              <circle
                className="joystick-point"
                cx={control.effective.x}
                cy={control.effective.y}
                r=".08"
              />
            </>
          )}
        </svg>
      </button>
      <output className="micro" aria-live="polite">
        {control.effective
          ? `Efetivo: X ${control.effective.x.toFixed(3)} · Y ${control.effective.y.toFixed(3)}`
          : "Prévia suspensa: informe os dois eixos entre -1 e 1."}
      </output>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          control.apply();
        }}
      >
        {(["x", "y"] as const).map((axis) => (
          <label className="scene-field" key={axis}>
            Eixo {axis.toUpperCase()} (-1 a 1)
            <input
              ref={axis === "x" ? x : y}
              type="number"
              step="any"
              min="-1"
              max="1"
              required
              aria-label={`Joystick ${axis.toUpperCase()}`}
              value={control.fields[axis]}
              onChange={(event) => control.edit(axis, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  control.cancel();
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  control.apply(axis);
                }
              }}
            />
          </label>
        ))}
        <button type="submit" disabled={!control.point || !control.dirty}>
          Aplicar eixos
        </button>
        <button type="button" disabled={!control.dirty} onClick={control.cancel}>
          Cancelar prévia
        </button>
      </form>
      <p className="micro">
        Esta é a posição base, não uma chave. Canais e bindings podem sobrepor os eixos em
        Animar/Testar. Use Parâmetros para animá-los. O limite circular projeta os dois eixos
        juntos.
      </p>
    </fieldset>
  );
}
