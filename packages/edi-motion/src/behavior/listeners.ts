import {
  type BehaviorContext,
  type BehaviorSession,
  fireBehaviorTrigger,
  setBehaviorInput,
} from "./engine";
import type { BehaviorListener } from "./model";

/** Adapters convert screen -> artboard coordinates before dispatch. Keyboard
 * activation provides the target's center, not fabricated mouse coordinates. */
export function dispatchBehaviorListeners(
  context: BehaviorContext,
  source: BehaviorSession,
  event: BehaviorListener["event"],
  targetId: string | null,
  point?: { x: number; y: number; viewBox: readonly [number, number, number, number] },
): BehaviorSession {
  let session = source;
  for (const listener of context.behavior.listeners) {
    if (listener.event !== event || listener.targetId !== targetId) continue;
    for (const action of listener.actions) {
      if (action.kind === "trigger")
        session = fireBehaviorTrigger(context, session, action.inputId);
      else if (action.kind === "set-input")
        session = setBehaviorInput(context, session, action.inputId, action.value);
      else {
        if (
          !point ||
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          point.viewBox.some((value) => !Number.isFinite(value)) ||
          point.viewBox[2] <= 0 ||
          point.viewBox[3] <= 0
        )
          throw new Error("Listener de coordenada requer ponto e viewBox válidos.");
        const input = context.behavior.inputs.find((input) => input.id === action.inputId);
        if (input?.kind !== "number") throw new Error("Input de coordenada inválido.");
        const axis = action.axis === "x" ? 0 : 1,
          dimension = action.axis === "x" ? point.viewBox[2] : point.viewBox[3],
          coordinate = action.axis === "x" ? point.x : point.y,
          value = action.normalized
            ? (coordinate - (point.viewBox[axis] ?? 0)) / dimension
            : coordinate;
        session = setBehaviorInput(
          context,
          session,
          input.id,
          Math.max(input.min, Math.min(input.max, value)),
        );
      }
    }
  }
  return session;
}
