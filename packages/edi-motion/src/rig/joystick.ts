import { z } from "zod";
import { objectIdSchema } from "../model";
import { parameterKey } from "../parameters";
import type { Kinematics, RigEvaluationBudget } from "./kinematics";

const axis = z.number().min(-1).max(1);
export const joystickSchema = z.strictObject({
  id: z.string().regex(/^joystick-[\w-]{1,100}$/),
  name: z.string().trim().min(1).max(120),
  targetId: objectIdSchema,
  x: axis,
  y: axis,
  rangeX: z.number().min(0.000001).max(10000),
  rangeY: z.number().min(0.000001).max(10000),
  limit: z.enum(["square", "circle"]),
});
export type RigJoystick = z.infer<typeof joystickSchema>;
export const JOYSTICK_SAMPLE_COST = 8;

/** Requested axes are individually bounded. Circular control projects their
 * combined result AFTER interpolation/bindings, without mutating authored
 * values. Its scene-unit extents may differ: circle becomes an ellipse. */
export function resolveJoystickAxes(x: number, y: number, limit: RigJoystick["limit"]) {
  if (![x, y].every((value) => Number.isFinite(value) && value >= -1 && value <= 1))
    throw new Error("Eixos de joystick devem ficar entre -1 e 1.");
  if (limit !== "square" && limit !== "circle") throw new Error("Limite de joystick inválido.");
  const length = Math.hypot(x, y),
    divisor = limit === "circle" && length > 1 ? length : 1;
  return { x: x / divisor, y: y / divisor };
}

/** A validated definition plus already composed parameter values. One shared
 * budget, no clock, DOM, generated ID, source mutation or schema parse/frame. */
export function evaluateJoystick(
  joystick: RigJoystick,
  values: { x: number; y: number },
  budget: RigEvaluationBudget,
) {
  if (!Number.isInteger(budget.remaining) || budget.remaining < 0 || budget.remaining > 2_000_000)
    throw new Error("Orçamento de joystick inválido.");
  budget.remaining -= JOYSTICK_SAMPLE_COST;
  if (budget.remaining < 0) throw new Error("Joystick excede orçamento compartilhado.");
  const point = resolveJoystickAxes(values.x, values.y, joystick.limit),
    x = point.x * joystick.rangeX,
    y = point.y * joystick.rangeY;
  if (![x, y].every((value) => Number.isFinite(value) && Math.abs(value) <= 10000))
    throw new Error("Deslocamento de joystick fora do perfil numérico.");
  return { axes: point, offset: { x, y } };
}

/** Before constraint reads: offsets are relative to this frame's TRS center,
 * not last frame's output. Kinematics owns its pose map and validates writes. */
export function applyJoystickControllers(
  frame: Kinematics,
  controllers: readonly RigJoystick[],
  budget: RigEvaluationBudget,
  parameters?: ReadonlyMap<string, number>,
) {
  for (const controller of controllers) {
    const { offset } = evaluateJoystick(
        controller,
        {
          x: parameters?.get(parameterKey([], controller.id, "x")) ?? controller.x,
          y: parameters?.get(parameterKey([], controller.id, "y")) ?? controller.y,
        },
        budget,
      ),
      center = frame.pose(controller.targetId);
    try {
      frame.set(controller.targetId, { x: center.x + offset.x, y: center.y + offset.y });
    } catch (error) {
      throw new Error(`Joystick ${controller.id} produz posição local fora dos limites.`, {
        cause: error,
      });
    }
  }
}
