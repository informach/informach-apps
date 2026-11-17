import "server-only";
import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { env } from "@/lib/env";
export function familyAccountUrl(groupId: string | null, cycle?: "monthly" | "annual") {
  const url = new URL(getAppUrl("conta", webSsoEnvironment("cozya", env.NEXT_PUBLIC_APP_URL)));
  if (groupId) url.searchParams.set("familia", groupId);
  if (cycle) url.searchParams.set("plano", cycle === "annual" ? "anual" : "mensal");
  url.hash = "compasso";
  return url.toString() as `http${"" | "s"}://${string}`;
}
