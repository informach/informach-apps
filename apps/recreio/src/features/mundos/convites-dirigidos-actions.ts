"use server";
import { PerfilIdSchema } from "@informach/recreio";
import { jogadorDoAparelho } from "@/features/autoridade-de-jogo/http";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import { consultarConviteDirigido } from "./convites-dirigidos-consulta-repository";
import {
  aprovarConviteDoMenor,
  aprovarEntradaNoMundo,
  emitirConviteDirigido,
  encerrarConviteDoMenor,
  responderConviteDirigido,
} from "./convites-dirigidos-service";
import { autorDaResponsabilidade } from "./responsabilidade-autor";

async function jogadorEsperado(perfilId: unknown) {
  const esperado = PerfilIdSchema.parse(perfilId),
    atual = await jogadorDoAparelho();
  assertAllowed(
    atual.perfil.id === esperado,
    "CONFLITO",
    "Quem está jogando mudou. Reabra os convites antes de continuar.",
  );
  return { perfilId: atual.perfil.id, sessaoDeAparelhoId: atual.sessaoDeAparelhoId };
}
export async function emitirConviteDirigidoAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => emitirConviteDirigido(await jogadorEsperado(perfilId), entrada));
}
export async function responderConviteDirigidoAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => responderConviteDirigido(await jogadorEsperado(perfilId), entrada));
}
export async function consultarConviteDirigidoAction(perfilId: unknown, conviteId: unknown) {
  return runAction(async () =>
    consultarConviteDirigido(await jogadorEsperado(perfilId), conviteId),
  );
}
export async function aprovarConviteDoMenorAction(entrada: unknown) {
  return runAction(async () => aprovarConviteDoMenor(await autorDaFamilia(), entrada));
}
export async function encerrarConviteDoMenorAction(entrada: unknown) {
  return runAction(async () => encerrarConviteDoMenor(await autorDaFamilia(), entrada));
}
export async function aprovarConviteDoMundoAction(entrada: unknown) {
  return runAction(async () => {
    const autor = await autorDaResponsabilidade();
    return aprovarEntradaNoMundo(autor, autor.perfilId, entrada);
  });
}
export async function aprovarConviteDoMundoDoMenorAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () =>
    aprovarEntradaNoMundo(await autorDaFamilia(), PerfilIdSchema.parse(perfilId), entrada),
  );
}
