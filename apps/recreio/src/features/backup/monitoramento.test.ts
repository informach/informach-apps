import { describe, expect, it } from "vitest";
import { backupEstaAtual, type EvidenciaDoMonitor } from "./monitoramento";

const atual: EvidenciaDoMonitor = {
  idadeCapturaSegundos: 21600,
  idadeExecucaoSegundos: 21600,
  execucaoTerminada: true,
  execucaoOk: true,
  pendencias: false,
};
describe("atualidade operacional do backup", () => {
  it("aceita o limite original e rejeita idade futura, ausente, inválida ou vencida", () => {
    expect(backupEstaAtual(atual, 21600)).toBe(true);
    for (const idade of [null, -1, Number.NaN, Number.POSITIVE_INFINITY, 21601]) {
      expect(backupEstaAtual({ ...atual, idadeCapturaSegundos: idade }, 21600)).toBe(false);
      expect(backupEstaAtual({ ...atual, idadeExecucaoSegundos: idade }, 21600)).toBe(false);
    }
  });
  it("uma cópia recente não esconde falha, pendência ou execução interrompida", () => {
    expect(backupEstaAtual({ ...atual, execucaoOk: false }, 25200)).toBe(false);
    expect(backupEstaAtual({ ...atual, execucaoOk: null }, 25200)).toBe(false);
    expect(backupEstaAtual({ ...atual, pendencias: true }, 25200)).toBe(false);
    for (const [idade, esperado] of [
      [0, true],
      [900, true],
      [901, false],
    ] as const)
      expect(
        backupEstaAtual(
          { ...atual, execucaoTerminada: false, execucaoOk: null, idadeExecucaoSegundos: idade },
          25200,
        ),
      ).toBe(esperado);
    expect(
      backupEstaAtual(
        { ...atual, execucaoTerminada: false, execucaoOk: true, idadeExecucaoSegundos: 0 },
        25200,
      ),
    ).toBe(false);
  });
});
