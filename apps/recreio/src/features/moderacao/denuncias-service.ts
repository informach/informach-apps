import "server-only";
import { PerfilIdSchema } from "@informach/recreio";
import { DenunciaDeContatoSchema } from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { AutorSocial } from "@/features/social/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { denunciarContatoDoMenorNoBanco, denunciarContatoNoBanco } from "./denuncias-repository";

export async function denunciarContato(autor: AutorSocial, entrada: unknown) {
  const denuncia = DenunciaDeContatoSchema.parse(entrada);
  await limitarTentativas({ chave: `denuncia:${autor.perfilId}`, max: 30, janelaEmSegundos: 600 });
  return denunciarContatoNoBanco(autor, denuncia);
}
export async function denunciarContatoDoMenor(
  autor: AutorNativoRecente,
  perfilId: unknown,
  entrada: unknown,
) {
  const id = PerfilIdSchema.parse(perfilId),
    denuncia = DenunciaDeContatoSchema.parse(entrada);
  await limitarTentativas({
    chave: `denuncia-responsavel:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return denunciarContatoDoMenorNoBanco(autor, id, denuncia);
}
