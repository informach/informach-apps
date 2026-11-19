import "server-only";
import type { FileHandle } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import type { criarCifradorDeArquivos } from "./arquivo-cifrado";
import type { criarArquivoComposto } from "./arquivo-composto";
import type { criarTransporteDeArquivosS3 } from "./arquivo-s3";
import type { criarIndiceDeRecuperacao } from "./indice-recuperacao";
import type { criarArmazenamentoDoIndiceS3 } from "./indice-s3";
import {
  confirmarArquivoGuardado,
  confirmarPublicacao,
  FalhaDaPublicacao,
  lerTentativaDePublicacao,
  prepararIndiceDuravel,
  type TentativaDePublicacao,
} from "./publicacao-repository";

/** Publicação interna recuperável. O ciphertext já tem referência persistida
 * antes do PUT. Sempre recupera do destino e autentica TODO o composto antes
 * de registrar prova; não aceita HEAD, sucesso de PUT ou bytes locais como prova.
 * Handles são privados/emprestados/vazios e o chamador conserva sua limpeza.
 * Não cifra novamente, não libera reservas, não retira objetos e não ativa cron. */
export async function publicarCapturaGuardada(config: {
  tentativa: TentativaDePublicacao;
  destino: DestinoDeCaptura;
  transporte: ReturnType<typeof criarTransporteDeArquivosS3>;
  cifrador: ReturnType<typeof criarCifradorDeArquivos>;
  composto: ReturnType<typeof criarArquivoComposto>;
  indice: ReturnType<typeof criarIndiceDeRecuperacao>;
  indices: ReturnType<typeof criarArmazenamentoDoIndiceS3>;
  recuperado: FileHandle;
  aberto: FileHandle;
}) {
  const { transporte, cifrador, composto, indice, indices, recuperado, aberto } = config;
  const alvo = DestinoDeCapturaSchema.safeParse(config.destino);
  if (!alvo.success) throw new FalhaDaPublicacao("CONFIGURACAO");
  const tentativa = { ...config.tentativa },
    destino = alvo.data,
    registro = await lerTentativaDePublicacao(tentativa);
  if (
    !isDeepStrictEqual(destino, registro.destino) ||
    transporte.bucketName !== destino.bucketName ||
    indices.bucketName !== destino.bucketName
  )
    throw new FalhaDaPublicacao("CONFIGURACAO");
  await transporte.recuperar(registro.arquivo, recuperado);
  await cifrador.abrir(recuperado, aberto, registro.arquivo);
  const resumo = await composto.conferir(aberto, registro.composto);
  if (
    resumo.capturaId !== tentativa.capturaId ||
    !isDeepStrictEqual(resumo.inventario, registro.inventario)
  )
    throw new FalhaDaPublicacao("INTEGRIDADE");
  const corpo = await confirmarArquivoGuardado(tentativa),
    preparado = await prepararIndiceDuravel(
      tentativa,
      registro.indice ?? indice.assinar(corpo),
      indice,
    );
  await indices.publicar(preparado, tentativa.capturaId);
  const relido = await indices.recuperar(tentativa.capturaId);
  if (!relido.bytes.equals(preparado)) throw new FalhaDaPublicacao("INTEGRIDADE");
  await confirmarPublicacao(tentativa, relido.bytes);
  return { capturaId: tentativa.capturaId, publicada: true };
}
