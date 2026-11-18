/** Native invoice/customer-balance funding. Inputs are scoped provider facts,
 * not browser requests. No clock, I/O, database or inferred payment is used. */
export type CapturaDoFinanciamento = {
  id: string;
  valorCapturado: number;
  valorEstornado: number;
  contestada: boolean;
};
export type LinhaDoFinanciamento = {
  id: string;
  precoId: string;
  valor: number;
  inicio: number;
  fim: number;
  creditada?: { faturaId: string; linhas: readonly string[] };
};
export type FaturaDoFinanciamento = {
  id: string;
  pagaEm: number;
  total: number;
  valorPago: number;
  saldoInicial: number;
  saldoFinal: number;
  capturas: readonly { id: string; valor: number }[];
  linhas: readonly LinhaDoFinanciamento[];
};
export type MovimentoDoFinanciamento = {
  id: string;
  tipo: string;
  faturaId: string;
  valor: number;
  saldoFinal: number;
};
export type ProvaDoPeriodoFinanciado = {
  faturaId: string;
  linhaId: string;
  precoId: string;
  inicio: number;
  fimOriginal: number;
  cobertoAte: number;
  capturasDeOrigem: readonly string[];
  estado: "comprovado" | "revogado" | "em_conferencia";
};
export class FinanciamentoInconclusivo extends Error {
  constructor(readonly motivo: string) {
    super(`A origem financeira exige conferência: ${motivo}`);
    this.name = "FinanciamentoInconclusivo";
  }
}
const MAX_FACTS = 600;
function conferir(valor: unknown, motivo: string): asserts valor {
  if (!valor) throw new FinanciamentoInconclusivo(motivo);
}
function inteiro(valor: number) {
  conferir(Number.isSafeInteger(valor), "valor_inteiro");
  return valor;
}
function identidade(valor: string) {
  conferir(typeof valor === "string" && valor.length >= 2 && valor.length <= 256, "identidade");
}
function unir(...conjuntos: readonly ReadonlySet<string>[]) {
  return new Set(conjuntos.flatMap((c) => [...c]));
}

/** The complete balance ledger must be supplied in provider order, oldest
 * first, starting at zero. Equal timestamps never invent an order by IDs.
 * A partially consumed aggregate balance conservatively retains every origin
 * until zero: the ledger does not attribute each cent to a particular charge. */
