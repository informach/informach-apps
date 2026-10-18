/**
 * A última criança para quem este aparelho trouxe um recado.
 *
 * Numa casa com dois filhos, quem fotografa a agenda à noite quase sempre
 * repete a criança da vez anterior. A folha "O que chegou?" e a tela de captura
 * começam por ela, e a escolha continua a um toque.
 *
 * Fica no aparelho, e não na conta, de propósito: é conveniência de quem está
 * com o celular na mão, não uma preferência da família. Um id que não é mais
 * desta conta (outra pessoa entrou no mesmo aparelho, a criança foi apagada) é
 * ignorado por quem lê, que confere contra a lista de crianças.
 */
const KEY = "agenda:last-child";

export function readLastChild(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Modo privado ou armazenamento bloqueado: começa pela primeira criança.
    return null;
  }
}

export function rememberLastChild(profileId: string) {
  try {
    window.localStorage.setItem(KEY, profileId);
  } catch {
    // Sem armazenamento, a escolha vale só para esta vez.
  }
}
