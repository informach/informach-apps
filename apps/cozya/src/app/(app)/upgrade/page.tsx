import { PlanCards } from "@/features/billing/components/plan-cards";
import { parseCycleQueryParam } from "@/features/billing/plans-content";
import { redirectIfUnauthenticated } from "@/lib/auth";

export const metadata = {
  title: "Seja Pro — Cozya",
};

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfUnauthenticated("/upgrade");

  const params = await searchParams;
  const cycleParam = typeof params.cycle === "string" ? params.cycle : undefined;
  const initialCycle = parseCycleQueryParam(cycleParam);

  return (
    <div className="flex w-full justify-center px-4 py-10 md:py-16">
      <PlanCards initialCycle={initialCycle} showStepper={false} showFreePlan={false} />
    </div>
  );
}
