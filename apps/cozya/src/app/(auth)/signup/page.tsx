import { webAppDestination } from "@informach/auth/web-sso-contract";
import { redirect } from "next/navigation";
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string; cycle?: string }>;
}) {
  const { next, plan, cycle } = await searchParams;
  if (plan === "pro")
    redirect(`/upgrade?cycle=${cycle === "anual" || cycle === "annual" ? "annual" : "monthly"}`);
  redirect(`/login?next=${encodeURIComponent(webAppDestination(next, "/hoje"))}`);
}
