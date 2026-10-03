import "server-only";
import { cache } from "react";
import { dashboard } from "@/features/learning/service";
import { requirePageUser } from "@/lib/auth";

export const familyDashboard = cache(async () => {
  const user = await requirePageUser();
  return dashboard(user.id);
});
