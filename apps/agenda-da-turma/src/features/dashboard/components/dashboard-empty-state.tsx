import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DayClosedIllustration, NothingYetIllustration } from "@/components/illustrations";

type Props = {
  scope: "all" | "filtered";
  profileName?: string;
};

export function DashboardEmptyState({ scope, profileName }: Props) {
  const title =
    scope === "filtered" && profileName
      ? `Nada por aqui para ${profileName}`
      : "Nada por aqui ainda";
  const description =
    scope === "filtered"
      ? "Não há atividades atrasadas, para hoje ou para a semana. Boa folga!"
      : "Adicione tarefas, provas, trabalhos ou lembretes pra organizar a rotina.";

  // Dois momentos diferentes, dois desenhos: filtrada e sem nada é folga
  // conquistada; sem nada em lugar nenhum é uma rotina que ainda não começou.
  const Illustration = scope === "filtered" ? DayClosedIllustration : NothingYetIllustration;

  return (
    <section className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      <Illustration className="max-w-[180px]" />
      <div className="space-y-1">
        <p className="text-lg font-bold tracking-tight text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild>
        <Link href="/atividades">
          <Plus className="mr-2 size-4" aria-hidden />
          Nova atividade
        </Link>
      </Button>
    </section>
  );
}
