import "server-only";
import { Readable } from "node:stream";
import { isDeepStrictEqual } from "node:util";
import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { type criarAssinaturaDoLivro, MAX_REGISTRO, resumoDoRegistro } from "./assinatura";
import {
  type CabecalhoDeDireitos,
  FalhaDoLivroDeDireitos,
  RAIZ_VAZIA,
  ReferenciaDaIntencaoSchema,
  ShaDoLivroSchema,
} from "./contrato";
import { lerPlanoExterno, MAX_PLANO_EXTERNO } from "./plano-externo";

export interface CabecalhoLido {
  readonly documento: Readonly<CabecalhoDeDireitos>;
  readonly sha256: string;
  readonly chaveId: string;
}
function falha(erro: unknown): never {
  if (erro instanceof FalhaDoLivroDeDireitos) throw erro;
  if (erro instanceof S3ServiceException) {
    if ([401, 403].includes(erro.$metadata.httpStatusCode ?? 0) || erro.name === "NoSuchBucket")
      throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
    if (erro.name === "NoSuchKey" && erro.$metadata.httpStatusCode === 404)
      throw new FalhaDoLivroDeDireitos("AUSENTE");
  }
  throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
}
const condicional = (e: unknown) =>
  e instanceof S3ServiceException && [409, 412].includes(e.$metadata.httpStatusCode ?? 0);

/** Porta privada do livro. Não possui DELETE, LIST, URL/chave livres nem
 * inicialização implícita. ETag serve somente à precondição; o MAC e os
 * bytes relidos provam conteúdo. Toda tentativa tem uma única escrita SDK. */
