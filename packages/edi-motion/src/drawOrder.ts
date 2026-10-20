import { driverFrames } from "./driverClocks";
import type { Animation, DrawOrder } from "./model";
import type { AnimationDriver } from "./playback";

/** Scope key of the artboard root (a draw order with `scopeId: null`). */
export const ROOT_DRAW_SCOPE = "";
/** Evaluated stacking per scope: listed children back to front. */
export type DrawOrders = Map<string, readonly string[]>;

/** Stepped: the last key at or before the frame; the first key holds before it. */
function drawOrderAt(drawOrder: DrawOrder, frame: number) {
  if (!Number.isFinite(frame)) throw new Error("Quadro inválido.");
  const keys = drawOrder.keys;
  let low = 0,
    high = keys.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2),
      key = keys[middle];
    if (key && key.frame <= frame) low = middle;
    else high = middle - 1;
  }
  const key = keys[low];
  if (!key) throw new Error("Ordem de desenho sem chaves.");
  return key.order;
}
export function evaluateDrawOrders(
  animation: Pick<Animation, "drawOrders"> | undefined,
  frame: number,
  orders: DrawOrders = new Map(),
) {
  for (const drawOrder of animation?.drawOrders ?? [])
    orders.set(drawOrder.scopeId ?? ROOT_DRAW_SCOPE, drawOrderAt(drawOrder, frame));
  return orders;
}
/** The clip's orders, then each component clock's at its own (inherited) phase. */
export function evaluatePlaybackDrawOrders(
  animation: Animation | undefined,
  frame: number,
  seconds: number,
  drivers: readonly AnimationDriver[],
) {
  const orders = evaluateDrawOrders(animation, frame);
  if (!drivers.some((driver) => driver.animation.drawOrders?.length)) return orders;
  const frames = driverFrames(seconds, drivers);
  for (const driver of drivers) {
    const driverFrame = frames.get(driver.id);
    if (driverFrame === undefined) throw new Error("Relógio de componente ausente.");
    evaluateDrawOrders(driver.animation, driverFrame, orders);
  }
  return orders;
}
export function drawOrderCost(animation: Pick<Animation, "drawOrders">) {
  return (animation.drawOrders ?? []).reduce(
    (sum, drawOrder) => sum + 1 + Math.ceil(Math.log2(drawOrder.keys.length + 1)),
    0,
  );
}
/** Every scope a document's clips can reorder (the DOM binding watches only these). */
export function drawOrderScopes(animations: readonly Pick<Animation, "drawOrders">[]) {
  return new Set(
    animations.flatMap((animation) =>
      (animation.drawOrders ?? []).map((drawOrder) => drawOrder.scopeId ?? ROOT_DRAW_SCOPE),
    ),
  );
}
