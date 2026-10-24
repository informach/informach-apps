import { describe, expect, it } from "vitest";
import { z } from "zod";
import { subjectsParserSchema } from "@/ai/subjects-parser/schema";
import { noticeGenerationSchema } from "./schemas";

/**
 * The structured output goes to OpenRouter with `json_schema.strict: true`, which refuses a
 * schema where an object leaves a property out of `required` (nullable is fine, optional is not).
 * The JSON Schema is now made by zod 4 itself: every object, at any depth, must list them all.
 */
type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $defs?: Record<string, JsonSchema>;
};

function looseObjects(schema: JsonSchema, path = "$"): string[] {
  const out: string[] = [];
  if (schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const key of Object.keys(schema.properties))
      if (!required.has(key)) out.push(`${path}.${key}`);
    for (const [key, child] of Object.entries(schema.properties))
      out.push(...looseObjects(child, `${path}.${key}`));
  }
  const items = Array.isArray(schema.items) ? schema.items : schema.items ? [schema.items] : [];
  for (const child of items) out.push(...looseObjects(child, `${path}[]`));
  for (const child of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])])
    out.push(...looseObjects(child, path));
  for (const [key, child] of Object.entries(schema.$defs ?? {}))
    out.push(...looseObjects(child, `$defs.${key}`));
  return out;
}

describe("saída estruturada no modo estrito", () => {
  for (const [name, schema] of [
    ["leitura de recado", noticeGenerationSchema],
    ["leitura de matérias", subjectsParserSchema],
  ] as const)
    it(`a ${name} lista todo campo como obrigatório`, () => {
      const json = z.toJSONSchema(schema, { io: "input" }) as JsonSchema;
      expect(looseObjects(json)).toEqual([]);
    });
});
