import { describe, expect, it } from "vitest";
import { prazoLocalDaVisita } from "./tempo-visita";

const recibo = { agora: "2026-11-18T06:00:00.000Z", permissaoAte: "2026-11-18T06:00:30.000Z" };
describe("prazo monotônico do visitante", () => {
  it("desconta ida, processamento e volta sem depender de data civil local", () => {
    expect(prazoLocalDaVisita(recibo, { enviadoEm: 1000, recebidoEm: 3000 })).toBe(31000);
    expect(
      prazoLocalDaVisita(
        { agora: "2000-01-01T00:00:00.000Z", permissaoAte: "2000-01-01T00:00:30.000Z" },
        { enviadoEm: 1000, recebidoEm: 3000 },
      ),
    ).toBe(31000);
  });
  it("resposta atrasada não reabre uma janela de trinta segundos no recebimento", () => {
    const recebidoEm = 40000;
    expect(prazoLocalDaVisita(recibo, { enviadoEm: 1000, recebidoEm })).toBeLessThan(recebidoEm);
  });
  it("não aceita um relógio cuja precisão já não representa a duração curta", () => {
    expect(() => prazoLocalDaVisita(recibo, { enviadoEm: 1e300, recebidoEm: 1e300 })).toThrow(
      "INDISPONIVEL",
    );
  });
  it.each(["negativo", "retrocesso", "infinito", "nan"] as const)("recusa relógio %s", (tipo) => {
    const pedido =
      tipo === "negativo"
        ? { enviadoEm: -1, recebidoEm: 3 }
        : tipo === "retrocesso"
          ? { enviadoEm: 4, recebidoEm: 3 }
          : tipo === "infinito"
            ? { enviadoEm: 1, recebidoEm: Infinity }
            : { enviadoEm: NaN, recebidoEm: 1 };
    expect(() => prazoLocalDaVisita(recibo, pedido)).toThrow("INDISPONIVEL");
  });
  it.each(["vencido", "longo", "data"] as const)("recusa prazo %s", (tipo) => {
    expect(() =>
      prazoLocalDaVisita(
        {
          ...recibo,
          permissaoAte:
            tipo === "vencido"
              ? recibo.agora
              : tipo === "longo"
                ? "2026-11-18T06:01:00.000Z"
                : "invalida",
        },
        { enviadoEm: 1, recebidoEm: 2 },
      ),
    ).toThrow("INDISPONIVEL");
  });
});
