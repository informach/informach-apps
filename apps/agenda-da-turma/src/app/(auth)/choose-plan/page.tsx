import { PlanCards } from "@/features/billing/components/plan-cards";
import { parseCycleQueryParam } from "@/features/billing/plans-content";
import { redirectIfUnauthenticated } from "@/lib/auth";

export const metadata = {
  title: "Escolha seu plano",
};

export default async function ChoosePlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfUnauthenticated("/choose-plan");

  const params = await searchParams;
  const cycleParam = typeof params.cycle === "string" ? params.cycle : undefined;
  const initialCycle = parseCycleQueryParam(cycleParam);

  return <PlanCards initialCycle={initialCycle} />;
}
