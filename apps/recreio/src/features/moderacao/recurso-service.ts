import "server-only";
import { PerfilIdSchema } from "@informach/recreio";
import { RecursoDaRestricaoSchema } from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { lerRestricaoDoPerfil, pedirRevisaoDaRestricaoNoBanco } from "./recurso-repository";

export async function consultarRestricao(autor: AutorNativoRecente, perfilId: unknown) {
  const id = PerfilIdSchema.parse(perfilId);
  await limitarTentativas({
    chave: `recurso-leitura:${autor.contaId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return lerRestricaoDoPerfil(autor, id);
}
export async function pedirRevisaoDaRestricao(autor: AutorNativoRecente, entrada: unknown) {
  const recurso = RecursoDaRestricaoSchema.parse(entrada);
  await limitarTentativas({
    chave: `recurso-escrita:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return pedirRevisaoDaRestricaoNoBanco(autor, recurso);
}
