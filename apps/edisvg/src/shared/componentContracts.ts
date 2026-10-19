import { objectIdSchema, objectTransformPatchSchema } from "@informach/edi-motion";
import { type Behavior, validateInputValue } from "@informach/edi-motion/behavior";
import { z } from "zod";
import { artboardIdSchema } from "./identities";
export const instanceSchema = z.strictObject({
  artboardId: artboardIdSchema,
  animationId: z
    .string()
    .regex(/^[a-z]+-[\w-]{1,100}$/)
    .nullable(),
  width: z.number().positive().max(100000),
  height: z.number().positive().max(100000),
  fit: z.enum(["contain", "cover", "stretch"]),
  speed: z.number().min(0.01).max(100),
  offsetSeconds: z.number().min(-3600).max(3600),
  machineId: z
    .string()
    .regex(/^[a-z]+-[\w-]{1,100}$/)
    .nullable()
    .optional(),
  inputOverrides: z
    .array(
      z.strictObject({
        inputId: z.string().regex(/^[a-z]+-[\w-]{1,100}$/),
        value: z.union([z.number().min(-1e7).max(1e7), z.boolean(), z.string().max(10000)]),
      }),
    )
    .max(100)
    .optional(),
  overrides: z
    .array(
      z.strictObject({
        targetId: objectIdSchema,
        text: z.string().max(10000).optional(),
        attrs: z.record(z.string().max(80), z.string().max(500000)).optional(),
        transform: objectTransformPatchSchema.optional(),
      }),
    )
    .max(2000),
});
export type ComponentInstance = z.infer<typeof instanceSchema>;
export function validateInstanceLogic(
  instance: ComponentInstance,
  behavior: Behavior | undefined,
  hasLayout: boolean,
) {
  if (
    instance.machineId &&
    !behavior?.machines.some((machine) => machine.id === instance.machineId)
  )
    throw new Error("Máquina inicial do componente ausente.");
  if (behavior?.machines.length && instance.animationId !== null)
    throw new Error("Componente com máquina requer clip sincronizado desativado.");
  const independent =
    hasLayout ||
    (!!behavior &&
      (behavior.inputs.length > 0 ||
        behavior.machines.length > 0 ||
        behavior.bindings.length > 0 ||
        behavior.listeners.length > 0 ||
        behavior.events.length > 0 ||
        !!behavior.data));
  if (independent && instance.offsetSeconds !== 0)
    throw new Error("Componente independente requer offset zero; configure estado/clip inicial.");
  const ids = new Set<string>();
  for (const override of instance.inputOverrides ?? []) {
    const input = behavior?.inputs.find((input) => input.id === override.inputId);
    if (!input || ids.has(override.inputId))
      throw new Error("Override de input duplicado ou órfão.");
    ids.add(override.inputId);
    if (
      behavior?.data?.links.some(
        (link) => link.inputId === input.id && link.direction === "one-way",
      )
    )
      throw new Error("Input ligado a dados somente leitura não admite override.");
    validateInputValue(input, override.value);
  }
}
export const componentCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("component"),
    operation: z.literal("create"),
    name: z.string().trim().min(1).max(120),
    instance: instanceSchema,
  }),
  z.strictObject({
    type: z.literal("component"),
    operation: z.literal("update"),
    targetId: objectIdSchema,
    instance: instanceSchema,
  }),
]);
export type ComponentCommand = z.infer<typeof componentCommandSchema>;
