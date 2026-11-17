import "server-only";
import { z } from "zod";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { aceitarConviteNoBanco } from "./convites-aceite-repository";
import { listarConvitesEnviados, listarConvitesRecebidos } from "./convites-consulta-repository";
import { recusarConviteNoBanco, revogarConviteNoBanco } from "./convites-encerramento-repository";
import { AceiteDeGrupoSchema, NovoConviteDeGrupoSchema } from "./convites-regras";
import { criarConviteDeGrupo } from "./convites-repository";

export async function aceitarConviteDeAdulto(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = AceiteDeGrupoSchema.parse(entrada);
  await limitarTentativas({
    chave: `grupo-convite-aceite:${autor.contaId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  return aceitarConviteNoBanco(autor, pedido);
}

export async function convitesEnviados(autor: IdentidadeNativa) {
  await limitarTentativas({
    chave: `grupo-convites-leitura:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return listarConvitesEnviados(autor);
}
export async function convitesRecebidos(autor: IdentidadeNativa) {
  await limitarTentativas({
    chave: `grupo-convites-leitura:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return listarConvitesRecebidos(autor);
}
export async function revogarConviteDeAdulto(autor: AutorNativoRecente, conviteId: unknown) {
  const id = z.uuid().parse(conviteId);
  await limitarTentativas({
    chave: `grupo-convites-fim:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return revogarConviteNoBanco(autor, id);
}
export async function recusarConviteDeAdulto(autor: AutorNativoRecente, conviteId: unknown) {
  const id = z.uuid().parse(conviteId);
  await limitarTentativas({
    chave: `grupo-convites-fim:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return recusarConviteNoBanco(autor, id);
}

export async function convidarAdulto(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = NovoConviteDeGrupoSchema.parse(entrada);
  await limitarTentativas({
    chave: `grupo-convite:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 3600,
  });
  return criarConviteDeGrupo(autor, pedido);
}
