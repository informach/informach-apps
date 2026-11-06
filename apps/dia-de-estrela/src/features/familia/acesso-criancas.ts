export type ChildAccessCandidate = {
  id: string;
  accessEnabled: boolean;
};

/**
 * O plano Família inclui todas as crianças guardadas (até o limite). O plano
 * de uma criança respeita a escolha dos pais ao rebaixar; sem escolha, fica a
 * primeira, para dados antigos ou escritos pela metade continuarem usáveis.
 */
export function allowedChildIds(children: ChildAccessCandidate[], limit: number) {
  if (limit > 1) return children.slice(0, limit).map((child) => child.id);
  const preferred = children.filter((child) => child.accessEnabled);
  return (preferred.length ? preferred : children).slice(0, limit).map((child) => child.id);
}
