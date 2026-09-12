import { Button } from "@informach/ui/components/button";
import { CalendarDays, Camera, ListChecks, NotebookPen } from "lucide-react";
import Link from "next/link";

export function DashboardNavButtons({ profileFilter }: { profileFilter: string | null }) {
  const query = profileFilter ? `?${new URLSearchParams({ perfil: profileFilter })}` : "";
  return (
    <section
      aria-labelledby="school-activities-title"
      className="rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <NotebookPen className="size-6" aria-hidden />
        </span>
        <div>
          <h2 id="school-activities-title" className="text-lg font-semibold">
            Atividades
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Para a criança fazer, com a família por perto.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Button asChild className="min-h-11 rounded-xl">
          <Link href={`/atividades${query}`}>
            <ListChecks aria-hidden />
            Ver atividades
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="min-h-11 rounded-xl border-chart-3/30 bg-chart-3/10 text-foreground hover:bg-chart-3/20 hover:text-foreground"
        >
          <Link href={`/calendario${query}`}>
            <CalendarDays aria-hidden />
            Ver calendário
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="min-h-11 rounded-xl border-chart-2/30 bg-chart-2/10 text-foreground hover:bg-chart-2/20 hover:text-foreground sm:col-span-2 lg:col-span-1"
        >
          <Link href={`/recados/novo${query}`}>
            <Camera aria-hidden />
            Importar mensagem ou foto
          </Link>
        </Button>
      </div>
    </section>
  );
}
