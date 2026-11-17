import { webAppDestination } from "@informach/auth/web-sso-contract";
import { redirect } from "next/navigation";
import { compassoOfferHref, parseCycleQueryParam } from "@/features/billing/plans-content";

/** Preserve saved signup links while authentication belongs to the account central. */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string; cycle?: string }>;
}) {
  const { next, plan, cycle } = await searchParams;
  const destination = webAppDestination(
    next,
    plan === "pro" ? compassoOfferHref(parseCycleQueryParam(cycle)) : "/dashboard",
  );
  redirect(`/login?next=${encodeURIComponent(destination)}`);
}
