import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { criarArmazenamentoDoLivro } from "./armazenamento";
import { resumoDoRegistro } from "./assinatura";
import {
  FalhaDoLivroDeDireitos,
  type IntencaoDeDireitos,
  type ReferenciaDaIntencao,
} from "./contrato";

type Armazenamento = ReturnType<typeof criarArmazenamentoDoLivro>;
interface Limites {
  maxEntradas: number;
  tempoLimiteMs: number;
  signal?: AbortSignal;
}
async function comPrazo<T>(config: Limites, executar: (signal: AbortSignal) => Promise<T>) {
  if (
    !Number.isSafeInteger(config.maxEntradas) ||
    config.maxEntradas < 0 ||
    config.maxEntradas > 100_000 ||
    !Number.isSafeInteger(config.tempoLimiteMs) ||
    config.tempoLimiteMs < 1 ||
    config.tempoLimiteMs > 900_000
  )
    throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
  const externo = config.signal;
  const c = new AbortController(),
    cancelar = () => c.abort();
  externo?.addEventListener("abort", cancelar, { once: true });
  if (externo?.aborted) cancelar();
  const timer = setTimeout(cancelar, config.tempoLimiteMs);
  timer.unref();
  try {
    if (c.signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
    const resultado = await executar(c.signal);
    if (c.signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
    return resultado;
  } finally {
    clearTimeout(timer);
    externo?.removeEventListener("abort", cancelar);
    c.abort();
  }
}
async function conferir(storage: Armazenamento, max: number, signal: AbortSignal) {
  const inicial = await storage.lerCabecalho(signal),
    refs: ReferenciaDaIntencao[] = [],
    vistos = new Set<string>();
  if (inicial.documento.entradas > max || inicial.documento.geracao > max + 31)
    throw new FalhaDoLivroDeDireitos("LIMITE");
  // O próprio ponteiro corrente também deve ter sua cópia imutável.
  await storage.lerHistorico(inicial.documento.geracao, inicial.sha256, signal);
  let atual = inicial;
  while (atual.documento.geracao > 0) {
    if (signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
    const doc = atual.documento;
    if (!doc.anteriorSha256) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
    const anterior = await storage.lerHistorico(doc.geracao - 1, doc.anteriorSha256, signal),
      antes = anterior.documento;
    if (Date.parse(antes.atualizadoEm) > Date.parse(doc.atualizadoEm))
      throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
    const mesmaRaiz =
      doc.entradas === antes.entradas &&
      doc.raizSha256 === antes.raizSha256 &&
      isDeepStrictEqual(doc.ultimaIntencao, antes.ultimaIntencao);
    if (doc.epoca === antes.epoca + 1 && doc.estado === "aberto" && antes.estado === "congelado") {
      if (
        !mesmaRaiz ||
        atual.chaveId === anterior.chaveId ||
        doc.retomada?.cercaSha256 !== doc.anteriorSha256 ||
        !isDeepStrictEqual(doc.chavesUtilizadas, [...antes.chavesUtilizadas, atual.chaveId])
      )
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
    } else {
      if (
        doc.epoca !== antes.epoca ||
        antes.estado !== "aberto" ||
        atual.chaveId !== anterior.chaveId ||
        !isDeepStrictEqual(doc.chavesUtilizadas, antes.chavesUtilizadas) ||
        !isDeepStrictEqual(doc.retomada, antes.retomada)
      )
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      if (doc.estado === "congelado") {
        if (!mesmaRaiz) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      } else {
        const ref = doc.ultimaIntencao;
        if (
          !ref ||
          doc.entradas !== antes.entradas + 1 ||
          doc.raizSha256 !==
            resumoDoRegistro(Buffer.from(JSON.stringify([antes.raizSha256, ref.sha256])))
        )
          throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        const chave = `${ref.operacaoId}:${ref.revisao}`;
        if (vistos.has(chave)) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        vistos.add(chave);
        const assinada = await storage.lerIntencaoAssinadaReferencia(ref, signal);
        if (assinada.chaveId !== atual.chaveId || assinada.documento.epoca !== doc.epoca)
          throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        refs.push(Object.freeze({ ...ref }));
      }
    }
    atual = anterior;
  }
  if (refs.length !== inicial.documento.entradas) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  return { cabecalho: inicial, referencias: Object.freeze(refs.reverse()) };
}
/** Prefixo autêntico observado, também útil para conciliar uma resposta
 * perdida. Não afirma que o livro esteja fechado nem autoriza efeitos locais. */
export function conferirPrefixoDoLivro(config: Limites & { storage: Armazenamento }) {
  const { storage, maxEntradas, tempoLimiteMs, signal } = config;
  return comPrazo({ maxEntradas, tempoLimiteMs, signal }, (s) => conferir(storage, maxEntradas, s));
}
/** Primeiro verifica a cadeia inteira; só depois chama o consumidor em ordem.
 * O consumidor deve manter o destino isolado e idempotência por op/revisão.
 * Erro do consumidor conserva identidade e não é reclassificado como I/O. */
export function reaplicarLivroCongelado(
  config: Limites & {
    storage: Armazenamento;
    aplicar: (
      intencao: IntencaoDeDireitos,
      contexto: { sequencia: number; sha256: string; signal: AbortSignal },
    ) => Promise<void>;
  },
) {
  const { storage, aplicar, maxEntradas, tempoLimiteMs, signal: externo } = config;
  return comPrazo({ maxEntradas, tempoLimiteMs, signal: externo }, async (signal) => {
    const prova = await conferir(storage, maxEntradas, signal);
    if (prova.cabecalho.documento.estado !== "congelado")
      throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
    const mesmaCerca = async () => {
      const atual = await storage.lerCabecalho(signal);
      if (atual.sha256 !== prova.cabecalho.sha256 || atual.documento.estado !== "congelado")
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
    };
    await mesmaCerca();
    let sequencia = 0;
    for (const ref of prova.referencias) {
      if (signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
      const intencao = await storage.lerIntencaoReferencia(ref, signal);
      await aplicar(intencao, { sequencia: ++sequencia, sha256: ref.sha256, signal });
      if (signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
    }
    await mesmaCerca();
    return {
      livroId: prova.cabecalho.documento.livroId,
      cabecalhoSha256: prova.cabecalho.sha256,
      geracao: prova.cabecalho.documento.geracao,
      entradasReaplicadas: sequencia,
      congelado: true as const,
    };
  });
}
