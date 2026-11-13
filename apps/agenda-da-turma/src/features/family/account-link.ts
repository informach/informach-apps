import "server-only";
import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { env } from "@/lib/env";
export function familyAccountUrl(familyGroupId: string, cycle?: "monthly" | "annual") {
  const url = new URL(
    getAppUrl("conta", webSsoEnvironment("agenda-da-turma", env.NEXT_PUBLIC_APP_URL)),
  );
  url.searchParams.set("familia", familyGroupId);
  if (cycle) {
    url.searchParams.set("plano", cycle === "annual" ? "anual" : "mensal");
    url.hash = "compasso";
  }
  return url.toString() as `http${"" | "s"}://${string}`;
}
