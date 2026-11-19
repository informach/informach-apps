import { z } from "zod";
import type { criarArmazenamentoDoLivro } from "./armazenamento";
import { type criarAssinaturaDoLivro, resumoDoRegistro } from "./assinatura";
import { FalhaDoLivroDeDireitos } from "./contrato";
import { conferirPrefixoDoLivro } from "./leitura";

/** Conciliação antes de tentar CAS. Uma intenção já admitida pode não ser a
 * última do livro; só buscar a cabeça repetiria o consentimento após crash.
 * Não inicializa livros ausentes nem executa efeitos nativos. */
export async function admitirIntencaoNoLivro(config: {
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  bytes: Uint8Array;
  instante: string;
  signal?: AbortSignal;
}) {
  const { storage, assinatura, instante } = config;
  if (!z.iso.datetime({ precision: 3 }).safeParse(instante).success)
    throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
  const bytes = Buffer.from(config.bytes),
    assinada = assinatura.lerIntencaoAssinada(bytes),
    doc = assinada.documento;
  const signal = config.signal
    ? AbortSignal.any([config.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
  const prova = await conferirPrefixoDoLivro({
    storage,
    maxEntradas: 100_000,
    tempoLimiteMs: 30_000,
    signal,
  });
  const head = prova.cabecalho,
    antes = head.documento;
  if (antes.estado !== "aberto") throw new FalhaDoLivroDeDireitos("CONGELADO");
  if (antes.livroId !== doc.livroId || head.chaveId !== assinatura.chaveAtiva)
    throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
  const sha256 = resumoDoRegistro(bytes),
    ref = { operacaoId: doc.operacaoId, revisao: doc.revisao, sha256 };
  const existente = prova.referencias.find((r) => r.operacaoId === doc.operacaoId);
  if (existente) {
    if (existente.revisao !== ref.revisao || existente.sha256 !== sha256)
      throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
    return { referencia: ref, cabecalhoSha256: head.sha256, jaAdmitida: true };
  }
  if (antes.entradas >= 100_000) throw new FalhaDoLivroDeDireitos("LIMITE");
  if (
    doc.epoca !== antes.epoca ||
    assinada.chaveId !== head.chaveId ||
    head.chaveId !== assinatura.chaveAtiva
  )
    throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
  if (Date.parse(instante) < Date.parse(doc.consentidaEm))
    throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  await storage.publicarIntencao(bytes, signal);
  const atualizadoEm =
    Date.parse(instante) >= Date.parse(antes.atualizadoEm) ? instante : antes.atualizadoEm;
  const proximo = assinatura.assinarCabecalho({
    ...antes,
    geracao: antes.geracao + 1,
    entradas: antes.entradas + 1,
    raizSha256: resumoDoRegistro(Buffer.from(JSON.stringify([antes.raizSha256, sha256]))),
    anteriorSha256: head.sha256,
    ultimaIntencao: ref,
    atualizadoEm,
  });
  const admitido = await storage.trocarCabecalho(head, proximo, signal);
  return { referencia: ref, cabecalhoSha256: admitido.sha256, jaAdmitida: false };
}
