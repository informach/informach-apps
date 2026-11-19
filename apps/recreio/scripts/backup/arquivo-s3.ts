import type { FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import {
  type criarCifradorDeArquivos,
  FalhaDoArquivoCifrado,
  type ReferenciaDoArquivoCifrado,
} from "./arquivo-cifrado";

const BLOCO = 64 * 1024;
/** Teto operacional de PUT único deste adapter, não capacidade certificada do provedor. */
const PUT_MAX_BYTES = 4 * 1024 * 1024 * 1024;
export class FalhaDoTransporteDeArquivo extends Error {
  constructor(readonly codigo: "CONFIGURACAO" | "INCONCLUSIVO" | "NAO_ENCONTRADO" | "INTEGRIDADE") {
    super(`recreio.private_file_transport.${codigo}`);
    this.name = "FalhaDoTransporteDeArquivo";
  }
}
async function destinoVazio(destino: FileHandle) {
  const meta = await destino.stat({ bigint: true });
  if (!meta.isFile() || meta.nlink !== 1n || meta.size !== 0n)
    throw new FalhaDoTransporteDeArquivo("CONFIGURACAO");
  return meta;
}
async function limparParcial(destino: FileHandle) {
  try {
    await destino.truncate(0);
    await destino.sync();
  } catch {
    throw new FalhaDoArquivoCifrado("LIMPEZA");
  }
}
async function* lerParaUpload(origem: FileHandle, tamanho: number, signal: AbortSignal) {
  let pos = 0;
  while (pos < tamanho) {
    if (signal.aborted) throw new FalhaDoTransporteDeArquivo("INCONCLUSIVO");
    // Cada chunk tem armazenamento próprio: o HTTP pode retê-lo depois de
    // pedir o próximo. Não reutilizar/zerar um buffer ainda pertencente à rede.
    const bloco = Buffer.alloc(Math.min(BLOCO, tamanho - pos));
    const { bytesRead } = await origem.read(bloco, 0, bloco.length, pos);
    if (!bytesRead) throw new FalhaDoArquivoCifrado("ARQUIVO_ALTERADO");
    pos += bytesRead;
    yield bloco.subarray(0, bytesRead);
  }
}
async function encerrarUpload(stream: Readable) {
  if (stream.closed) return;
  const fechado = new Promise<void>((resolve) => stream.once("close", resolve));
  // Este stream só é dono do iterador. Nunca fecha o FileHandle emprestado.
  stream.destroy();
  await fechado;
}

/** Handles privados e vazios pertencem ao chamador. Somente ciphertext vai à
 * rede e ao arquivo de readback; a conferência integral não grava texto aberto.
 * Não autoriza captura/download, nem substitui recibo durável antes do PUT. */
export function criarTransporteDeArquivosS3(config: {
  cliente: S3Client;
  bucket: string;
  cifrador: ReturnType<typeof criarCifradorDeArquivos>;
  limiteBytesCifrados: number;
  tempoLimiteMs: number;
}) {
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket) ||
    !Number.isSafeInteger(config.limiteBytesCifrados) ||
    config.limiteBytesCifrados < 1 ||
    config.limiteBytesCifrados > PUT_MAX_BYTES ||
    !Number.isSafeInteger(config.tempoLimiteMs) ||
    config.tempoLimiteMs < 1 ||
    config.tempoLimiteMs > 900_000
  )
    throw new FalhaDoTransporteDeArquivo("CONFIGURACAO");
  const { cliente, bucket, cifrador, limiteBytesCifrados, tempoLimiteMs } = config;
  function referencia(bruto: unknown) {
    const r = cifrador.conferirReferencia(bruto);
    if (r.bytesCifrados > limiteBytesCifrados) throw new FalhaDoArquivoCifrado("LIMITE");
    return r;
  }
  const key = (r: ReferenciaDoArquivoCifrado) =>
    `recreio/v1/backup/${r.contexto.id}/${r.sha256Cifrado}`;
  async function comPrazo<T>(executar: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if ((await cliente.config.maxAttempts()) !== 1)
      throw new FalhaDoTransporteDeArquivo("CONFIGURACAO");
    const ctl = new AbortController(),
      timer = setTimeout(() => ctl.abort(), tempoLimiteMs);
    timer.unref();
    try {
      return await executar(ctl.signal);
    } finally {
      clearTimeout(timer);
      ctl.abort();
    }
  }
  async function ler(r: ReferenciaDoArquivoCifrado, destino: FileHandle, signal: AbortSignal) {
    let admitida = false,
      corpo: Readable | undefined;
    const interromper = () => corpo?.destroy();
    try {
      await destinoVazio(destino);
      admitida = true;
      const resposta = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: key(r) }), {
        abortSignal: signal,
      });
      if (!(resposta.Body instanceof Readable)) throw new FalhaDoTransporteDeArquivo("INTEGRIDADE");
      corpo = resposta.Body;
      signal.addEventListener("abort", interromper, { once: true });
      if (signal.aborted) throw new FalhaDoTransporteDeArquivo("INCONCLUSIVO");
      if (
        resposta.$metadata.httpStatusCode !== 200 ||
        resposta.ContentLength !== r.bytesCifrados ||
        resposta.ContentType !== "application/octet-stream" ||
        resposta.ContentEncoding ||
        resposta.ContentRange
      )
        throw new FalhaDoTransporteDeArquivo("INTEGRIDADE");
      let pos = 0;
      for await (const parte of corpo) {
        if (!(parte instanceof Uint8Array) || pos + parte.byteLength > r.bytesCifrados)
          throw new FalhaDoTransporteDeArquivo("INTEGRIDADE");
        if (signal.aborted) throw new FalhaDoTransporteDeArquivo("INCONCLUSIVO");
        let n = 0;
        while (n < parte.byteLength) {
          const passo = await destino.write(parte, n, parte.byteLength - n, pos + n);
          if (!passo.bytesWritten) throw new FalhaDoArquivoCifrado("IO");
          n += passo.bytesWritten;
        }
        pos += parte.byteLength;
      }
      if (pos !== r.bytesCifrados) throw new FalhaDoTransporteDeArquivo("INTEGRIDADE");
      await destino.sync();
      await cifrador.conferir(destino, r, signal);
      if (signal.aborted) throw new FalhaDoTransporteDeArquivo("INCONCLUSIVO");
      return r;
    } catch (e) {
      if (admitida) await limparParcial(destino);
      if (signal.aborted) throw new FalhaDoTransporteDeArquivo("INCONCLUSIVO");
      if (e instanceof FalhaDoArquivoCifrado || e instanceof FalhaDoTransporteDeArquivo) throw e;
      if (
        e instanceof S3ServiceException &&
        e.name === "NoSuchKey" &&
        e.$metadata.httpStatusCode === 404
      )
        throw new FalhaDoTransporteDeArquivo("NAO_ENCONTRADO");
      if (e instanceof S3ServiceException && [401, 403].includes(e.$metadata.httpStatusCode ?? 0))
        throw new FalhaDoTransporteDeArquivo("CONFIGURACAO");
      throw new FalhaDoTransporteDeArquivo("INCONCLUSIVO");
    } finally {
      signal.removeEventListener("abort", interromper);
      corpo?.destroy();
    }
  }
  async function recuperar(bruto: unknown, destino: FileHandle) {
    const r = referencia(bruto);
    return comPrazo((signal) => ler(r, destino, signal));
  }
  async function enviar(bruto: unknown, origem: FileHandle, readback: FileHandle) {
    const r = referencia(bruto);
    return comPrazo(async (signal) => {
      const saida = await destinoVazio(readback),
        fonte = await origem.stat({ bigint: true });
      if (saida.dev === fonte.dev && saida.ino === fonte.ino)
        throw new FalhaDoTransporteDeArquivo("CONFIGURACAO");
      await cifrador.conferir(origem, r, signal);
      const body = Readable.from(lerParaUpload(origem, r.bytesCifrados, signal), {
        objectMode: false,
        highWaterMark: BLOCO,
      });
      let falhaDoProdutor = false;
      let existente = false;
      // Registrar a falha sem imprimir mensagem/caminho privado. O produtor
      // e o SDK precisam terminar antes de devolver os handles ao chamador.
      body.on("error", () => {
        falhaDoProdutor = true;
      });
      try {
        await cliente.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key(r),
            Body: body,
            ContentLength: r.bytesCifrados,
            ContentType: "application/octet-stream",
            IfNoneMatch: "*",
          }),
          { abortSignal: signal },
        );
      } catch (e) {
        if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 412) existente = true;
        else if (
          e instanceof S3ServiceException &&
          [401, 403].includes(e.$metadata.httpStatusCode ?? 0)
        )
          throw new FalhaDoTransporteDeArquivo("CONFIGURACAO");
        else throw new FalhaDoTransporteDeArquivo("INCONCLUSIVO");
      } finally {
        await encerrarUpload(body);
      }
      if (falhaDoProdutor && !existente) throw new FalhaDoTransporteDeArquivo("INCONCLUSIVO");
      return ler(r, readback, signal);
    });
  }
  return Object.freeze({ bucketName: bucket, enviar, recuperar });
}
