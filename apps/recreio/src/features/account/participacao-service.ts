import "server-only";
import type { IdentidadeNativa } from "./autoridade-repository";
import { consultarParticipacaoDaContaNoBanco } from "./participacao-consulta-repository";

export function consultarMinhaParticipacaoNoRecreio(autor: IdentidadeNativa) {
  return consultarParticipacaoDaContaNoBanco(autor);
}
