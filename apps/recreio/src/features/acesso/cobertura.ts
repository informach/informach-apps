import {
  type DecisaoDeAcesso,
  decidirAcesso,
  type FatosDeAcesso,
  type PerfilId,
  type TierDoPlano,
} from "@informach/recreio";

/**
 * A parte pura do carregador de acesso: a cobertura do perfil pelo plano.
 * Quem decide o direito de jogar continua sendo `decidirAcesso`; aqui só se
 * calcula o fato `coberto` que ela recebe.
 */

/** Fatos do perfil sem a cobertura, que depende do plano em vigor. */
export type FatosSemCobertura = Omit<FatosDeAcesso, "perfil"> & {
  perfil: Omit<FatosDeAcesso["perfil"], "coberto">;
};

export type CoberturaDoPerfil = {
  /** O titular deixou este perfil dentro da cobertura. */
  ligada: boolean;
  /** Perfis do grupo com a cobertura ligada, do mais antigo ao mais novo. */
  cobertosDoGrupo: readonly PerfilId[];
};

/**
 * `coberto` = o perfil tem grupo, está com a cobertura ligada e a sua posição
 * entre os perfis cobertos do grupo cabe no limite do plano em vigor.
 *
 * O limite vem do plano, e o plano sai da própria decisão. Então ela roda uma
 * vez supondo o perfil coberto, só para dizer qual plano vale e quantos perfis
 * ele cobre; se o perfil ficar fora desse limite, roda de novo sem cobertura.
 * Quando não há plano, a primeira resposta já explica o porquê (encerrado,
 * revogado, pagamento pendente) e é ela que vale.
 */
export function decidirComCobertura(
  fatos: FatosSemCobertura,
  cobertura: CoberturaDoPerfil,
): DecisaoDeAcesso {
  const com = (coberto: boolean) =>
    decidirAcesso({ ...fatos, perfil: { ...fatos.perfil, coberto } });
  const posicao = cobertura.cobertosDoGrupo.indexOf(fatos.perfil.id);
  if (fatos.perfil.grupoId === null || !cobertura.ligada || posicao < 0) return com(false);
  const comPlano = com(true);
  if (!comPlano.podeJogar) return comPlano;
  return posicao < comPlano.limiteDePerfis ? comPlano : com(false);
}

/** O `tier` do catálogo de produtos, quando é um dos planos do Recreio. */
export function tierDoProduto(tier: string | undefined): TierDoPlano | null {
  return tier === "individual" || tier === "family" ? tier : null;
}
