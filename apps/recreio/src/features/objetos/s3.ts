import "server-only";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  type S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import {
  conferirReferenciaDoObjeto,
  type criarCifradorDeObjetos,
  FalhaDoObjetoPrivado,
  type ReferenciaDoObjeto,
} from "./criptografia";

export class FalhaDoArmazenamentoPrivado extends Error {
  constructor(readonly codigo: "CONFIGURACAO" | "INCONCLUSIVO" | "NAO_ENCONTRADO" | "INTEGRIDADE") {
    super(`recreio.private_storage.${codigo}`);
    this.name = "FalhaDoArmazenamentoPrivado";
  }
}
type Cifrador = ReturnType<typeof criarCifradorDeObjetos>;
const chaveDoObjeto = (r: ReferenciaDoObjeto) =>
  `recreio/v1/${r.contexto.tipo}/${r.contexto.id}/${r.sha256Cifrado}`;

/**
 * Transporte privado, sem autorização de família/mundo. Composição servidor
 * fornece cliente/credenciais e bucket próprios; testes usam o SDK real em HTTP
 * fechado. Nunca recebe URL, chave de objeto ou credencial do navegador.
 * O chamador persiste tentativa, referência e envelope ANTES do PUT e, após I/O, relê sua
 * autoridade/cerca antes de publicar ponteiro ou entregar conteúdo aberto.
 */
export function criarArmazenamentoPrivadoS3(config: {
  cliente: S3Client;
  bucket: string;
  cifrador: Cifrador;
  tempoLimiteMs: number;
}) {
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket) ||
    !Number.isSafeInteger(config.tempoLimiteMs) ||
    config.tempoLimiteMs < 1 ||
    config.tempoLimiteMs > 30_000
  )
    throw new FalhaDoArmazenamentoPrivado("CONFIGURACAO");
  const { cliente, bucket, cifrador, tempoLimiteMs } = config;
  function referencia(bruto: unknown) {
    const r = conferirReferenciaDoObjeto(bruto);
    if (r.bytes > cifrador.maxBytesAbertos || r.bytesCifrados > cifrador.maxBytesCifrados)
      throw new FalhaDoObjetoPrivado("LIMITE");
    return r;
  }
  async function comPrazo<T>(executar: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if ((await cliente.config.maxAttempts()) !== 1)
      throw new FalhaDoArmazenamentoPrivado("CONFIGURACAO");
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), tempoLimiteMs);
    timer.unref();
    try {
      return await executar(controle.signal);
    } finally {
      clearTimeout(timer);
      controle.abort();
    }
  }
  async function lerEm(signal: AbortSignal, r: ReferenciaDoObjeto): Promise<Buffer> {
    let resposta: GetObjectCommandOutput;
    try {
      resposta = await cliente.send(
        new GetObjectCommand({ Bucket: bucket, Key: chaveDoObjeto(r) }),
        { abortSignal: signal },
      );
    } catch (erro) {
      if (
        erro instanceof S3ServiceException &&
        erro.name === "NoSuchKey" &&
        erro.$metadata.httpStatusCode === 404
      )
        throw new FalhaDoArmazenamentoPrivado("NAO_ENCONTRADO");
      throw new FalhaDoArmazenamentoPrivado("INCONCLUSIVO");
    }
    const corpo = resposta.Body;
    if (!(corpo instanceof Readable)) throw new FalhaDoArmazenamentoPrivado("INTEGRIDADE");
    const interromper = () => corpo.destroy(new Error("private_object.deadline"));
    signal.addEventListener("abort", interromper, { once: true });
    try {
      if (signal.aborted) throw new FalhaDoArmazenamentoPrivado("INCONCLUSIVO");
      if (
        resposta.$metadata.httpStatusCode !== 200 ||
        resposta.ContentLength !== r.bytesCifrados ||
        resposta.ContentType !== "application/octet-stream" ||
        resposta.ContentEncoding
      )
        throw new FalhaDoArmazenamentoPrivado("INTEGRIDADE");
      const partes: Buffer[] = [];
      let tamanho = 0;
      for await (const parte of corpo) {
        if (!(parte instanceof Uint8Array) || signal.aborted)
          throw new FalhaDoArmazenamentoPrivado("INTEGRIDADE");
        tamanho += parte.byteLength;
        if (tamanho > r.bytesCifrados) throw new FalhaDoArmazenamentoPrivado("INTEGRIDADE");
        partes.push(Buffer.from(parte));
      }
      if (signal.aborted) throw new FalhaDoArmazenamentoPrivado("INCONCLUSIVO");
      if (tamanho !== r.bytesCifrados) throw new FalhaDoArmazenamentoPrivado("INTEGRIDADE");
      return cifrador.abrir(r, Buffer.concat(partes, tamanho));
    } catch (erro) {
      if (erro instanceof FalhaDoArmazenamentoPrivado || erro instanceof FalhaDoObjetoPrivado)
        throw erro;
      throw new FalhaDoArmazenamentoPrivado("INCONCLUSIVO");
    } finally {
      signal.removeEventListener("abort", interromper);
      corpo.destroy();
    }
  }
  async function recuperar(bruto: unknown): Promise<Buffer> {
    const r = referencia(bruto);
    return comPrazo((signal) => lerEm(signal, r));
  }
  async function enviar(preparado: {
    referencia: ReferenciaDoObjeto;
    bytes: Uint8Array;
  }): Promise<ReferenciaDoObjeto> {
    const r = referencia(preparado.referencia);
    if (preparado.bytes.byteLength !== r.bytesCifrados)
      throw new FalhaDoObjetoPrivado("INTEGRIDADE");
    const bytes = Buffer.from(preparado.bytes);
    // Não enviar um envelope alterado depois de seu preparo, mesmo que tenha o mesmo tamanho.
    cifrador.abrir(r, bytes).fill(0);
    return comPrazo(async (signal) => {
      try {
        await cliente.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: chaveDoObjeto(r),
            Body: bytes,
            ContentLength: bytes.length,
            ContentType: "application/octet-stream",
            IfNoneMatch: "*",
          }),
          { abortSignal: signal },
        );
      } catch (erro) {
        // 412 só confirma presença. Replay exige conteúdo íntegro do mesmo recibo.
        if (!(erro instanceof S3ServiceException && erro.$metadata.httpStatusCode === 412))
          throw new FalhaDoArmazenamentoPrivado("INCONCLUSIVO");
      }
      const conferido = await lerEm(signal, r);
      conferido.fill(0);
      return r;
    });
  }
  return { enviar, recuperar };
}
