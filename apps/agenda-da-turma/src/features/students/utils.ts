const AVATAR_COLOR_COUNT = 5;
const DEFAULT_AVATAR_COLOR_INDEX = 1;

export function getAgeFromBirthDate(birthDate: string, now: Date = new Date()): number {
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 0;
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - parsed.getUTCMonth();
  const dayDelta = now.getUTCDate() - parsed.getUTCDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }
  return Math.max(age, 0);
}

export function formatBirthDate(birthDate: string): string {
  const [year, month, day] = birthDate.split("-");
  if (!year || !month || !day) return birthDate;
  return `${day}/${month}/${year}`;
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  if (parts.length === 1) {
    return first.toUpperCase();
  }
  const last = parts[parts.length - 1]?.charAt(0) ?? "";
  return (first + last).toUpperCase();
}

/**
 * Índice `chart-N` da criança, derivado do nome.
 *
 * Devolve o ÍNDICE, não a classe: quem monta o avatar é `StudentAvatar`, e ele
 * precisa de fundo, borda e texto combinados. Enquanto isto devolvia
 * `bg-chart-N` cru, cada chamador escolhia a cor do texto por conta própria —
 * e as duas escolhas que existiam reprovavam em contraste, cada uma num tema.
 */
export function getAvatarColorIndex(seed: string): number {
  if (!seed) return DEFAULT_AVATAR_COLOR_INDEX;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % AVATAR_COLOR_COUNT) + 1;
}

/** Partículas que não fecham um nome curto: "Maria de" não é nome de ninguém. */
const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e", "d'"]);

function leadingWords(words: readonly string[], count: number): string {
  let end = Math.min(count, words.length);
  while (end < words.length && NAME_PARTICLES.has(words[end - 1]?.toLowerCase() ?? "")) end += 1;
  return words.slice(0, end).join(" ");
}

/**
 * O nome curto de cada criança, para onde o espaço é de uma pílula ou de um
 * botão: o primeiro nome. Quando dois irmãos começam igual ("Maria Eduarda" e
 * "Maria Clara"), os dois ganham mais um nome até se distinguirem — a pílula
 * existe para separar as crianças, e duas "Maria" não separam nada.
 *
 * Telas com lugar para o nome inteiro (a folha da criança em Família, os
 * formulários) continuam com ele.
 */
export function shortChildNames(
  profiles: ReadonlyArray<{ id: string; name: string }>,
): Map<string, string> {
  const words = new Map(profiles.map((p) => [p.id, p.name.trim().split(/\s+/).filter(Boolean)]));
  const taken = new Map(profiles.map((p) => [p.id, 1]));
  const label = (id: string) => leadingWords(words.get(id) ?? [], taken.get(id) ?? 1);
  for (;;) {
    const groups = new Map<string, string[]>();
    for (const p of profiles) {
      const key = label(p.id).toLocaleLowerCase("pt-BR");
      groups.set(key, [...(groups.get(key) ?? []), p.id]);
    }
    let grew = false;
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        const current = taken.get(id) ?? 1;
        if (current < (words.get(id)?.length ?? 0)) {
          taken.set(id, current + 1);
          grew = true;
        }
      }
    }
    if (!grew) break;
  }
  return new Map(profiles.map((p) => [p.id, label(p.id) || p.name]));
}

/**
 * A mesma linha com o nome curto da criança no lugar do inteiro. As telas de
 * lista (Hoje, Atividades, Semana) trocam o nome uma vez, na entrada, com o
 * mapa da família inteira: assim dois irmãos "Maria" continuam distinguíveis
 * mesmo quando só um deles tem atividade na tela.
 */
export function withShortChildName<T extends { profileId: string; profileName: string }>(
  item: T,
  names: ReadonlyMap<string, string>,
): T {
  const short = names.get(item.profileId);
  return short && short !== item.profileName ? { ...item, profileName: short } : item;
}

/** Atalho para quem só tem a lista e quer o nome curto de uma criança dela. */
export function shortChildName(
  profiles: ReadonlyArray<{ id: string; name: string }>,
  id: string,
): string {
  return shortChildNames(profiles).get(id) ?? profiles.find((p) => p.id === id)?.name ?? "";
}
