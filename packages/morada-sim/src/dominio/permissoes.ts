/**
 * Os doze direitos de um jogador sobre uma família. Pertencem ao jogador em
 * um contexto e podem ser revogados. A idade do morador nunca dá privilégio
 * à conta, e ser pai ou mãe no jogo não dá poder nenhum.
 */
export const PERMISSOES = [
  "ver",
  "comandar",
  "decidir_vida",
  "editar_aparencia",
  "construir",
  "decorar",
  "gastar",
  "gerir_financas",
  "chamar_morador",
  "autorizar_mudanca",
  "gerir_servicos",
  "gerir_mundo",
] as const;

export type Permissao = (typeof PERMISSOES)[number];

/** Quem cria a família no mundo recebe tudo. */
export const PERMISSOES_DO_FUNDADOR: readonly Permissao[] = PERMISSOES;

/**
 * Quem entra para dividir a família recebe os direitos de jogo. Gerir o mundo
 * e as finanças fica com quem convidou, até ser dado à parte.
 */
export const PERMISSOES_DE_QUEM_DIVIDE: readonly Permissao[] = PERMISSOES.filter(
  (permissao) => permissao !== "gerir_mundo" && permissao !== "gerir_financas",
);

export function ehPermissao(texto: string): texto is Permissao {
  return (PERMISSOES as readonly string[]).includes(texto);
}
