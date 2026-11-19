import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { conferirTrabalhoDeColeta, FalhaDaColeta, type TrabalhoDeColeta } from "./coleta-contrato";

function configuracao(e: unknown) {
  return (
    e instanceof S3ServiceException &&
    ([401, 403].includes(e.$metadata.httpStatusCode ?? 0) || e.name === "NoSuchBucket")
  );
}
/** Só chaves canônicas de recibos privados. Não lista bucket, não abre conteúdo,
 * não recebe URL/credencial de navegador. GET NoSuchKey é a prova de ausência;
 * tombstone e tentativa duráveis pertencem ao repository. */
export function criarColetorDeObjetosS3(config: {
  cliente: S3Client;
  destino: DestinoDeCaptura;
  tempoLimiteMs: number;
}) {
  const alvo = DestinoDeCapturaSchema.safeParse(config.destino),
    { cliente, tempoLimiteMs } = config;
  if (
    !alvo.success ||
    !Number.isSafeInteger(tempoLimiteMs) ||
    tempoLimiteMs < 1 ||
    tempoLimiteMs > 20000
  )
    throw new FalhaDaColeta("CONFIGURACAO");
  const destino = Object.freeze(alvo.data);
  async function presente(key: string, signal: AbortSignal) {
    try {
      const r = await cliente.send(new GetObjectCommand({ Bucket: destino.bucketName, Key: key }), {
        abortSignal: signal,
      });
      const body = r.Body;
      if (!(body instanceof Readable)) throw new FalhaDaColeta("INCONCLUSIVO");
      const fim = finished(body).catch(() => undefined);
      body.destroy();
      await fim;
      if (signal.aborted || r.$metadata.httpStatusCode !== 200)
        throw new FalhaDaColeta("INCONCLUSIVO");
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
  async function retirar(bruto: TrabalhoDeColeta) {
    const t = conferirTrabalhoDeColeta(bruto);
    if (
      t.destino.bucketId !== destino.bucketId ||
      t.destino.bucketName !== destino.bucketName ||
      t.destino.escopo !== destino.escopo ||
      (await cliente.config.maxAttempts()) !== 1
    )
      throw new FalhaDaColeta("CONFIGURACAO");
    const controle = new AbortController(),
      timer = setTimeout(() => controle.abort(), tempoLimiteMs);
    timer.unref();
    try {
      if (!(await presente(t.objectKey, controle.signal))) return { objetoEncontrado: false };
      try {
        const r = await cliente.send(
          new DeleteObjectCommand({ Bucket: destino.bucketName, Key: t.objectKey }),
          { abortSignal: controle.signal },
        );
        if (r.$metadata.httpStatusCode !== 204) throw new FalhaDaColeta("INCONCLUSIVO");
      } catch (e) {
        // Resposta perdida não vira ausência. Só GET explícito pode conciliar.
        if (configuracao(e)) throw e;
      }
      if (await presente(t.objectKey, controle.signal)) throw new FalhaDaColeta("INCONCLUSIVO");
      return { objetoEncontrado: true };
    } catch (e) {
      if (e instanceof FalhaDaColeta) throw e;
      throw new FalhaDaColeta(configuracao(e) ? "CONFIGURACAO" : "INCONCLUSIVO");
    } finally {
      clearTimeout(timer);
      controle.abort();
    }
  }
  return Object.freeze({ destino, retirar });
}
