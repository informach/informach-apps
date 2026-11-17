import { describe, expect, it } from "vitest";
import { destino, GUARDAR_NA_FILA } from "./fila";

describe("fila de treinos feitos sem rede", () => {
  it("sai da fila quando salva ou quando a recusa é sobre o próprio treino", () => {
    expect(destino({ ok: true })).toBe("sai");
    expect(destino({ ok: false, code: "INPUT" })).toBe("sai");
    expect(destino({ ok: false, code: "EMPTY" })).toBe("sai");
  });

  it("fica guardado quando a recusa pode mudar (plano, perfil, login)", () => {
    for (const code of ["PLAN", "PROFILE", "AUTH", "VERIFY", "UNEXPECTED", "ACCESS_DENIED"])
      expect(destino({ ok: false, code })).toBe("fica");
  });

  it("o player guarda na fila os mesmos casos que a fila mantém", () => {
    for (const code of GUARDAR_NA_FILA) expect(destino({ ok: false, code })).toBe("fica");
  });
});
