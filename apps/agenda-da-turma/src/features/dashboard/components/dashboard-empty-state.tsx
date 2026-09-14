import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { CalendarCheck, Plus } from "lucide-react";
import Link from "next/link";

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

  return (
    <Card className="rounded-2xl border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
          <CalendarCheck className="size-6" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild>
          <Link href="/atividades">
            <Plus className="mr-2 size-4" aria-hidden />
            Nova atividade
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
