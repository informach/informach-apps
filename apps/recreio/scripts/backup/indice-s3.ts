import { Readable } from "node:stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import {
  type criarIndiceDeRecuperacao,
  type EstadoDaRetirada,
  FalhaDoIndiceDeRecuperacao,
} from "./indice-recuperacao";

const MAX = 32 * 1024;
export class FalhaDoArmazenamentoDoIndice extends Error {
  constructor(readonly codigo: "CONFIGURACAO" | "INCONCLUSIVO" | "NAO_ENCONTRADO" | "INTEGRIDADE") {
    super(`recreio.backup_index_storage.${codigo}`);
  }
}
function falha(erro: unknown): never {
  if (erro instanceof FalhaDoArmazenamentoDoIndice || erro instanceof FalhaDoIndiceDeRecuperacao)
    throw erro;
  if (erro instanceof S3ServiceException) {
    if ([401, 403].includes(erro.$metadata.httpStatusCode ?? 0) || erro.name === "NoSuchBucket")
      throw new FalhaDoArmazenamentoDoIndice("CONFIGURACAO");
    if (erro.$metadata.httpStatusCode === 404 && erro.name === "NoSuchKey")
      throw new FalhaDoArmazenamentoDoIndice("NAO_ENCONTRADO");
  }
  throw new FalhaDoArmazenamentoDoIndice("INCONCLUSIVO");
}

/** Só publica/lê metadados autenticados. Controle/tentativa duráveis e prova
 * do arquivo guardado precedem a chamada. Retirada aqui NÃO apaga o payload.
 * Tombstone imutável prevalece sobre publicação tardia e é conferido em leitura. */
