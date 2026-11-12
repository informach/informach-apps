import { ErroDoRecreio } from "@informach/recreio";
import type { PoliticaDoPerfil } from "@informach/recreio/contrato";

/**
 * O que o perfil pode fazer nos jogos, como o jogo recebe. Nesta etapa só
 * existem perfis adultos: jogam com outras pessoas, sem texto livre (nenhum
 * jogo o oferece ainda) e na faixa mais alta. Perfil de criança ainda não tem
 * política definida e não abre jogo.
 */
export function politicaDoPerfil(perfil: {
  tipo: "adult" | "minor";
  versaoDaPolitica: number;
}): PoliticaDoPerfil {
  if (perfil.tipo !== "adult") throw new ErroDoRecreio("POLITICA_INCOMPATIVEL");
  return { multiplayer: true, textoLivre: false, faixa: "18", versao: perfil.versaoDaPolitica };
}
