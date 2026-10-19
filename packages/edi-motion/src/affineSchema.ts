import { z } from "zod";

/** The same bounded matrix contract applies to rig, playback and graphics. */
const coefficient = z.number().min(-1e7).max(1e7);
export const affineSchema = z.tuple([
  coefficient,
  coefficient,
  coefficient,
  coefficient,
  coefficient,
  coefficient,
]);
