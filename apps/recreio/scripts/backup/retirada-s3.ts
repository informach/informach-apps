import type { S3Client } from "@aws-sdk/client-s3";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { criarRemocaoRestritaS3 } from "@/features/objetos/remocao-restrita-s3";
import { FalhaDaPublicacao } from "./falha-controle";
import type { criarIndiceDeRecuperacao } from "./indice-recuperacao";

/** Admite só payload da retirada autenticada. Não apaga manifesto/tombstone;
 * o controlador confirma o marcador guardado ANTES de chamar este transporte. */
export function criarRetiradaDoBackupS3(config: {
  cliente: S3Client;
  destino: DestinoDeCaptura;
  indice: ReturnType<typeof criarIndiceDeRecuperacao>;
  tempoLimiteMs: number;
}) {
  const alvo = DestinoDeCapturaSchema.safeParse(config.destino);
  if (!alvo.success) throw new FalhaDaPublicacao("CONFIGURACAO");
  const destino = Object.freeze(alvo.data),
    indice = config.indice,
    remocao = criarRemocaoRestritaS3({
      cliente: config.cliente,
      bucket: destino.bucketName,
      tempoLimiteMs: config.tempoLimiteMs,
    });
  async function retirar(capturaId: string, bytes: Uint8Array) {
    const r = indice.conferir(bytes, capturaId);
    if (
      r.tipo !== "retirado" ||
      r.destino.bucketId !== destino.bucketId ||
      r.destino.bucketName !== destino.bucketName ||
      r.destino.escopo !== destino.escopo
    )
      throw new FalhaDaPublicacao("CONFIGURACAO");
    return remocao.retirar({
      tipo: "backup",
      id: r.capturaId,
      sha256Cifrado: r.arquivoSha256Cifrado,
    });
  }
  return Object.freeze({ destino, retirar });
}
