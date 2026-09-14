import { redirect } from "next/navigation";
import { SignupForm } from "@/features/onboarding/components/signup-form";
import { getCurrentUserServer } from "@/lib/auth";
import { safeInternalPath } from "@/lib/url";

export const metadata = {
  title: "Criar conta",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeInternalPath(next, "/choose-plan");
  const user = await getCurrentUserServer();
  if (user) redirect(safeInternalPath(next, "/dashboard"));

  return <SignupForm verifiedRedirectTo={destination} />;
}
