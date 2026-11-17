"use server";
import { PerfilIdSchema } from "@informach/recreio";
import { jogadorDoAparelho } from "@/features/autoridade-de-jogo/http";
import { autorDaFamilia } from "@/features/familia/autor";
import { denunciarContato, denunciarContatoDoMenor } from "@/features/moderacao/denuncias-service";
import { runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import {
  aceitarAmizade,
  alterarPresencaSocial,
  aprovarAmizade,
  emitirCodigoDeAmigo,
  encerrarPedidoDeAmizade,
  pedirAmizade,
  protegerContato,
  removerAmizade,
  renovarAprovacaoDeAmizade,
} from "./service";
import {
  lerAvisoDoMenor,
  protegerContatoDoMenor,
  removerContatoDoMenor,
} from "./supervisao-service";

async function jogadorEsperado(perfilId: unknown) {
  const esperado = PerfilIdSchema.parse(perfilId),
    atual = await jogadorDoAparelho();
  assertAllowed(
    atual.perfil.id === esperado,
    "CONFLITO",
    "Quem está jogando mudou. Reabra os contatos para continuar.",
  );
  return { perfilId: atual.perfil.id, sessaoDeAparelhoId: atual.sessaoDeAparelhoId };
}
export async function codigoSocialAction(perfilId: unknown) {
  return runAction(async () => emitirCodigoDeAmigo(await jogadorEsperado(perfilId)));
}
export async function pedirAmizadeAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => pedirAmizade(await jogadorEsperado(perfilId), entrada));
}
export async function aceitarAmizadeAction(perfilId: unknown, pedidoId: unknown) {
  return runAction(async () => aceitarAmizade(await jogadorEsperado(perfilId), pedidoId));
}
export async function encerrarAmizadeAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => encerrarPedidoDeAmizade(await jogadorEsperado(perfilId), entrada));
}
export async function protegerContatoAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => protegerContato(await jogadorEsperado(perfilId), entrada));
}
export async function removerAmizadeAction(perfilId: unknown, alvo: unknown) {
  return runAction(async () => removerAmizade(await jogadorEsperado(perfilId), alvo));
}
export async function presencaSocialAction(perfilId: unknown, presenca: unknown) {
  return runAction(async () => alterarPresencaSocial(await jogadorEsperado(perfilId), presenca));
}
export async function aprovarAmizadeAction(entrada: unknown) {
  return runAction(async () => aprovarAmizade(await autorDaFamilia(), entrada));
}
export async function renovarAmizadeAction(entrada: unknown) {
  return runAction(async () => renovarAprovacaoDeAmizade(await autorDaFamilia(), entrada));
}
export async function protegerContatoDoMenorAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => protegerContatoDoMenor(await autorDaFamilia(), perfilId, entrada));
}
export async function removerContatoDoMenorAction(perfilId: unknown, alvo: unknown) {
  return runAction(async () => removerContatoDoMenor(await autorDaFamilia(), perfilId, alvo));
}
export async function lerAvisoDoMenorAction(perfilId: unknown, avisoId: unknown) {
  return runAction(async () => lerAvisoDoMenor(await autorDaFamilia(), perfilId, avisoId));
}
export async function denunciarContatoAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => denunciarContato(await jogadorEsperado(perfilId), entrada));
}
export async function denunciarContatoDoMenorAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => denunciarContatoDoMenor(await autorDaFamilia(), perfilId, entrada));
}
