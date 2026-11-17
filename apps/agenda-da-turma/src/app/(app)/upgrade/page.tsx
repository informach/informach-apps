import { redirect } from "next/navigation";
import { compassoOfferHref, parseCycleQueryParam } from "@/features/billing/plans-content";
import { familyAccountUrl } from "@/features/family/account-link";
import { agendaAuthority } from "@/features/family/context";
import { redirectIfUnauthenticated } from "@/lib/auth";

export const metadata = { title: "Assinatura Compasso" };
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const cycle = parseCycleQueryParam((await searchParams).cycle);
  const user = await redirectIfUnauthenticated(compassoOfferHref(cycle));
  const actor = await agendaAuthority(user.id);
  redirect(familyAccountUrl(actor.familyGroupId, cycle));
}
