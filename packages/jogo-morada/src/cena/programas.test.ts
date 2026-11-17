import { describe, expect, it, vi } from "vitest";
import { ErroDePrograma, ProgramasDaCena } from "./programas";

describe("admissão dos programas do desenho", () => {
  it("consulta uma vez os recursos admitidos e confere os que aparecem depois", () => {
    const conferir = vi.fn(() => true);
    const guardiao = new ProgramasDaCena(conferir);
    const primeiro = { program: {} },
      segundo = { program: {} };
    guardiao.verificar([primeiro]);
    guardiao.verificar([primeiro]);
    guardiao.verificar([primeiro, segundo]);
    expect(conferir.mock.calls).toEqual([[primeiro.program], [segundo.program]]);
  });

  it("recusa ligação inválida em todas as tentativas, sem admitir por repetição", () => {
    const conferir = vi.fn(() => false);
    const guardiao = new ProgramasDaCena(conferir);
    const programa = { program: {} };
    expect(() => guardiao.verificar([programa])).toThrow(ErroDePrograma);
    expect(() => guardiao.verificar([programa])).toThrow(ErroDePrograma);
    expect(conferir).toHaveBeenCalledTimes(2);
  });

  it("não converte exceção do driver em sucesso nem reaproveita sua admissão", () => {
    const falha = new Error("driver indisponível");
    const conferir = vi
      .fn<(programa: unknown) => boolean>()
      .mockImplementationOnce(() => {
        throw falha;
      })
      .mockReturnValue(true);
    const guardiao = new ProgramasDaCena(conferir);
    const programa = { program: {} };
    expect(() => guardiao.verificar([programa])).toThrow(falha);
    guardiao.verificar([programa]);
    guardiao.verificar([programa]);
    expect(conferir).toHaveBeenCalledTimes(2);
  });
});
