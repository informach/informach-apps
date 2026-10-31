import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Access, Tier } from "@/features/acesso/policy";
import { getAccess } from "@/features/billing/service";
import { requirePageUser } from "@/lib/auth";
import { allowedProfileIds } from "./profile-access";
import { getFamily, listProfiles, type ProfileRow } from "./repository";

export const PROFILE_COOKIE = "bt-perfil";
export const PROFILE_COLORS = ["#3D7BFF", "#FF7A45", "#B07CFF", "#2EC4B6", "#FF5A8A", "#FFB547"];

export type ProfileView = ProfileRow & { allowed: boolean };

/** Plano, perfis e quais deles o plano libera, para a conta do titular. */
export const familyView = cache(async (userId: string) => {
  const [access, profiles, family] = await Promise.all([
    getAccess(userId),
    listProfiles(userId),
    getFamily(userId),
  ]);
  const allowed = new Set(allowedProfileIds(profiles, access.profileLimit));
  const plan: Access = {
    paid: access.paid,
    tier: access.tier as Tier,
    profileLimit: access.profileLimit,
  };
  return {
    access: plan,
    subscription: access.subscription,
    family,
    profiles: profiles.map((p) => ({ ...p, allowed: allowed.has(p.id) })) as ProfileView[],
  };
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
