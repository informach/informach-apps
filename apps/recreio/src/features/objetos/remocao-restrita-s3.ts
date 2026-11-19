import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { z } from "zod";

const Referencia = z.strictObject({
  tipo: z.enum(["fotografia", "backup"]),
  id: z.uuid(),
  sha256Cifrado: z.string().regex(/^[a-f0-9]{64}$/),
});
export class FalhaDaRemocaoS3 extends Error {
  constructor(readonly codigo: "CONFIGURACAO" | "INCONCLUSIVO") {
    super(`recreio.restricted_removal.${codigo}`);
  }
}
function configuracao(e: unknown) {
  return (
    e instanceof S3ServiceException &&
    ([401, 403].includes(e.$metadata.httpStatusCode ?? 0) || e.name === "NoSuchBucket")
  );
}
/** Transporte interno para folha hex de fotografia/backup. Não aceita URL,
 * prefixo livre, manifesto ou tombstone. Factories de domínio conferem destino
 * e capacidade assinada/durável antes de chamar. Sem conteúdo aberto. */
export function criarRemocaoRestritaS3(config: {
  cliente: S3Client;
  bucket: string;
  tempoLimiteMs: number;
}) {
  const { cliente, bucket, tempoLimiteMs } = config;
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    !Number.isSafeInteger(tempoLimiteMs) ||
    tempoLimiteMs < 1 ||
    tempoLimiteMs > 20000
  )
    throw new FalhaDaRemocaoS3("CONFIGURACAO");
  async function presente(key: string, signal: AbortSignal) {
    try {
      const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: signal,
      });
      const body = r.Body;
      if (!(body instanceof Readable)) throw new FalhaDaRemocaoS3("INCONCLUSIVO");
      const fim = finished(body).catch(() => undefined);
      body.destroy();
      await fim;
      if (signal.aborted || r.$metadata.httpStatusCode !== 200)
        throw new FalhaDaRemocaoS3("INCONCLUSIVO");
      return true;
    } catch (e) {
      if (
        !signal.aborted &&
        e instanceof S3ServiceException &&
        e.$metadata.httpStatusCode === 404 &&
        e.name === "NoSuchKey"
      )
        return false;
      throw e;
    }
  }
  async function retirar(bruto: z.infer<typeof Referencia>) {
    const ref = Referencia.safeParse(bruto);
    if (!ref.success || (await cliente.config.maxAttempts()) !== 1)
      throw new FalhaDaRemocaoS3("CONFIGURACAO");
    const key = `recreio/v1/${ref.data.tipo}/${ref.data.id}/${ref.data.sha256Cifrado}`;
    const controle = new AbortController(),
      timer = setTimeout(() => controle.abort(), tempoLimiteMs);
    timer.unref();
    try {
      if (!(await presente(key, controle.signal))) return { objetoEncontrado: false };
      try {
        const r = await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: controle.signal,
        });
        if (r.$metadata.httpStatusCode !== 204) throw new FalhaDaRemocaoS3("INCONCLUSIVO");
      } catch (e) {
        // Resposta perdida não vira ausência. Só GET explícito pode conciliar.
        if (configuracao(e)) throw e;
      }
      if (await presente(key, controle.signal)) throw new FalhaDaRemocaoS3("INCONCLUSIVO");
      return { objetoEncontrado: true };
    } catch (e) {
      if (e instanceof FalhaDaRemocaoS3) throw e;
      throw new FalhaDaRemocaoS3(configuracao(e) ? "CONFIGURACAO" : "INCONCLUSIVO");
    } finally {
      clearTimeout(timer);
      controle.abort();
    }
  }
  return Object.freeze({ retirar });
}
