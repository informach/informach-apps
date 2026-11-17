import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { requirePageUser } from "@/lib/auth";
import { requireFamilyContext } from "./context";
import type { ProfileRow } from "./repository";
import { familyState } from "./state";

export const PROFILE_COOKIE = "bt-perfil";
export const PROFILE_COLORS = ["#3D7BFF", "#FF7A45", "#B07CFF", "#2EC4B6", "#FF5A8A", "#FFB547"];

export type ProfileView = ProfileRow & { allowed: boolean };

/** Plano, perfis e quais deles o plano libera, para a conta do titular. */
export const familyView = cache(async (userId: string) => {
  const group = await requireFamilyContext(userId);
  return familyState(userId, group.id);
});

/** Usuário verificado, sua família e o perfil escolhido em "Quem vai treinar?". */
export const currentTrainer = cache(async () => {
  const user = await requirePageUser();
  const view = await familyView(user.id);
  const chosen = (await cookies()).get(PROFILE_COOKIE)?.value;
  const profile = view.profiles.find((p) => p.id === chosen && p.allowed) ?? null;
  return { user, ...view, profile };
});

/** Para as telas de treino: sem perfil escolhido (ou fora do plano), volta à escolha. */
export async function requireTrainer() {
  const trainer = await currentTrainer();
  if (!trainer.profile) redirect("/perfis");
  return { ...trainer, profile: trainer.profile };
}
