import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { familyService } from "@/features/familia/context";
import { FamilyContextScreen } from "@/features/familia/context-screen";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Escolher família" };
export default async function FamilyContextPage() {
  const user = await requirePageUser();
  return (
    <FamilyContextScreen
      groups={await familyService.listGroups(user.id)}
      accountUrl={getAppUrl("conta", webSsoEnvironment("bora-treinar", env.NEXT_PUBLIC_APP_URL))}
    />
  );
}
