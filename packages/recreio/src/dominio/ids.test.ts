import { expect, it } from "vitest";
import { ContaIdSchema, PerfilIdSchema, UuidSchema } from "./ids";

it("normaliza UUIDs sem alterar identidades textuais do login compartilhado", () => {
  const maiusculo = "ABCDEF12-1234-4ABC-8DEF-ABCDEF123456";
  expect(PerfilIdSchema.parse(maiusculo)).toBe(maiusculo.toLowerCase());
  expect(UuidSchema.parse(maiusculo)).toBe(maiusculo.toLowerCase());
  expect(ContaIdSchema.parse("Conta_Sensivel_A_Caixa")).toBe("Conta_Sensivel_A_Caixa");
});
