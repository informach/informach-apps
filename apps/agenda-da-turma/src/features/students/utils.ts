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
