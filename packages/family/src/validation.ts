import { getAppCollection } from "@informach/config/collections";
import { z } from "zod";

export const id = z.uuid();
export const action = z.enum(["read", "write", "manage", "use_ai"]);
export const app = z.string().refine((value) => getAppCollection(value) === "compasso", {
  message: "Aplicativo fora do Compasso.",
});
export const targetSchema = z.object({ groupId: id, personId: id, app, action }).strict();
export const personSchema = z
  .object({
    groupId: id,
    kind: z.enum(["adult", "dependent"]),
    displayName: z.string().trim().min(1).max(80),
    color: z
      .string()
      .regex(/^#[0-9A-F]{6}$/)
      .default("#48785C"),
    avatar: z
      .string()
      .regex(/^[a-z0-9_-]{1,40}$/)
      .default("person"),
  })
  .strict();
export const updatePersonSchema = personSchema.omit({ kind: true }).extend({
  personId: id,
  expectedVersion: z.number().int().positive(),
});
export const linkSchema = z.object({ groupId: id, personId: id, app }).strict();
export const grantSchema = targetSchema.extend({ userId: z.string().min(1).max(200) });
