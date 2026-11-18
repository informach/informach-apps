import "server-only";
import type { PerfilId } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { AutorDaResponsabilidade } from "./gestao-repository";

/** A seleção do menor é um alvo de gestão; a identidade continua sendo do adulto nativo. */
export type AutorDaGestaoDeMundo =
  | AutorDaResponsabilidade
  | {
      responsavel: AutorNativoRecente;
      perfilId: PerfilId;
    };
export function identidadeDoGestor(autor: AutorDaGestaoDeMundo): AutorNativoRecente {
  return "responsavel" in autor ? autor.responsavel : autor;
}
