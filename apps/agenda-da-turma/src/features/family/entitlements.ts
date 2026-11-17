import "server-only";
import { listAccessibleProfiles } from "./access";
import type { AgendaAuthority } from "./authority";
import { readAgendaCoverage } from "./entitlement-repository";
/** Presentation only. Mutations must recheck coverage inside their transaction. */
export async function getFamilyEntitlements(actor: AgendaAuthority) {
  const [{ access, coveredIds }, profiles] = await Promise.all([
    readAgendaCoverage(actor),
    listAccessibleProfiles(actor),
  ]);
  return {
    ...access,
    usableProfileIds: profiles.filter((p) => coveredIds.includes(p.id)).map((p) => p.id),
    proProfileIds: access.enabled
      ? profiles.filter((p) => coveredIds.includes(p.id)).map((p) => p.id)
      : [],
  };
}
