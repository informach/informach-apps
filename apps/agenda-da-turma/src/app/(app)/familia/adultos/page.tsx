import { getIsProForUser } from "@/features/billing/server-cache";
import { FamilyPanel } from "@/features/family/components/family-panel";
import { FamilyHeader } from "@/features/family/components/family-tabs";
import { getFamilyOverview } from "@/features/family/repository";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Adultos" };

export default async function FamilyAdultsPage() {
  const user = await requireUserServer();
  const [overview, isPro] = await Promise.all([
    getFamilyOverview(user.id),
    getIsProForUser(user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 pb-28 sm:px-8">
      <FamilyHeader
        current="/familia/adultos"
        subtitle="Combine quem acompanha a rotina e quais crianças cada adulto pode ver."
      />
      <FamilyPanel overview={overview} isPro={isPro} />
    </main>
  );
}
