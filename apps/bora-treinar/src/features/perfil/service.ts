import "server-only";
import { assertAllowed } from "@/lib/errors";
import { inTransaction, lockProfile, progressOf, saveProgress } from "../familia/repository";
import { niveisIniciais, type Ritmo, ritmoPorId } from "./regras";
import { salvarPreferencias } from "./repository";

export interface Respostas {
  ritmo: Ritmo;
  minutos: number | null;
  dias: number;
}

/**
 * Primeiro acesso de um perfil: grava ritmo, tempo e meta e põe os níveis de partida de cada
 * trilha. Os níveis só mudam se o perfil ainda não saiu do zero (refazer o primeiro acesso não
 * apaga o que a pessoa conquistou).
 */
export async function comecarPerfil(
  userId: string,
  permitidos: string[],
  id: string,
  r: Respostas,
) {
  assertAllowed(permitidos.includes(id), "PROFILE", "Perfil não encontrado.");
  const { intensidade } = ritmoPorId(r.ritmo);
  await inTransaction(async (tx) => {
    await lockProfile(tx, id);
    await salvarPreferencias(
      userId,
      id,
      { intensity: intensidade, weeklyGoal: r.dias, minutesPref: r.minutos, onboarded: true },
      tx,
    );
    const atual = await progressOf(id, tx);
    const intocado = Object.values(atual).every(
      (s) => s.level === 0 && s.bonus === 0 && s.streak === 0,
    );
    if (intocado) await saveProgress(id, niveisIniciais(r.ritmo), tx);
  });
}
