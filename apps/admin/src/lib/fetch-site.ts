/**
 * Leitura do cabeçalho `Sec-Fetch-Site`, que o navegador manda em toda
 * navegação: `same-origin` (veio de uma tela do Bastidores), `none` (endereço
 * digitado, favorito), `same-site` (outro subdomínio da casa) ou `cross-site`.
 * O cookie do Bastidores é `SameSite=Lax`, então um link de fora ainda chega
 * com sessão; é este cabeçalho que separa o clique de dentro do link de fora.
 */

/** Pedido que só deve ser atendido a partir de uma tela do próprio Bastidores. */
export function isSameOriginRequest(fetchSite: string | null): boolean {
  return fetchSite === "same-origin";
}

/**
 * Navegação que pode ter vindo de outro site e pede confirmação antes de gravar
 * algo em nome de quem clicou. Sem o cabeçalho (navegador antigo), também pede.
 */
export function needsConfirmation(fetchSite: string | null): boolean {
  return fetchSite !== "none" && fetchSite !== "same-origin";
}
