import { describe, expect, it } from "vitest";
import {
  type CapturaDoFinanciamento,
  comprovarFinanciamento,
  type FaturaDoFinanciamento,
  type LinhaDoFinanciamento,
  type MovimentoDoFinanciamento,
} from "./financiamento-regras";

function linha(
  id: string,
  valor: number,
  precoId: string,
  inicio: number,
  fim: number,
): LinhaDoFinanciamento {
  return { id, valor, precoId, inicio, fim };
}
function anual() {
  const original: FaturaDoFinanciamento = {
    id: "in_original",
    pagaEm: 1000,
    total: 59900,
    valorPago: 59900,
    saldoInicial: 0,
    saldoFinal: 0,
    capturas: [{ id: "ch_original", valor: 59900 }],
    linhas: [linha("il_original", 59900, "price_annual", 1000, 10000)],
  };
  const credito = linha("il_credito", -59900, "price_annual", 1000, 10000);
  credito.creditada = { faturaId: original.id, linhas: ["il_original"] };
  const aumento: FaturaDoFinanciamento = {
    id: "in_aumento",
    pagaEm: 1001,
    total: -47110,
    valorPago: 0,
    saldoInicial: 0,
    saldoFinal: -47110,
    capturas: [],
    linhas: [credito, linha("il_familia", 12790, "price_family", 1000, 2000)],
  };
  const renovacao: FaturaDoFinanciamento = {
    id: "in_renovacao",
    pagaEm: 2000,
    total: 12790,
    valorPago: 0,
    saldoInicial: -47110,
    saldoFinal: -34320,
    capturas: [],
    linhas: [linha("il_renovacao", 12790, "price_family", 2000, 3000)],
  };
  const captura: CapturaDoFinanciamento = {
    id: "ch_original",
    valorCapturado: 59900,
    valorEstornado: 0,
    contestada: false,
  };
  const movimentos: MovimentoDoFinanciamento[] = [
    {
      id: "cbtxn_credito",
      tipo: "applied_to_invoice",
      faturaId: aumento.id,
      valor: -47110,
      saldoFinal: -47110,
    },
    {
      id: "cbtxn_renovacao",
      tipo: "applied_to_invoice",
      faturaId: renovacao.id,
      valor: 12790,
      saldoFinal: -34320,
    },
  ];
  const entrada = {
    faturas: [original, aumento, renovacao],
    capturas: [captura],
    movimentos,
    saldoAtual: -34320,
  };
  return { entrada, original, aumento, renovacao, captura, credito };
}
function mensal() {
  const f = anual();
  f.original.total = 5990;
  f.original.valorPago = 5990;
  f.original.capturas = [{ id: "ch_original", valor: 5990 }];
  f.original.linhas = [linha("il_original", 5990, "price_individual", 1000, 2000)];
  f.credito.precoId = "price_individual";
  f.credito.fim = 2000;
  f.captura.valorCapturado = 5990;
  f.credito.valor = -5990;
  f.aumento.total = 6800;
  f.aumento.valorPago = 6800;
  f.aumento.saldoFinal = 0;
  f.aumento.capturas = [{ id: "ch_aumento", valor: 6800 }];
  f.entrada.capturas.push({
    id: "ch_aumento",
    valorCapturado: 6800,
    valorEstornado: 0,
    contestada: false,
  });
  f.entrada.faturas = [f.original, f.aumento];
  f.entrada.movimentos = [];
  f.entrada.saldoAtual = 0;
  return f;
}

