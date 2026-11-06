import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Access, Tier } from "@/features/acesso/policy";
import { pinUnlock } from "@/features/aparelho/server";
import { getAccess } from "@/features/billing/service";
import { getCurrentUser, requirePageUser } from "@/lib/auth";
import { safeDestination } from "@/lib/destination";
import { allowedChildIds } from "./acesso-criancas";
import { type ChildRow, getFamily, guardianOwnerOf, listChildren } from "./repository";

export type ChildView = ChildRow & { allowed: boolean };

/** A família de um adulto: a própria ou aquela de que é segundo responsável. */
export const familyOfAdult = cache(async (userId: string) => {
  const guardianOf = await guardianOwnerOf(userId);
  return {
    ownerId: guardianOf ?? userId,
    role: guardianOf ? ("guardian" as const) : ("owner" as const),
  };
});

/** Plano, ajustes e crianças da família, com quais o plano libera. */
export const familyView = cache(async (ownerId: string) => {
  const [access, family, kids] = await Promise.all([
    getAccess(ownerId),
    getFamily(ownerId),
    listChildren(ownerId),
  ]);
  const allowed = new Set(allowedChildIds(kids, access.childLimit));
  const plan: Access = {
    paid: access.paid,
    tier: access.tier as Tier,
    childLimit: access.childLimit,
  };
  return {
    access: plan,
    subscription: access.subscription,
    family,
    children: kids.map((c) => ({ ...c, allowed: allowed.has(c.id) })) as ChildView[],
  };
});

export type ParentContext = Awaited<ReturnType<typeof familyView>> & {
  ownerId: string;
} & (
    | { mode: "adult"; userId: string; email: string; role: "owner" | "guardian" }
    | { mode: "pin"; deviceId: string; unlockedUntil: number }
  );

/**
 * Quem está na área dos pais: um adulto com a conta, ou alguém que digitou o
 * PIN no aparelho da criança (área reduzida, por 10 minutos). Sem nenhum dos
 * dois, vai para a entrada.
 */
export const parentPage = cache(async (): Promise<ParentContext> => {
  const user = await getCurrentUser();
  if (user) {
    const verified = await requirePageUser();
    const { ownerId, role } = await familyOfAdult(verified.id);
    const view = await familyView(ownerId);
    if (!view.family?.onboardedAt) {
      if (role === "owner") redirect("/comecar");
    }
    return { ...view, ownerId, mode: "adult", userId: verified.id, email: verified.email, role };
  }
  const unlock = await pinUnlock();
  if (unlock) {
    const view = await familyView(unlock.ownerId);
    return {
      ...view,
      ownerId: unlock.ownerId,
      mode: "pin",
      deviceId: unlock.deviceId,
      unlockedUntil: unlock.unlockedUntil,
    };
  }
  const next = safeDestination((await headers()).get("x-estrela-path"));
  redirect(`/entrar?next=${encodeURIComponent(next)}`);
});
