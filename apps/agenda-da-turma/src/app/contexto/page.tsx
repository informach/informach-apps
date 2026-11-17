import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FamilyContext } from "@/features/family/components/family-context";
import { FAMILY_COOKIE } from "@/features/family/context";
import { notificationDestination } from "@/features/family/notification-link";
import { familyService } from "@/features/family/service-repository";
import { redirectIfUnauthenticated } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Escolher família" };
export default async function FamilyContextPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const destination = notificationDestination(query.next);
  const requested =
    typeof query.family === "string" && /^[0-9a-f-]{36}$/i.test(query.family)
      ? query.family
      : undefined;
  const returnPath =
    requested && destination
      ? `/contexto?family=${encodeURIComponent(requested)}&next=${encodeURIComponent(destination)}`
      : "/contexto";
  const user = await redirectIfUnauthenticated(returnPath);
  const groups = await familyService.listGroups(user.id);
  const requestedFamilyId = groups.some((g) => g.id === requested) ? requested : undefined;
  if (
    requestedFamilyId &&
    destination &&
    (await cookies()).get(FAMILY_COOKIE)?.value === requestedFamilyId
  )
    redirect(destination);
  return (
    <FamilyContext
      groups={groups}
      requestedFamilyId={requestedFamilyId}
      destination={destination}
      accountUrl={getAppUrl("conta", webSsoEnvironment("agenda-da-turma", env.NEXT_PUBLIC_APP_URL))}
    />
  );
}
