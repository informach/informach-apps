/** Estrelas, reais e metas. Funções puras; o saldo vem do extrato no banco. */

export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function estrelasEmReais(estrelas: number, estrelasPorReal: number): string {
  return brl(Math.floor((estrelas * 100) / estrelasPorReal));
}

export function rotuloEstrelas(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? "estrela" : "estrelas"}`;
}

/** Quanto custa em estrelas um item de dinheiro, na taxa da casa. */
export function precoEmEstrelas(centavos: number, estrelasPorReal: number): number {
  return Math.round((centavos * estrelasPorReal) / 100);
}

/** Estrelas de uma meta a partir do preço em reais. */
export function estrelasDaMeta(reais: number, estrelasPorReal: number): number {
  return Math.max(1, Math.round(reais * estrelasPorReal));
}

/**
 * Previsão da meta pela média de estrelas ganhas nos últimos 7 dias (tarefas,
 * bônus e baú). Até 7 dias a previsão sai em dias; acima disso, em semanas.
 */
export function previsaoDaMeta(faltam: number, ganhasNa7Dias: number): string | null {
  if (faltam <= 0) return "Você conseguiu!";
  const ritmo = ganhasNa7Dias / 7;
  if (ritmo <= 0) return null;
  const dias = Math.ceil(faltam / ritmo);
  if (dias <= 1) return "falta 1 dia";
  if (dias <= 7) return `faltam uns ${dias} dias`;
  const semanas = Math.ceil(dias / 7);
  return semanas === 1 ? "falta 1 semana" : `faltam umas ${semanas} semanas`;
}

/** Saldo livre = saldo − estrelas guardadas em pedidos ainda não resolvidos. */
export function saldoLivre(saldo: number, guardadas: number) {
  return Math.max(0, saldo - guardadas);
}
