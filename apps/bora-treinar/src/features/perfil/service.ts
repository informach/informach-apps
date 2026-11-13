import "server-only";
import { inTransaction, lockProfile, progressOf, saveProgress } from "../familia/repository";
import { lockTrainerUse } from "../familia/use-repository";
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
export async function comecarPerfil(userId: string, groupId: string, id: string, r: Respostas) {
  const { intensidade } = ritmoPorId(r.ritmo);
  await inTransaction(async (tx) => {
    await lockTrainerUse(tx, userId, groupId, [id]);
    await lockProfile(tx, userId, id);
    await salvarPreferencias(
      userId,
      id,
      { intensity: intensidade, weeklyGoal: r.dias, minutesPref: r.minutos, onboarded: true },
      tx,
    );
    const atual = await progressOf(userId, id, tx);
    const intocado = Object.values(atual).every(
      (s) => s.level === 0 && s.bonus === 0 && s.streak === 0,
    );
    if (intocado) await saveProgress(id, niveisIniciais(r.ritmo), tx);
  });
}
