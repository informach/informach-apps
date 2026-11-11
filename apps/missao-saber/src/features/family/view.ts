import { parentAuthority, requireFamilyContext } from "./context";
import "server-only";
import { cache } from "react";
import { dashboard } from "@/features/learning/service";
import { requirePageUser } from "@/lib/auth";

export const familyDashboard = cache(async () => {
  const user = await requirePageUser();
  const authority = await parentAuthority(user.id);
  const context = await requireFamilyContext(user.id);
  return {
    ...(await dashboard(authority)),
    authority,
    canManageFamily: context.role === "administrator",
  };
});
