import "server-only";
import { PerfilIdSchema, SessaoDeAparelhoIdSchema } from "@informach/recreio";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { AppError } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import {
  aprovarPedidoDePareamento,
  consultarPedidoDePareamento,
  gravarPinDoMenor,
  gravarPinNativo,
  iniciarPedidoDePareamento,
  lerAparelhoPareado,
  revogarAcessoDoMenor,
} from "./repository";
import {
  CodigoDePareamentoSchema,
  gerarHashDoPin,
  hashDoSegredo,
  novoSegredoDeAparelho,
  PinSchema,
  SegredoDeAparelhoSchema,
} from "./segredos";

export async function definirPinDaConta(autor: AutorNativoRecente, entrada: unknown) {
  const { pin } = z.strictObject({ pin: PinSchema }).parse(entrada);
  await limitarTentativas({
    chave: `definir-pin:${autor.contaId}`,
    max: 5,
    janelaEmSegundos: 3600,
  });
  return gravarPinNativo(autor, await gerarHashDoPin(pin));
}
export async function definirPinDoMenor(autor: AutorNativoRecente, entrada: unknown) {
  const { perfilId, pin } = z
    .strictObject({ perfilId: PerfilIdSchema, pin: PinSchema })
    .parse(entrada);
  await limitarTentativas({
    chave: `definir-pin:${autor.contaId}`,
    max: 5,
    janelaEmSegundos: 3600,
  });
  return gravarPinDoMenor(autor, perfilId, await gerarHashDoPin(pin));
}

/** O adapter passa o IP canônico da borda; sem endereço, recusar em vez de ignorar o limite. */
export async function prepararPareamento(ip: string | null) {
  if (!ip) throw new AppError("PAREAMENTO", "Não foi possível preparar o aparelho.");
  await limitarTentativas({
    chave: `parear-ip:${hashDoSegredo("consulta", ip)}`,
    max: 5,
    janelaEmSegundos: 600,
  });
  await limitarTentativas({ chave: "parear-global", max: 1000, janelaEmSegundos: 600 });
  const segredo = novoSegredoDeAparelho();
  return { ...(await iniciarPedidoDePareamento(segredo)), segredo };
}
export async function aprovarPareamento(autor: AutorNativoRecente, entrada: unknown) {
  const { perfilId, codigo } = z
    .strictObject({ perfilId: PerfilIdSchema, codigo: CodigoDePareamentoSchema })
    .parse(entrada);
  await limitarTentativas({
    chave: `aprovar-pareamento:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return aprovarPedidoDePareamento(autor, perfilId, codigo);
}
export async function consultarPareamento(entrada: unknown) {
  const segredo = SegredoDeAparelhoSchema.parse(entrada);
  await limitarTentativas({
    chave: `consultar-pareamento:${hashDoSegredo("consulta", segredo)}`,
    max: 120,
    janelaEmSegundos: 300,
  });
  return consultarPedidoDePareamento(segredo);
}
export async function conferirCredencialPareada(entrada: unknown) {
  const partes = z.string().max(80).parse(entrada).split(".");
  if (partes.length !== 2) return null;
  const aparelho = SessaoDeAparelhoIdSchema.safeParse(partes[0]);
  const token = SegredoDeAparelhoSchema.safeParse(partes[1]);
  if (!aparelho.success || !token.success) return null;
  return lerAparelhoPareado(aparelho.data, token.data).catch((erro: unknown) => {
    if (erro instanceof AppError && ["PERFIL", "AUTH"].includes(erro.code)) return null;
    throw erro;
  });
}
export async function desconectarTodosDoMenor(autor: AutorNativoRecente, entrada: unknown) {
  const perfilId = PerfilIdSchema.parse(entrada);
  await limitarTentativas({
    chave: `desconectar-menor:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return revogarAcessoDoMenor(autor, perfilId);
}
