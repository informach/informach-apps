import { describe, expect, it } from "vitest";
import { separarProgressoDaProvaDeSchema as separar } from "../../../scripts/backup/diagnostico-schema";

const frame = (etapa: string, decorridoMs = 1) =>
  JSON.stringify({ formato: "recreio-prova-schema-etapa-v1", etapa, decorridoMs });
describe("quadros técnicos da prova privada de schema", () => {
  it("preserva recibo único, progresso validado e última fase mesmo sem recibo", () => {
    expect(separar('{"ok":true}').final).toBe('{"ok":true}');
    const r = separar(`${frame("INICIO")}\n${frame("DUMP", 2)}\n{"ok":true}`);
    expect(r.ultima).toMatchObject({ etapa: "DUMP", decorridoMs: 2 });
    expect(r.final).toBe('{"ok":true}');
    expect(separar(frame("CANCELAMENTO")).final).toBeUndefined();
    expect(separar(frame("CANCELAMENTO")).ultima?.etapa).toBe("CANCELAMENTO");
  });
  it("recusa quadros alheios, repetidos ou regressivos sem devolver entrada", () => {
    for (const s of [
      frame("private-invalid"),
      `${frame("DUMP")}\n${frame("DUMP")}`,
      `${frame("DUMP", 2)}\n${frame("IMPORTACAO", 1)}`,
      `{"ok":true}\n${frame("DUMP")}`,
      "private-invalid",
      "{}\n{}",
      "x".repeat(32769),
      JSON.stringify({
        formato: "recreio-prova-schema-etapa-v1",
        etapa: "DUMP",
        decorridoMs: 1,
        secret: "private-invalid",
      }),
    ])
      expect(() => separar(s)).toThrow(/^Invalid private schema progress protocol$/);
  });
});
