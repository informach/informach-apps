import { redirect } from "next/navigation";
import { MODELOS } from "@/domain/modelos";
import { PrimeiroUso } from "@/features/familia/components/primeiro-uso";
import { familyOfAdult, familyView } from "@/features/familia/view";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Começar" };

export default async function Comecar() {
  const user = await requirePageUser("/comecar");
  const { ownerId, role } = await familyOfAdult(user.id);
  if (role === "guardian") redirect("/inicio");
  const view = await familyView(ownerId);
  if (view.family?.onboardedAt) redirect("/inicio");
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <PrimeiroUso
        limite={view.access.childLimit}
        modelos={MODELOS.map((m) => ({
          id: m.id,
          name: m.name,
          tarefas: m.tasks.map((t) => t.title),
        }))}
      />
    </main>
  );
}
