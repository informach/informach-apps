"use server";
import { PerfilIdSchema } from "@informach/recreio";
import { jogadorDoAparelho } from "@/features/autoridade-de-jogo/http";
import { autorDaFamilia } from "@/features/familia/autor";
import { autorDaResponsabilidade } from "@/features/mundos/responsabilidade-autor";
import { runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import { caixaDeVisitas, consultarReciboDeVisita } from "./consulta-repository";
import { conferirConviteDeVisita } from "./detalhe-repository";
import {
  aprovarVisitaDoMenor,
  aprovarVisitaDoMundo,
  encerrarVisitaDoMenor,
  responderConviteDeVisita,
} from "./service";

async function jogadorEsperado(perfilId: unknown) {
  const esperado = PerfilIdSchema.parse(perfilId),
    atual = await jogadorDoAparelho();
  assertAllowed(
    atual.perfil.id === esperado,
    "CONFLITO",
    "Quem está jogando mudou. Reabra as visitas antes de continuar.",
  );
  return { perfilId: atual.perfil.id, sessaoDeAparelhoId: atual.sessaoDeAparelhoId };
}
export async function listarVisitasAction(perfilId: unknown, consulta: unknown) {
  return runAction(async () => caixaDeVisitas(await jogadorEsperado(perfilId), consulta));
}
export async function consultarVisitaAction(perfilId: unknown, conviteId: unknown) {
  return runAction(async () => consultarReciboDeVisita(await jogadorEsperado(perfilId), conviteId));
}
export async function conferirVisitaAction(perfilId: unknown, conviteId: unknown) {
  return runAction(async () => conferirConviteDeVisita(await jogadorEsperado(perfilId), conviteId));
}
export async function responderVisitaAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => responderConviteDeVisita(await jogadorEsperado(perfilId), entrada));
}
export async function aprovarVisitaDoMenorAction(entrada: unknown) {
  return runAction(async () => aprovarVisitaDoMenor(await autorDaFamilia(), entrada));
}
export async function encerrarVisitaDoMenorAction(entrada: unknown) {
  return runAction(async () => encerrarVisitaDoMenor(await autorDaFamilia(), entrada));
}
export async function aprovarVisitaDoMundoAction(entrada: unknown) {
  return runAction(async () => {
    const autor = await autorDaResponsabilidade();
    return aprovarVisitaDoMundo(autor, autor.perfilId, entrada);
  });
}
export async function aprovarVisitaDoMundoDoMenorAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () =>
    aprovarVisitaDoMundo(await autorDaFamilia(), PerfilIdSchema.parse(perfilId), entrada),
  );
}
