import "server-only";
import { RevisaoDeDenunciaSchema } from "@informach/recreio/contrato";
import { z } from "zod";
import { limitarTentativas } from "@/lib/rate-limit";
import {
  type AutorDoProtocolo,
  lerDenunciasDoProprioPerfil,
  pedirRevisaoDaDenunciaNoBanco,
} from "./acompanhamento-repository";

function perfilDoAutor(autor: AutorDoProtocolo) {
  return autor.tipo === "gestor" ? autor.perfilId : autor.jogador.perfilId;
}
export async function acompanharDenuncias(autor: AutorDoProtocolo, protocolo?: unknown) {
  const id = z.uuid().optional().parse(protocolo);
  await limitarTentativas({
    chave: `denuncias-leitura:${perfilDoAutor(autor)}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return lerDenunciasDoProprioPerfil(autor, id);
}
export async function pedirRevisaoDaDenuncia(autor: AutorDoProtocolo, entrada: unknown) {
  const pedido = RevisaoDeDenunciaSchema.parse(entrada);
  await limitarTentativas({
    chave: `denuncia-recurso:${perfilDoAutor(autor)}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return pedirRevisaoDaDenunciaNoBanco(autor, pedido);
}
