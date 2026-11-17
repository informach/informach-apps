import { describe, expect, it } from "vitest";
import {
  acertarUsoDeConcessao,
  calcularPoliticaDoMenor,
  decidirTempoDoMenor,
  SupervisaoSchema,
  supervisaoInicial,
  validarSupervisaoDoMenor,
} from "./politicas";

const agora = { ano: 2026, mes: 11 };
const nascimento = { ano: 2014, mes: 12 };

describe("supervisão efetiva", () => {
  it("separa classificação e social, sem inventar horário ou orçamento", () => {
    expect(calcularPoliticaDoMenor(nascimento, agora, supervisaoInicial())).toEqual({
      faixaSocial: "ate_12",
      faixa: "10",
      precisaContaAdulta: false,
      configuracaoPrecisaRevisao: false,
      multiplayer: true,
      textoLivre: false,
      contatos: "approval",
      presenca: "friends",
      amigosAprovadosObrigatorios: true,
      pausado: false,
      minutosPorDia: null,
      horarios: null,
    });
  });
  it("reduz conteúdo, recusa ampliação nova e contém uma configuração histórica inválida", () => {
    expect(
      calcularPoliticaDoMenor(nascimento, agora, { ...supervisaoInicial(), limiteDeConteudo: "6" })
        .faixa,
    ).toBe("6");
    const acimaDaIdade = { ...supervisaoInicial(), limiteDeConteudo: "12" as const };
    expect(() => validarSupervisaoDoMenor(nascimento, agora, acimaDaIdade)).toThrow(
      "POLITICA_INCOMPATIVEL",
    );
    expect(calcularPoliticaDoMenor(nascimento, agora, acimaDaIdade)).toMatchObject({
      faixa: "10",
      configuracaoPrecisaRevisao: true,
    });
    expect(
      SupervisaoSchema.safeParse({ ...supervisaoInicial(), limiteDeConteudo: "18" }).success,
    ).toBe(false);
  });
  it("contatos e texto livre obedecem a faixa social também no aniversário e aos 18", () => {
    const configuracao = { ...supervisaoInicial(), textoLivre: true };
    const aniversario13 = { ano: 2013, mes: 12 };
    expect(() => validarSupervisaoDoMenor(aniversario13, agora, configuracao)).toThrow(
      "POLITICA_INCOMPATIVEL",
    );
    expect(calcularPoliticaDoMenor(aniversario13, agora, configuracao).textoLivre).toBe(false);
    expect(
      calcularPoliticaDoMenor(aniversario13, { ano: 2026, mes: 12 }, configuracao),
    ).toMatchObject({ faixaSocial: "13_17", contatos: "code", textoLivre: true, faixa: "12" });
    expect(
      calcularPoliticaDoMenor({ ano: 2008, mes: 11 }, agora, {
        ...configuracao,
        contatos: false,
        presenca: "invisible",
      }),
    ).toMatchObject({
      precisaContaAdulta: true,
      faixa: "16",
      contatos: "disabled",
      presenca: "invisible",
      amigosAprovadosObrigatorios: true,
    });
  });
  it("recusa sobreposição e janelas inválidas; permite janelas adjacentes e dias diferentes", () => {
    const janela = { diaDaSemana: 1, inicioMinuto: 600, fimMinuto: 660 };
    for (const horarios of [
      [janela, { ...janela, inicioMinuto: 659 }],
      [{ ...janela, fimMinuto: 600 }],
      [{ ...janela, diaDaSemana: 7 }],
      Array.from({ length: 15 }, () => janela),
    ])
      expect(SupervisaoSchema.safeParse({ ...supervisaoInicial(), horarios }).success).toBe(false);
    expect(
      SupervisaoSchema.safeParse({
        ...supervisaoInicial(),
        horarios: [
          { ...janela, inicioMinuto: 660, fimMinuto: 720 },
          janela,
          { ...janela, diaDaSemana: 2 },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("tempo autoritativo", () => {
  const local = { diaDaSemana: 1, minuto: 600 };
  it("distingue agenda ausente de agenda vazia e respeita pausa", () => {
    expect(
      decidirTempoDoMenor({ supervisao: supervisaoInicial(), instanteLocal: local, usadoMs: 0 }),
    ).toEqual({ permitido: true, saldoMs: null, ateMinutoLocal: 1440 });
    expect(
      decidirTempoDoMenor({
        supervisao: { ...supervisaoInicial(), horarios: [] },
        instanteLocal: local,
        usadoMs: 0,
      }),
    ).toEqual({ permitido: false, motivo: "schedule" });
    expect(
      decidirTempoDoMenor({
        supervisao: { ...supervisaoInicial(), pausado: true },
        instanteLocal: local,
        usadoMs: 0,
      }),
    ).toEqual({ permitido: false, motivo: "paused" });
  });
  it("inclui o início e exclui o fim do horário; orçamento vale para todo o perfil", () => {
    const supervisao = {
      ...supervisaoInicial(),
      minutosPorDia: 30,
      horarios: [{ diaDaSemana: 1, inicioMinuto: 600, fimMinuto: 660 }],
    };
    expect(decidirTempoDoMenor({ supervisao, instanteLocal: local, usadoMs: 1_799_000 })).toEqual({
      permitido: true,
      saldoMs: 1000,
      ateMinutoLocal: 660,
    });
    expect(decidirTempoDoMenor({ supervisao, instanteLocal: local, usadoMs: 1_800_000 })).toEqual({
      permitido: false,
      motivo: "daily_limit",
    });
    for (const instanteLocal of [
      { ...local, minuto: 599 },
      { ...local, minuto: 660 },
      { ...local, diaDaSemana: 2 },
    ]) {
      expect(decidirTempoDoMenor({ supervisao, instanteLocal, usadoMs: 0 })).toEqual({
        permitido: false,
        motivo: "schedule",
      });
    }
  });
  it("contabiliza uma vez, até o prazo concedido e sem cobrar silêncio de rede depois dele", () => {
    const inicial = { usadoMs: 300, contabilizadoAte: 1000, concedidoAte: 5000 };
    const parcial = acertarUsoDeConcessao(inicial, 3000, null);
    expect(parcial).toEqual({ usadoMs: 2300, contabilizadoAte: 3000, concedidoAte: 5000 });
    expect(acertarUsoDeConcessao(parcial, 3000, null)).toEqual(parcial);
    const final = acertarUsoDeConcessao(parcial, 9000, null);
    expect(final).toEqual({ usadoMs: 4300, contabilizadoAte: 5000, concedidoAte: 5000 });
    expect(acertarUsoDeConcessao(final, 10000, null)).toEqual(final);
  });
  it("saída confirmada encerra o intervalo e não devolve uso já contabilizado", () => {
    const inicial = { usadoMs: 0, contabilizadoAte: 1000, concedidoAte: 5000 };
    expect(acertarUsoDeConcessao(inicial, 8000, 2500)).toEqual({
      usadoMs: 1500,
      contabilizadoAte: 2500,
      concedidoAte: 5000,
    });
    const acertado = acertarUsoDeConcessao(inicial, 4000, null);
    expect(acertarUsoDeConcessao(acertado, 5000, 2500)).toEqual(acertado);
  });
  it("sem concessão não há uso; relógio regressivo ou entrada corrompida é recusado", () => {
    const semConcessao = { usadoMs: 700, contabilizadoAte: 1000, concedidoAte: null };
    expect(acertarUsoDeConcessao(semConcessao, 3000, null)).toEqual(semConcessao);
    expect(() => acertarUsoDeConcessao(semConcessao, 999, null)).toThrow("INDISPONIVEL");
    expect(() =>
      acertarUsoDeConcessao({ ...semConcessao, concedidoAte: 999 }, 2000, null),
    ).toThrow();
    expect(() =>
      acertarUsoDeConcessao(
        { usadoMs: 172800000, contabilizadoAte: 0, concedidoAte: 100 },
        100,
        null,
      ),
    ).toThrow("INDISPONIVEL");
  });
});