describe("origem monetária dos períodos nativos", () => {
  it("rastreia os valores observados na API anual, incluindo renovação sem nova captura", () => {
    const f = anual(),
      antes = JSON.stringify(f.entrada),
      provas = comprovarFinanciamento(f.entrada);
    expect(provas).toEqual([
      {
        faturaId: "in_aumento",
        linhaId: "il_familia",
        precoId: "price_family",
        inicio: 1000,
        fimOriginal: 2000,
        cobertoAte: 2000,
        capturasDeOrigem: ["ch_original"],
        estado: "comprovado",
      },
      {
        faturaId: "in_original",
        linhaId: "il_original",
        precoId: "price_annual",
        inicio: 1000,
        fimOriginal: 10000,
        cobertoAte: 1000,
        capturasDeOrigem: ["ch_original"],
        estado: "comprovado",
      },
      {
        faturaId: "in_renovacao",
        linhaId: "il_renovacao",
        precoId: "price_family",
        inicio: 2000,
        fimOriginal: 3000,
        cobertoAte: 3000,
        capturasDeOrigem: ["ch_original"],
        estado: "comprovado",
      },
    ]);
    expect(JSON.stringify(f.entrada)).toBe(antes);
    expect(
      comprovarFinanciamento({ ...f.entrada, faturas: [...f.entrada.faturas].reverse() }),
    ).toEqual(provas);
  });
  it("estorno/contestação da captura anual afeta os períodos dependentes sem falsificar flags", () => {
    const f = anual();
    f.captura.valorEstornado = 59900;
    expect(comprovarFinanciamento(f.entrada).every((p) => p.estado === "revogado")).toBe(true);
    f.captura.valorEstornado = 0;
    f.captura.contestada = true;
    expect(comprovarFinanciamento(f.entrada).every((p) => p.estado === "revogado")).toBe(true);
    f.captura.contestada = false;
    expect(comprovarFinanciamento(f.entrada).every((p) => p.estado === "comprovado")).toBe(true);
  });
  it("proporcional mensal combina captura própria e origem do crédito; estorno anterior não passa despercebido", () => {
    const f = mensal();
    expect(
      comprovarFinanciamento(f.entrada).find((p) => p.faturaId === "in_aumento"),
    ).toMatchObject({ estado: "comprovado", capturasDeOrigem: ["ch_aumento", "ch_original"] });
    f.captura.valorEstornado = 5990;
    expect(comprovarFinanciamento(f.entrada).find((p) => p.faturaId === "in_aumento")?.estado).toBe(
      "revogado",
    );
  });
  it("estorno parcial fica em conferência sem ser rotulado como estorno total", () => {
    const f = mensal();
    f.captura.valorEstornado = 1000;
    expect(comprovarFinanciamento(f.entrada).find((p) => p.faturaId === "in_aumento")?.estado).toBe(
      "em_conferencia",
    );
  });
  it("esgotamento parcial do saldo soma nova captura; período posterior independente não herda estorno antigo", () => {
    const f = anual();
    let saldo = f.entrada.saldoAtual;
    for (let n = 2; n <= 4; n++) {
      const pago = n === 4 ? 4050 : 0,
        antes = saldo;
      saldo = saldo - 12790 + pago;
      const id = `in_renovacao${n}`,
        inicio = 1000 + n * 1000;
      f.entrada.faturas.push({
        id,
        pagaEm: inicio,
        total: 12790,
        valorPago: pago,
        saldoInicial: antes,
        saldoFinal: saldo,
        capturas: pago ? [{ id: "ch_parcial", valor: pago }] : [],
        linhas: [linha(`il_renovacao${n}`, 12790, "price_family", inicio, inicio + 1000)],
      });
      f.entrada.movimentos.push({
        id: `cbtxn_renovacao${n}`,
        tipo: "applied_to_invoice",
        faturaId: id,
        valor: saldo - antes,
        saldoFinal: saldo,
      });
    }
    expect(saldo).toBe(0);
    f.entrada.saldoAtual = 0;
    f.entrada.capturas.push(
      { id: "ch_parcial", valorCapturado: 4050, valorEstornado: 0, contestada: false },
      { id: "ch_nova", valorCapturado: 12790, valorEstornado: 0, contestada: false },
    );
    f.entrada.faturas.push({
      id: "in_nova",
      pagaEm: 6000,
      total: 12790,
      valorPago: 12790,
      saldoInicial: 0,
      saldoFinal: 0,
      capturas: [{ id: "ch_nova", valor: 12790 }],
      linhas: [linha("il_nova", 12790, "price_family", 6000, 7000)],
    });
    const comprovadas = comprovarFinanciamento(f.entrada);
    expect(comprovadas.find((p) => p.faturaId === "in_renovacao4")).toMatchObject({
      estado: "comprovado",
      capturasDeOrigem: ["ch_original", "ch_parcial"],
    });
    f.captura.valorEstornado = 59900;
    const revistas = comprovarFinanciamento(f.entrada);
    expect(revistas.find((p) => p.faturaId === "in_renovacao4")?.estado).toBe("revogado");
    expect(revistas.find((p) => p.faturaId === "in_nova")).toMatchObject({
      estado: "comprovado",
      capturasDeOrigem: ["ch_nova"],
    });
  });
  it("saldo de ajuste manual não vira captura e saldo/ledger incompletos recusam prova", () => {
    const f = anual(),
      movimento = f.entrada.movimentos[0];
    if (!movimento) throw new Error("Missing ledger fixture");
    movimento.tipo = "adjustment";
    expect(() => comprovarFinanciamento(f.entrada)).toThrow("ledger_sem_origem");
    movimento.tipo = "applied_to_invoice";
    expect(() => comprovarFinanciamento({ ...f.entrada, movimentos: [] })).toThrow(
      "saldo_final_divergente",
    );
    expect(() => comprovarFinanciamento({ ...f.entrada, saldoAtual: 0 })).toThrow(
      "saldo_final_divergente",
    );
  });
  it("a ordem é a do ledger do provedor, com continuidade, e não a dos IDs", () => {
    const f = anual();
    expect(() =>
      comprovarFinanciamento({ ...f.entrada, movimentos: [...f.entrada.movimentos].reverse() }),
    ).toThrow("ledger_descontinuo");
  });
  it("linha sem captura ou crédito sem referência não produz período", () => {
    const f = anual();
    expect(() => comprovarFinanciamento({ ...f.entrada, capturas: [] })).toThrow(
      "alocacao_sem_captura",
    );
    delete f.credito.creditada;
    expect(() => comprovarFinanciamento(f.entrada)).toThrow("credito_sem_referencia_exata");
  });
  it("não credita novamente o mesmo dinheiro ou outra linha/intervalo", () => {
    const f = mensal();
    f.credito.valor = -5991;
    f.aumento.total = 6799;
    f.aumento.valorPago = 6799;
    f.aumento.capturas = [{ id: "ch_aumento", valor: 6799 }];
    expect(() => comprovarFinanciamento(f.entrada)).toThrow("credito_reutilizado");
    const g = anual();
    g.credito.creditada = { faturaId: g.original.id, linhas: ["il_familia"] };
    expect(() => comprovarFinanciamento(g.entrada)).toThrow("linha_creditada_inconsistente");
    const h = anual();
    h.credito.fim = 10001;
    expect(() => comprovarFinanciamento(h.entrada)).toThrow("linha_creditada_inconsistente");
  });
  it("alocação duplicada de uma captura não financia duas faturas", () => {
    const f = mensal();
    f.aumento.capturas = [{ id: "ch_original", valor: 6800 }];
    expect(() => comprovarFinanciamento(f.entrada)).toThrow("captura_reutilizada");
  });
  it("ciclo de referências não fabrica dinheiro em faturas de valor zero", () => {
    const a = linha("il_a", 5990, "price_same", 1000, 2000),
      b = linha("il_b", 5990, "price_same", 1000, 2000);
    const ca = linha("il_ca", -5990, "price_same", 1000, 2000),
      cb = linha("il_cb", -5990, "price_same", 1000, 2000);
    ca.creditada = { faturaId: "in_b", linhas: [b.id] };
    cb.creditada = { faturaId: "in_a", linhas: [a.id] };
    const base = {
      pagaEm: 1000,
      total: 0,
      valorPago: 0,
      saldoInicial: 0,
      saldoFinal: 0,
      capturas: [],
    };
    expect(() =>
      comprovarFinanciamento({
        capturas: [],
        movimentos: [],
        saldoAtual: 0,
        faturas: [
          { ...base, id: "in_a", linhas: [a, ca] },
          { ...base, id: "in_b", linhas: [b, cb] },
        ],
      }),
    ).toThrow("ciclo_de_financiamento");
  });
  it("valores não inteiros e histórico excessivo exigem conferência", () => {
    const f = anual();
    f.captura.valorCapturado = Number.NaN;
    expect(() => comprovarFinanciamento(f.entrada)).toThrow("valor_inteiro");
    expect(() =>
      comprovarFinanciamento({
        ...f.entrada,
        faturas: Array.from({ length: 601 }, () => f.original),
      }),
    ).toThrow("limite_de_historico");
  });
});
