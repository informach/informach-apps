import type { S3Client } from "@aws-sdk/client-s3";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { conferirTrabalhoDeColeta, FalhaDaColeta, type TrabalhoDeColeta } from "./coleta-contrato";
import { criarRemocaoRestritaS3, FalhaDaRemocaoS3 } from "./remocao-restrita-s3";

/** Só chaves canônicas de recibos privados. Não lista bucket ou abre conteúdo.
 * Tentativa, reservas e tombstone são revalidados pelo repository após I/O. */
export function criarColetorDeObjetosS3(config: {
  cliente: S3Client;
  destino: DestinoDeCaptura;
  tempoLimiteMs: number;
}) {
  const alvo = DestinoDeCapturaSchema.safeParse(config.destino);
  if (!alvo.success) throw new FalhaDaColeta("CONFIGURACAO");
  const destino = Object.freeze(alvo.data);
  let remocao: ReturnType<typeof criarRemocaoRestritaS3>;
  try {
    remocao = criarRemocaoRestritaS3({
      cliente: config.cliente,
      bucket: destino.bucketName,
      tempoLimiteMs: config.tempoLimiteMs,
    });
  } catch (e) {
    if (e instanceof FalhaDaRemocaoS3) throw new FalhaDaColeta(e.codigo);
    throw e;
  }
  async function retirar(bruto: TrabalhoDeColeta) {
    const t = conferirTrabalhoDeColeta(bruto);
    if (
      t.destino.bucketId !== destino.bucketId ||
      t.destino.bucketName !== destino.bucketName ||
      t.destino.escopo !== destino.escopo
    )
      throw new FalhaDaColeta("CONFIGURACAO");
    try {
      return await remocao.retirar({
        tipo: "fotografia",
        id: t.mundoId,
        sha256Cifrado: t.cipherSha256,
      });
    } catch (e) {
      if (e instanceof FalhaDaRemocaoS3) throw new FalhaDaColeta(e.codigo);
      throw e;
    }
  }
  return Object.freeze({ destino, retirar });
}
