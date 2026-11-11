import { getAppUrl } from "@informach/config/domains";
import { redirect } from "next/navigation";
import { MODELOS } from "@/domain/modelos";
import type { AdultAuthority } from "@/features/familia/authority";
import { PrimeiroUso } from "@/features/familia/components/primeiro-uso";
import { requireFamilyContext } from "@/features/familia/context";
import { activationChoices } from "@/features/familia/context-repository";
import { familyView } from "@/features/familia/view";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Começar" };

export default async function Comecar() {
  const user = await requirePageUser("/comecar");
  const group = await requireFamilyContext(user.id);
  if (group.role !== "administrator") redirect("/inicio");
  const actor: AdultAuthority = { kind: "adult", userId: user.id, familyGroupId: group.id };
  const view = await familyView(actor);
  const people = await activationChoices(actor);
  const environment =
    new URL(env.NEXT_PUBLIC_APP_URL).hostname === "localhost" ? "development" : "production";
  if (view.family?.onboardedAt) redirect("/inicio");
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <PrimeiroUso
        limite={view.access.childLimit}
        pessoas={people}
        contaUrl={`${getAppUrl("conta", environment)}/?familia=${group.id}#familia`}
        modelos={MODELOS.map((m) => ({
          id: m.id,
          name: m.name,
          tarefas: m.tasks.map((t) => t.title),
        }))}
      />
    </main>
  );
}
