import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { dashboard } from "@/features/learning/service";
import { getCurrentUser } from "./auth";

export const currentDashboard = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  const selected = (await cookies()).get("ms-profile")?.value;
  return dashboard(user.id, selected, { fallbackToFirst: true });
});
