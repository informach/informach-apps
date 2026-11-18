import "server-only";
import type { PerfilId } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { Transacao } from "@/lib/repository";
import { type AutorSocial, comJogadorSocial } from "./autoridade-repository";
import { comResponsavelSocialNativo } from "./responsavel-contexto-repository";

export type LeitorDeRecibosSociais =
  | AutorSocial
  | { responsavel: AutorNativoRecente; perfilId: PerfilId };

/** Só compõe identidade atual. Cada leitor conserva escopo de jogo/perfil e seu namespace. */
export function comLeitorDeRecibosSociais<T>(
  autor: LeitorDeRecibosSociais,
  executar: (tx: Transacao, conferirPrazo: () => Promise<Date>) => Promise<T>,
) {
  return "responsavel" in autor
    ? comResponsavelSocialNativo(
        autor.responsavel,
        autor.perfilId,
        { origemId: autor.perfilId, destinoId: null, finalidade: "protecao", operacao: "leitura" },
        (tx, ctx) => executar(tx, ctx.conferirPrazo),
      )
    : comJogadorSocial(autor, null, (tx, ctx) => executar(tx, ctx.conferirPrazo));
}
