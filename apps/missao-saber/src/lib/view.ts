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
  // A profile cookie may outlive a deleted profile or a different account login.
  const data = await dashboard(user.id);
  if (selected && data.profiles.some((p) => p.id === selected)) return dashboard(user.id, selected);
  return data;
});