export function criarArmazenamentoDoIndiceS3(config: {
  cliente: S3Client;
  bucket: string;
  indice: ReturnType<typeof criarIndiceDeRecuperacao>;
  tempoLimiteMs: number;
}) {
  const { cliente, bucket, indice, tempoLimiteMs } = config;
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    !Number.isSafeInteger(tempoLimiteMs) ||
    tempoLimiteMs < 1 ||
    tempoLimiteMs > 30_000
  )
    throw new FalhaDoArmazenamentoDoIndice("CONFIGURACAO");
  function path(id: string, tipo: "publicacao" | "retirada") {
    if (!z.uuid().safeParse(id).success) throw new FalhaDoArmazenamentoDoIndice("CONFIGURACAO");
    return `recreio/v1/backup/${id}/${tipo === "publicacao" ? "manifesto" : "retirado"}.json`;
  }
  function conferir(bytes: Uint8Array, id: string, tipo: "publicado" | "retirado") {
    const r = indice.conferir(bytes, id);
    if (r.tipo !== tipo || r.destino.bucketName !== bucket)
      throw new FalhaDoArmazenamentoDoIndice("INTEGRIDADE");
    return r;
  }
  async function comPrazo<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    externo?: AbortSignal,
  ): Promise<T> {
    if ((await cliente.config.maxAttempts()) !== 1)
      throw new FalhaDoArmazenamentoDoIndice("CONFIGURACAO");
    const c = new AbortController(),
      cancelar = () => c.abort();
    externo?.addEventListener("abort", cancelar, { once: true });
    if (externo?.aborted) cancelar();
    const timer = setTimeout(cancelar, tempoLimiteMs);
    timer.unref();
    try {
      if (c.signal.aborted) throw new FalhaDoArmazenamentoDoIndice("INCONCLUSIVO");
      return await fn(c.signal);
    } catch (e) {
      return falha(e);
    } finally {
      clearTimeout(timer);
      externo?.removeEventListener("abort", cancelar);
      c.abort();
    }
  }
  async function get(
    id: string,
    tipo: "publicacao" | "retirada",
    signal: AbortSignal,
  ): Promise<Buffer> {
    const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: path(id, tipo) }), {
      abortSignal: signal,
    });
    const body = r.Body;
    if (!(body instanceof Readable)) throw new FalhaDoArmazenamentoDoIndice("INTEGRIDADE");
    const cancelar = () => body.destroy(new Error("backup_index.deadline"));
    signal.addEventListener("abort", cancelar, { once: true });
    try {
      if (signal.aborted) throw new FalhaDoArmazenamentoDoIndice("INCONCLUSIVO");
      if (
        r.$metadata.httpStatusCode !== 200 ||
        r.ContentType !== "application/json" ||
        !Number.isSafeInteger(r.ContentLength) ||
        !r.ContentLength ||
        r.ContentLength > MAX ||
        r.ContentEncoding ||
        r.ContentRange
      )
        throw new FalhaDoArmazenamentoDoIndice("INTEGRIDADE");
      const partes: Buffer[] = [];
      let n = 0;
      for await (const b of body) {
        if (!(b instanceof Uint8Array) || signal.aborted)
          throw new FalhaDoArmazenamentoDoIndice("INCONCLUSIVO");
        n += b.byteLength;
        if (n > r.ContentLength || n > MAX) throw new FalhaDoArmazenamentoDoIndice("INTEGRIDADE");
        partes.push(Buffer.from(b));
      }
      if (signal.aborted) throw new FalhaDoArmazenamentoDoIndice("INCONCLUSIVO");
      if (n !== r.ContentLength) throw new FalhaDoArmazenamentoDoIndice("INTEGRIDADE");
      const bytes = Buffer.concat(partes, n);
      conferir(bytes, id, tipo === "publicacao" ? "publicado" : "retirado");
      return bytes;
    } finally {
      signal.removeEventListener("abort", cancelar);
      body.destroy();
    }
  }
  async function estadoRetirada(id: string, signal: AbortSignal): Promise<EstadoDaRetirada> {
    try {
      return { tipo: "encontrada", bytes: await get(id, "retirada", signal) };
    } catch (e) {
      if (
        e instanceof S3ServiceException &&
        e.$metadata.httpStatusCode === 404 &&
        e.name === "NoSuchKey"
      )
        return { tipo: "ausente" };
      throw e;
    }
  }
  async function put(
    bytes: Buffer,
    id: string,
    tipo: "publicacao" | "retirada",
    signal: AbortSignal,
  ) {
    try {
      await cliente.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: path(id, tipo),
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: "application/json",
          IfNoneMatch: "*",
        }),
        { abortSignal: signal },
      );
    } catch (e) {
      if (!(e instanceof S3ServiceException && e.$metadata.httpStatusCode === 412)) throw e;
    }
    const voltou = await get(id, tipo, signal);
    if (!voltou.equals(bytes)) throw new FalhaDoArmazenamentoDoIndice("INTEGRIDADE");
    return voltou;
  }
  async function publicar(preparado: Uint8Array, id: string, externo?: AbortSignal) {
    const bytes = Buffer.from(preparado);
    conferir(bytes, id, "publicado");
    return comPrazo(async (signal) => {
      indice.conferirDisponivel(bytes, await estadoRetirada(id, signal), id);
      const voltou = await put(bytes, id, "publicacao", signal);
      return indice.conferirDisponivel(voltou, await estadoRetirada(id, signal), id);
    }, externo);
  }
  async function registrarRetirada(preparado: Uint8Array, id: string, externo?: AbortSignal) {
    const bytes = Buffer.from(preparado);
    conferir(bytes, id, "retirado");
    return comPrazo(async (signal) => {
      const voltou = await put(bytes, id, "retirada", signal);
      return conferir(voltou, id, "retirado");
    }, externo);
  }
  async function recuperar(id: string, externo?: AbortSignal) {
    path(id, "publicacao");
    return comPrazo(async (signal) => {
      const bytes = await get(id, "publicacao", signal);
      const publicacao = indice.conferirDisponivel(bytes, await estadoRetirada(id, signal), id);
      return { publicacao, bytes };
    }, externo);
  }
  return Object.freeze({ bucketName: bucket, publicar, registrarRetirada, recuperar });
}
