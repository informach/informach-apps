import { redirect } from "next/navigation";
import { familyAccountUrl } from "@/features/family/account-link";
import { cozyaAuthority } from "@/features/family/context";
import { redirectIfUnauthenticated } from "@/lib/auth";
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle } = await searchParams;
  const selectedCycle = cycle === "anual" || cycle === "annual" ? "annual" : "monthly";
  const user = await redirectIfUnauthenticated(`/settings/billing?cycle=${selectedCycle}`);
  const actor = await cozyaAuthority(user.id);
  redirect(familyAccountUrl(actor.familyGroupId, selectedCycle));
}
