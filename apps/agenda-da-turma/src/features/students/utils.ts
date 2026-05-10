const AVATAR_COLOR_PALETTE = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
] as const;

const DEFAULT_AVATAR_COLOR_CLASS = AVATAR_COLOR_PALETTE[0];

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

export function getAvatarColorClass(seed: string): string {
  if (!seed) return DEFAULT_AVATAR_COLOR_CLASS;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const idx = hash % AVATAR_COLOR_PALETTE.length;
  return AVATAR_COLOR_PALETTE[idx] ?? DEFAULT_AVATAR_COLOR_CLASS;
}
