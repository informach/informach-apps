import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { FamilyContext } from "@/features/family/components/family-context";
import { familyService } from "@/features/family/context-repository";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Escolher família" };
export default async function FamilyContextPage() {
  const user = await requirePageUser();
  return (
    <FamilyContext
      groups={await familyService.listGroups(user.id)}
      accountUrl={getAppUrl("conta", webSsoEnvironment("missao-saber", env.NEXT_PUBLIC_APP_URL))}
    />
  );
}