export function comprovarFinanciamento(entrada: {
  faturas: readonly FaturaDoFinanciamento[];
  capturas: readonly CapturaDoFinanciamento[];
  movimentos: readonly MovimentoDoFinanciamento[];
  saldoAtual: number;
}): ProvaDoPeriodoFinanciado[] {
  conferir(
    entrada.faturas.length <= MAX_FACTS &&
      entrada.capturas.length <= MAX_FACTS &&
      entrada.movimentos.length <= MAX_FACTS,
    "limite_de_historico",
  );
  const faturas = new Map<string, FaturaDoFinanciamento>();
  const capturas = new Map<string, CapturaDoFinanciamento>();
  const linhas = new Map<string, { fatura: FaturaDoFinanciamento; linha: LinhaDoFinanciamento }>();
  const alocadas = new Map<string, number>();
  const creditadas = new Map<string, number>();
  const retirada = new Map<string, number>();
  const indices = new Map<string, number>();
  const movimentos = new Set<string>();
  let totalDeLinhas = 0;
  let totalDeAlocacoes = 0;
  for (const captura of entrada.capturas) {
    identidade(captura.id);
    conferir(
      !capturas.has(captura.id) &&
        inteiro(captura.valorCapturado) > 0 &&
        inteiro(captura.valorEstornado) >= 0 &&
        captura.valorEstornado <= captura.valorCapturado,
      "captura_inconsistente",
    );
    capturas.set(captura.id, captura);
  }
  for (const fatura of entrada.faturas) {
    identidade(fatura.id);
    conferir(
      !faturas.has(fatura.id) &&
        inteiro(fatura.pagaEm) > 0 &&
        fatura.linhas.length <= MAX_FACTS &&
        fatura.capturas.length <= MAX_FACTS,
      "fatura_inconsistente",
    );
    conferir(
      inteiro(fatura.valorPago) >= 0 &&
        inteiro(fatura.saldoInicial) <= 0 &&
        inteiro(fatura.saldoFinal) <= 0,
      "saldo_ou_pagamento_inconsistente",
    );
    let soma = 0,
      pago = 0;
    const usadas = new Set<string>();
    for (const alocacao of fatura.capturas) {
      conferir(++totalDeAlocacoes <= MAX_FACTS * 4, "limite_de_alocacoes");
      const captura = capturas.get(alocacao.id);
      conferir(
        captura && !usadas.has(alocacao.id) && inteiro(alocacao.valor) > 0,
        "alocacao_sem_captura",
      );
      usadas.add(alocacao.id);
      pago = inteiro(pago + alocacao.valor);
      const total = inteiro((alocadas.get(alocacao.id) ?? 0) + alocacao.valor);
      conferir(total <= captura.valorCapturado, "captura_reutilizada");
      alocadas.set(alocacao.id, total);
    }
    for (const linha of fatura.linhas) {
      conferir(++totalDeLinhas <= MAX_FACTS * 4, "limite_de_linhas");
      identidade(linha.id);
      identidade(linha.precoId);
      conferir(
        !linhas.has(linha.id) && inteiro(linha.inicio) > 0 && inteiro(linha.fim) > linha.inicio,
        "linha_inconsistente",
      );
      soma = inteiro(soma + inteiro(linha.valor));
      linhas.set(linha.id, { fatura, linha });
      conferir(linha.valor < 0 === (linha.creditada !== undefined), "credito_sem_referencia_exata");
    }
    conferir(
      pago === fatura.valorPago &&
        soma === inteiro(fatura.total) &&
        inteiro(fatura.saldoFinal - fatura.saldoInicial) ===
          inteiro(fatura.total - fatura.valorPago),
      "fatura_nao_financiada_por_inteiro",
    );
    faturas.set(fatura.id, fatura);
  }
  // The complete ordered ledger proves balance creation and consumption; a
  // manual adjustment/credit note is not silently promoted to captured money.
  let saldo = 0;
  for (const [indice, movimento] of entrada.movimentos.entries()) {
    identidade(movimento.id);
    const fatura = faturas.get(movimento.faturaId);
    conferir(
      !movimentos.has(movimento.id) &&
        movimento.tipo === "applied_to_invoice" &&
        fatura &&
        !indices.has(fatura.id),
      "ledger_sem_origem_unica",
    );
    conferir(
      fatura.saldoInicial === saldo &&
        inteiro(movimento.valor) === fatura.saldoFinal - saldo &&
        inteiro(movimento.saldoFinal) === fatura.saldoFinal,
      "ledger_descontinuo",
    );
    saldo = inteiro(saldo + movimento.valor);
    conferir(saldo <= 0, "saldo_devedor_nao_financiado");
    movimentos.add(movimento.id);
    indices.set(fatura.id, indice);
  }
  conferir(saldo === inteiro(entrada.saldoAtual), "saldo_final_divergente");
  for (const fatura of faturas.values()) {
    conferir(
      fatura.saldoInicial === fatura.saldoFinal || indices.has(fatura.id),
      "fatura_sem_ledger",
    );
    for (const credito of fatura.linhas) {
      if (!credito.creditada) continue;
      const origem = faturas.get(credito.creditada.faturaId);
      conferir(
        origem &&
          origem.pagaEm <= fatura.pagaEm &&
          credito.creditada.linhas.length > 0 &&
          credito.creditada.linhas.length <= MAX_FACTS &&
          new Set(credito.creditada.linhas).size === credito.creditada.linhas.length,
        "origem_do_credito_ausente",
      );
      // The native one-item offer admits one original positive line per credit.
      // Multiple sources require explicit allocation, never an invented split.
      conferir(credito.creditada.linhas.length === 1, "credito_com_alocacao_ambigua");
      const origemId = credito.creditada.linhas[0];
      const original = origemId ? linhas.get(origemId) : undefined;
      conferir(
        original &&
          original.fatura.id === origem.id &&
          original.linha.valor > 0 &&
          original.linha.precoId === credito.precoId &&
          credito.fim === original.linha.fim &&
          credito.inicio >= original.linha.inicio,
        "linha_creditada_inconsistente",
      );
      const total = inteiro((creditadas.get(original.linha.id) ?? 0) - credito.valor);
      conferir(total <= original.linha.valor, "credito_reutilizado");
      creditadas.set(original.linha.id, total);
      retirada.set(
        original.linha.id,
        Math.min(retirada.get(original.linha.id) ?? original.linha.fim, credito.inicio),
      );
    }
  }

  const origens = new Map<string, ReadonlySet<string>>();
  const resolvendo = new Set<string>();
  const saldos = new Map<number, ReadonlySet<string>>();
  const resolvendoSaldo = new Set<number>();
  function origensDoSaldo(indice: number): ReadonlySet<string> {
    if (indice < 0) return new Set();
    const pronta = saldos.get(indice);
    if (pronta) return pronta;
    conferir(!resolvendoSaldo.has(indice), "ciclo_no_ledger");
    resolvendoSaldo.add(indice);
    const movimento = entrada.movimentos[indice];
    conferir(movimento, "movimento_ausente");
    const anteriores = origensDoSaldo(indice - 1);
    const atuais = origensDaFatura(movimento.faturaId);
    const resultado =
      movimento.saldoFinal === 0
        ? new Set<string>()
        : movimento.valor < 0
          ? unir(anteriores, atuais)
          : anteriores;
    conferir(movimento.saldoFinal === 0 || resultado.size > 0, "saldo_sem_captura");
    saldos.set(indice, resultado);
    resolvendoSaldo.delete(indice);
    return resultado;
  }
  function origensDaFatura(faturaId: string): ReadonlySet<string> {
    const pronta = origens.get(faturaId);
    if (pronta) return pronta;
    conferir(!resolvendo.has(faturaId), "ciclo_de_financiamento");
    resolvendo.add(faturaId);
    const fatura = faturas.get(faturaId);
    conferir(fatura, "fatura_de_origem_ausente");
    let fontes = new Set(fatura.capturas.map((c) => c.id));
    for (const linha of fatura.linhas) {
      if (linha.creditada) fontes = unir(fontes, origensDaFatura(linha.creditada.faturaId));
    }
    const indice = indices.get(faturaId);
    if (fatura.saldoFinal > fatura.saldoInicial) {
      conferir(indice !== undefined, "consumo_sem_ledger");
      fontes = unir(fontes, origensDoSaldo(indice - 1));
    }
    conferir(
      (fatura.total === 0 && !fatura.linhas.some((l) => l.valor > 0)) || fontes.size > 0,
      "periodo_sem_captura",
    );
    origens.set(faturaId, fontes);
    resolvendo.delete(faturaId);
    return fontes;
  }
  const provas: ProvaDoPeriodoFinanciado[] = [];
  for (const fatura of faturas.values()) {
    const fontes = origensDaFatura(fatura.id);
    let estado: ProvaDoPeriodoFinanciado["estado"] = "comprovado";
    for (const fonte of fontes) {
      const captura = capturas.get(fonte);
      conferir(captura, "captura_de_origem_ausente");
      if (captura.contestada || captura.valorEstornado === captura.valorCapturado)
        estado = "revogado";
      else if (captura.valorEstornado > 0 && estado !== "revogado") estado = "em_conferencia";
    }
    for (const linha of fatura.linhas) {
      if (linha.valor <= 0) continue;
      provas.push({
        faturaId: fatura.id,
        linhaId: linha.id,
        precoId: linha.precoId,
        inicio: linha.inicio,
        fimOriginal: linha.fim,
        cobertoAte: retirada.get(linha.id) ?? linha.fim,
        capturasDeOrigem: [...fontes].sort(),
        estado,
      });
    }
  }
  // Resolve all ledger entries, including an unconsumed final credit.
  if (entrada.movimentos.length) origensDoSaldo(entrada.movimentos.length - 1);
  return provas.sort(
    (a, b) => a.faturaId.localeCompare(b.faturaId) || a.linhaId.localeCompare(b.linhaId),
  );
}
