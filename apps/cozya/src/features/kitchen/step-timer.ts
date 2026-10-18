/**
 * Minutes a preparation step asks for ("cozinhe por 10 minutos", "asse por 1 hora"), so the
 * timer appears where the recipe needs it. Deterministic text reading, no AI; ranges use the
 * shorter time so the cook checks the pan early. Returns null when the step names no time.
 */
export function minutesInStep(text: string): number | null {
  const n = text.toLowerCase();
  if (/\buma hora e meia\b/.test(n)) return 90;
  const hoursAndHalf = n.match(/(\d+)\s*(?:h|horas?)\s*e\s*meia\b/);
  if (hoursAndHalf) return clamp(Number(hoursAndHalf[1]) * 60 + 30);
  // "1h30", "1h 30min", "1 hora e 30 minutos"
  const hoursAndMinutes = n.match(
    /(\d+)\s*(?:h|horas?)\s*(?:e\s*)?(\d{1,2})\s*(?:min(?:uto|utos)?)?\b/,
  );
  if (hoursAndMinutes) return clamp(Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2]));
  const minutes = n.match(/(\d+)\s*(?:(?:a|-|–|ou)\s*\d+\s*)?min(?:uto|utos)?\b/);
  if (minutes) return clamp(Number(minutes[1]));
  if (/\bmeia hora\b/.test(n)) return 30;
  const hours = n.match(/(\d+)\s*(?:(?:a|-|–|ou)\s*\d+\s*)?(?:h|hora|horas)\b/);
  if (hours) return clamp(Number(hours[1]) * 60);
  if (/\buma hora\b/.test(n)) return 60;
  return null;
}

function clamp(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1440 ? value : null;
}
