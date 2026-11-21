import { describe, expect, it } from "vitest";
import {
  processamentoDeDireitosEstaAtual as atual,
  type EvidenciaDaRotinaDeDireitos,
} from "./monitoramento";

const fila = {
  publishing: 0,
  processing: 0,
  review: 0,
  processingOverdue: 0,
  retained: 0,
  purgeDue: 0,
  purgeOverdue: 0,
};
const boa = (): EvidenciaDaRotinaDeDireitos => ({
  idadeExecucaoSegundos: 30,
  execucaoTerminada: true,
  execucaoOk: true,
  resumo: { ...fila, leiturasLivro: 1, escritasLivro: 0 },
});

describe("saúde do executor e da fila de direitos", () => {
  it("aceita rodada nativa recente e trabalho/retencão ainda nos prazos", () => {
    expect(atual(boa(), fila, 900)).toBe(true);
    expect(atual(boa(), { ...fila, publishing: 1, processing: 2, retained: 3 }, 900)).toBe(true);
    expect(
      atual({ ...boa(), execucaoTerminada: false, execucaoOk: null, resumo: {} }, fila, 900),
    ).toBe(true);
  });
  it("não chama de saudável sucesso antigo, futuro, incompleto ou falha", () => {
    for (const patch of [
      { idadeExecucaoSegundos: null },
      { idadeExecucaoSegundos: -1 },
      { idadeExecucaoSegundos: 901 },
      { idadeExecucaoSegundos: Number.NaN },
      { execucaoOk: false },
      { resumo: {} },
      { resumo: { ...fila, leiturasLivro: -1, escritasLivro: 0 } },
      { execucaoTerminada: false, execucaoOk: true },
      { resumo: "invalid" },
    ])
      expect(atual({ ...boa(), ...patch }, fila, 900)).toBe(false);
    expect(
      atual(
        { ...boa(), execucaoTerminada: false, execucaoOk: null, idadeExecucaoSegundos: 901 },
        fila,
        3600,
      ),
    ).toBe(false);
  });
  it("aponta revisão, atraso, métricas inválidas e expurgo vencido sem reprovar retenção legítima", () => {
    for (const patch of [
      { review: 1 },
      { processingOverdue: 1 },
      { purgeOverdue: 1 },
      { processing: -1 },
      { purgeDue: Number.NaN },
    ])
      expect(atual(boa(), { ...fila, ...patch }, 900)).toBe(false);
    for (const limite of [0, 59, 86401, Number.NaN]) expect(atual(boa(), fila, limite)).toBe(false);
  });
});
