import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { pinUnlock } from "@/features/aparelho/server";
import { getCurrentUser, requirePageUser } from "@/lib/auth";
import { safeDestination } from "@/lib/destination";
import type { AdultAuthority, PinAuthority } from "./authority";
import { requireFamilyContext } from "./context";
import { familySnapshot } from "./repository";

export const familyView = cache(familySnapshot);
export type ChildView = Awaited<ReturnType<typeof familyView>>["children"][number];
export type ParentContext = Awaited<ReturnType<typeof familyView>> &
  (
    | {
        actor: AdultAuthority;
        mode: "adult";
        userId: string;
        email: string;
        role: "administrator" | "member";
      }
    | { actor: PinAuthority; mode: "pin"; deviceId: string; unlockedUntil: number }
  );
export const parentPage = cache(async (): Promise<ParentContext> => {
  const user = await getCurrentUser();
  if (user) {
    const verified = await requirePageUser();
    const group = await requireFamilyContext(verified.id);
    const actor: AdultAuthority = { kind: "adult", userId: verified.id, familyGroupId: group.id };
    const view = await familyView(actor);
    if (!view.family?.onboardedAt && group.role === "administrator") redirect("/comecar");
    return {
      ...view,
      actor,
      mode: "adult",
      userId: verified.id,
      email: verified.email,
      role: group.role,
    };
  }
  const unlock = await pinUnlock();
  if (unlock)
    return {
      ...(await familyView(unlock.actor)),
      actor: unlock.actor,
      mode: "pin",
      deviceId: unlock.deviceId,
      unlockedUntil: unlock.unlockedUntil,
    };
  const next = safeDestination((await headers()).get("x-estrela-path"));
  redirect(`/entrar?next=${encodeURIComponent(next)}`);
});
