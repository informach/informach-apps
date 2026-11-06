import { describe, expect, it } from "vitest";
import { diasRestantes, emTolerancia, estadoDoTeste, TRIAL_DAYS } from "./regras";

const DIA = 86_400_000;

describe("teste de 7 dias", () => {
  it("nunca começou", () => {
    expect(estadoDoTeste(null)).toEqual({ active: false, endsAt: null, started: false });
  });
  it("vale por 7 dias a partir do início, e o último dia conta como 1", () => {
    const agora = Date.UTC(2026, 10, 6);
    const t = estadoDoTeste(agora - 2 * DIA, agora);
    expect(t.active).toBe(true);
    expect(diasRestantes(t, agora)).toBe(TRIAL_DAYS - 2);
    expect(diasRestantes(estadoDoTeste(agora - (TRIAL_DAYS * DIA - 3600_000), agora), agora)).toBe(
      1,
    );
  });
  it("acabou", () => {
    const agora = Date.UTC(2026, 10, 6);
    const t = estadoDoTeste(agora - 8 * DIA, agora);
    expect(t).toMatchObject({ active: false, started: true });
    expect(diasRestantes(t, agora)).toBe(0);
  });
});

describe("tolerância com o pagamento atrasado", () => {
  it("7 dias depois do fim do período", () => {
    const agora = Date.UTC(2026, 10, 6);
    expect(emTolerancia(agora - 6 * DIA, agora)).toBe(true);
    expect(emTolerancia(agora - 8 * DIA, agora)).toBe(false);
  });
});