export function criarArmazenamentoDoLivro(config: {
  cliente: S3Client;
  bucket: string;
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  tempoLimiteMs: number;
}) {
  const { cliente, bucket, assinatura, tempoLimiteMs } = config;
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    !Number.isSafeInteger(tempoLimiteMs) ||
    tempoLimiteMs < 1 ||
    tempoLimiteMs > 30_000
  )
    throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
  const prefixo = `recreio/v1/direitos/${assinatura.livroId}/`,
    caminho = `${prefixo}cabecalho.json`,
    capacidades = new WeakMap<CabecalhoLido, { bytes: Buffer; etag: string; escrita: boolean }>();
  function emitir(bytes: Buffer, etag: string, escrita = true): CabecalhoLido {
    const { documento, chaveId } = assinatura.lerCabecalhoAssinado(bytes);
    if (documento.ultimaIntencao) Object.freeze(documento.ultimaIntencao);
    if (documento.retomada) Object.freeze(documento.retomada);
    Object.freeze(documento.chavesUtilizadas);
    const leitura = Object.freeze({
      documento: Object.freeze(documento),
      sha256: resumoDoRegistro(bytes),
      chaveId,
    });
    capacidades.set(leitura, { bytes: Buffer.from(bytes), etag, escrita });
    return leitura;
  }
  async function comPrazo<T>(fn: (signal: AbortSignal) => Promise<T>, externo?: AbortSignal) {
    if ((await cliente.config.maxAttempts()) !== 1)
      throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
    const c = new AbortController(),
      cancelar = () => c.abort();
    externo?.addEventListener("abort", cancelar, { once: true });
    if (externo?.aborted) cancelar();
    const timer = setTimeout(cancelar, tempoLimiteMs);
    timer.unref();
    try {
      if (c.signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
      return await fn(c.signal);
    } catch (erro) {
      return falha(erro);
    } finally {
      clearTimeout(timer);
      externo?.removeEventListener("abort", cancelar);
      c.abort();
    }
  }
  async function get(key: string, signal: AbortSignal, limite = MAX_REGISTRO) {
    const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: signal,
      }),
      body = r.Body;
    if (!(body instanceof Readable)) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
    const cancelar = () => body.destroy(new Error("rights_ledger.deadline"));
    signal.addEventListener("abort", cancelar, { once: true });
    try {
      if (signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
      if (
        r.$metadata.httpStatusCode !== 200 ||
        r.ContentType !== "application/json" ||
        !Number.isSafeInteger(r.ContentLength) ||
        !r.ContentLength ||
        r.ContentLength > limite ||
        r.ContentRange ||
        r.ContentEncoding ||
        !r.ETag ||
        r.ETag.length > 256 ||
        !/^"[!-~]{1,250}"$/.test(r.ETag)
      )
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      const partes: Buffer[] = [];
      let n = 0;
      for await (const b of body) {
        if (!(b instanceof Uint8Array) || signal.aborted)
          throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
        n += b.byteLength;
        if (n > r.ContentLength || n > limite) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        partes.push(Buffer.from(b));
      }
      if (n !== r.ContentLength) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      if (signal.aborted) throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
      return { bytes: Buffer.concat(partes, n), etag: r.ETag };
    } finally {
      signal.removeEventListener("abort", cancelar);
      body.destroy();
    }
  }
  async function guardarIntencao(bytes: Buffer, signal: AbortSignal) {
    const i = assinatura.lerIntencao(bytes),
      key = `${prefixo}intencoes/${i.operacaoId}-${i.revisao}.json`;
    let erroDaEscrita: unknown;
    try {
      await cliente.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: "application/json",
          IfNoneMatch: "*",
        }),
        { abortSignal: signal },
      );
    } catch (erro) {
      erroDaEscrita = erro;
    }
    const lida = await get(key, signal);
    assinatura.lerIntencao(lida.bytes);
    if (!lida.bytes.equals(bytes)) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
    // Inclusive resposta perdida: a prova é o registro exato relido, não o PUT.
    if (
      erroDaEscrita instanceof S3ServiceException &&
      [401, 403].includes(erroDaEscrita.$metadata.httpStatusCode ?? 0)
    )
      falha(erroDaEscrita);
    return { operacaoId: i.operacaoId, revisao: i.revisao, sha256: resumoDoRegistro(bytes) };
  }
  const caminhoHistorico = (geracao: number, sha: string) =>
    `${prefixo}historico/${String(geracao).padStart(16, "0")}-${sha}.json`;
  async function guardarHistorico(bytes: Buffer, signal: AbortSignal) {
    const h = assinatura.lerCabecalho(bytes),
      key = caminhoHistorico(h.geracao, resumoDoRegistro(bytes));
    try {
      await cliente.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: "application/json",
          IfNoneMatch: "*",
        }),
        { abortSignal: signal },
      );
    } catch (erro) {
      if (!condicional(erro)) falha(erro);
    }
    const lido = await get(key, signal);
    assinatura.lerCabecalho(lido.bytes);
    if (!lido.bytes.equals(bytes)) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  }
  async function compararETrocar(
    bytes: Buffer,
    etag: string,
    signal: AbortSignal,
    congelando = false,
  ) {
    await guardarHistorico(bytes, signal);
    let falhou = false,
      concorrencia = false;
    try {
      await cliente.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: caminho,
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: "application/json",
          IfMatch: etag,
        }),
        { abortSignal: signal },
      );
    } catch (erro) {
      if (
        erro instanceof S3ServiceException &&
        ([401, 403].includes(erro.$metadata.httpStatusCode ?? 0) || erro.name === "NoSuchBucket")
      )
        falha(erro);
      falhou = true;
      concorrencia = condicional(erro);
    }
    const lido = await get(caminho, signal);
    const observado = assinatura.lerCabecalho(lido.bytes);
    if (congelando && observado.estado === "congelado") return emitir(lido.bytes, lido.etag);
    if (lido.bytes.equals(bytes)) return emitir(lido.bytes, lido.etag);
    if (concorrencia || !falhou) throw new FalhaDoLivroDeDireitos("CONCORRENCIA");
    throw new FalhaDoLivroDeDireitos("INCONCLUSIVO");
  }
  return {
    prefixo,
    /** Objeto imutável endereçado pelo SHA autenticado da intenção. Não admite
     * chaves livres, LIST/DELETE, compressão ou leitura ilimitada. */
    publicarPlano(sha256: string, entrada: Uint8Array, signal?: AbortSignal) {
      if (entrada.byteLength < 1 || entrada.byteLength > MAX_PLANO_EXTERNO)
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      const bytes = Buffer.from(entrada);
      try {
        lerPlanoExterno(bytes, sha256);
      } catch (erro) {
        bytes.fill(0);
        throw erro;
      }
      return comPrazo(async (s) => {
        const key = `${prefixo}planos/${sha256}.json`;
        let escrita: unknown;
        try {
          await cliente.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: bytes,
              ContentLength: bytes.length,
              ContentType: "application/json",
              IfNoneMatch: "*",
            }),
            { abortSignal: s },
          );
        } catch (erro) {
          escrita = erro;
        }
        const lido = await get(key, s, MAX_PLANO_EXTERNO);
        try {
          lerPlanoExterno(lido.bytes, sha256);
          if (!lido.bytes.equals(bytes)) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
          if (
            escrita instanceof S3ServiceException &&
            [401, 403].includes(escrita.$metadata.httpStatusCode ?? 0)
          )
            falha(escrita);
        } finally {
          lido.bytes.fill(0);
        }
      }, signal).finally(() => bytes.fill(0));
    },
    lerPlano(sha256: string, signal?: AbortSignal) {
      if (!ShaDoLivroSchema.safeParse(sha256).success)
        throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      return comPrazo(async (s) => {
        const r = await get(`${prefixo}planos/${sha256}.json`, s, MAX_PLANO_EXTERNO);
        try {
          return lerPlanoExterno(r.bytes, sha256);
        } finally {
          r.bytes.fill(0);
        }
      }, signal);
    },
    lerCabecalho(signal?: AbortSignal) {
      return comPrazo(async (s) => {
        const r = await get(caminho, s);
        return emitir(r.bytes, r.etag);
      }, signal);
    },
    /** Somente composição operacional explícita, nunca fallback de leitura. */
    iniciarCabecalho(entrada: Uint8Array, signal?: AbortSignal) {
      const bytes = Buffer.from(entrada),
        doc = assinatura.lerCabecalho(bytes);
      if (
        doc.estado !== "aberto" ||
        doc.geracao !== 0 ||
        doc.entradas !== 0 ||
        doc.raizSha256 !== RAIZ_VAZIA
      )
        throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      return comPrazo(async (s) => {
        await guardarHistorico(bytes, s);
        let perdeu = false;
        try {
          await cliente.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: caminho,
              Body: bytes,
              ContentLength: bytes.length,
              ContentType: "application/json",
              IfNoneMatch: "*",
            }),
            { abortSignal: s },
          );
        } catch (erro) {
          if (condicional(erro)) perdeu = true;
          else falha(erro);
        }
        const lido = await get(caminho, s);
        if (!lido.bytes.equals(bytes))
          throw new FalhaDoLivroDeDireitos(perdeu ? "CONCORRENCIA" : "INTEGRIDADE");
        return emitir(lido.bytes, lido.etag);
      }, signal);
    },
    lerHistorico(geracao: number, sha256: string, signal?: AbortSignal) {
      if (
        !Number.isSafeInteger(geracao) ||
        geracao < 0 ||
        !ShaDoLivroSchema.safeParse(sha256).success
      )
        throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      return comPrazo(async (s) => {
        const r = await get(caminhoHistorico(geracao, sha256), s),
          doc = assinatura.lerCabecalho(r.bytes);
        if (resumoDoRegistro(r.bytes) !== sha256 || doc.geracao !== geracao)
          throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        return emitir(r.bytes, r.etag, false);
      }, signal);
    },
    lerIntencaoReferencia(entrada: unknown, signal?: AbortSignal) {
      const p = ReferenciaDaIntencaoSchema.safeParse(entrada);
      if (!p.success) throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      const ref = p.data;
      return comPrazo(async (s) => {
        const r = await get(`${prefixo}intencoes/${ref.operacaoId}-${ref.revisao}.json`, s),
          doc = assinatura.lerIntencao(r.bytes);
        if (
          doc.operacaoId !== ref.operacaoId ||
          doc.revisao !== ref.revisao ||
          resumoDoRegistro(r.bytes) !== ref.sha256
        )
          throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        return doc;
      }, signal);
    },
    lerIntencaoAssinadaReferencia(entrada: unknown, signal?: AbortSignal) {
      const p = ReferenciaDaIntencaoSchema.safeParse(entrada);
      if (!p.success) throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      const ref = p.data;
      return comPrazo(async (s) => {
        const r = await get(`${prefixo}intencoes/${ref.operacaoId}-${ref.revisao}.json`, s),
          assinada = assinatura.lerIntencaoAssinada(r.bytes),
          doc = assinada.documento;
        if (
          doc.operacaoId !== ref.operacaoId ||
          doc.revisao !== ref.revisao ||
          resumoDoRegistro(r.bytes) !== ref.sha256
        )
          throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        return assinada;
      }, signal);
    },
    publicarIntencao(entrada: Uint8Array, signal?: AbortSignal) {
      const bytes = Buffer.from(entrada);
      assinatura.lerIntencao(bytes);
      return comPrazo((s) => guardarIntencao(bytes, s), signal);
    },
    /** Cerca externa terminal para esta encarnação do livro. Não existe thaw
     * automático; retomar operação exigirá rotação/custódia e conciliação. */
    congelarCabecalho(anterior: CabecalhoLido, instante: string, signal?: AbortSignal) {
      const admitida = capacidades.get(anterior);
      if (!admitida?.escrita) throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      const antes = assinatura.lerCabecalho(admitida.bytes);
      if (antes.estado === "aberto" && anterior.chaveId !== assinatura.chaveAtiva)
        throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      if (antes.estado === "congelado")
        return comPrazo(async (s) => {
          const atual = await get(caminho, s);
          if (assinatura.lerCabecalho(atual.bytes).estado !== "congelado")
            throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
          return emitir(atual.bytes, atual.etag);
        }, signal);
      if (Date.parse(instante) < Date.parse(antes.atualizadoEm))
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      const bytes = assinatura.assinarCabecalho({
        ...antes,
        estado: "congelado",
        geracao: antes.geracao + 1,
        anteriorSha256: resumoDoRegistro(admitida.bytes),
        atualizadoEm: instante,
      });
      return comPrazo((s) => compararETrocar(bytes, admitida.etag, s, true), signal);
    },
    retomarComNovaChave(
      anterior: CabecalhoLido,
      reciboSha256: string,
      instante: string,
      signal?: AbortSignal,
    ) {
      const admitida = capacidades.get(anterior);
      if (!admitida?.escrita || !ShaDoLivroSchema.safeParse(reciboSha256).success)
        throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      const antes = assinatura.lerCabecalho(admitida.bytes);
      if (antes.estado !== "congelado" || antes.chavesUtilizadas.includes(assinatura.chaveAtiva))
        throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      if (Date.parse(instante) < Date.parse(antes.atualizadoEm))
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      const bytes = assinatura.assinarCabecalho({
        ...antes,
        estado: "aberto",
        epoca: antes.epoca + 1,
        chavesUtilizadas: [...antes.chavesUtilizadas, assinatura.chaveAtiva],
        geracao: antes.geracao + 1,
        anteriorSha256: resumoDoRegistro(admitida.bytes),
        retomada: { cercaSha256: resumoDoRegistro(admitida.bytes), reciboSha256 },
        atualizadoEm: instante,
      });
      return comPrazo((s) => compararETrocar(bytes, admitida.etag, s), signal);
    },
    trocarCabecalho(anterior: CabecalhoLido, entrada: Uint8Array, signal?: AbortSignal) {
      const admitida = capacidades.get(anterior);
      if (!admitida?.escrita) throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      const bytes = Buffer.from(entrada),
        proximo = assinatura.lerCabecalho(bytes),
        antes = assinatura.lerCabecalho(admitida.bytes);
      if (antes.estado === "congelado") throw new FalhaDoLivroDeDireitos("CONGELADO");
      if (anterior.chaveId !== assinatura.chaveAtiva)
        throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
      if (
        proximo.epoca !== antes.epoca ||
        !isDeepStrictEqual(proximo.chavesUtilizadas, antes.chavesUtilizadas) ||
        !isDeepStrictEqual(proximo.retomada, antes.retomada)
      )
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      if (proximo.estado !== "aberto") throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      if (
        proximo.geracao !== antes.geracao + 1 ||
        proximo.entradas !== antes.entradas + 1 ||
        proximo.anteriorSha256 !== resumoDoRegistro(admitida.bytes) ||
        Date.parse(proximo.atualizadoEm) < Date.parse(antes.atualizadoEm)
      )
        throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
      return comPrazo(async (s) => {
        const ultima = proximo.ultimaIntencao;
        if (!ultima) throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        const intento = await get(
          `${prefixo}intencoes/${ultima.operacaoId}-${ultima.revisao}.json`,
          s,
        );
        const assinada = assinatura.lerIntencaoAssinada(intento.bytes),
          documento = assinada.documento;
        if (assinada.chaveId !== anterior.chaveId || documento.epoca !== antes.epoca)
          throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        if (
          documento.operacaoId !== ultima.operacaoId ||
          documento.revisao !== ultima.revisao ||
          resumoDoRegistro(intento.bytes) !== ultima.sha256 ||
          proximo.raizSha256 !==
            resumoDoRegistro(Buffer.from(JSON.stringify([antes.raizSha256, ultima.sha256]), "utf8"))
        )
          throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
        return compararETrocar(bytes, admitida.etag, s);
      }, signal);
    },
  };
}
