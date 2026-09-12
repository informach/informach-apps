import { Button } from "@informach/ui/components/button";
import { CalendarDays, ListChecks } from "lucide-react";
import Link from "next/link";

export function DashboardNavButtons({ profileFilter }: { profileFilter: string | null }) {
  const query = profileFilter ? `?${new URLSearchParams({ perfil: profileFilter })}` : "";
  return (
    <section aria-labelledby="school-activities-title" className="rounded-xl border bg-card p-4">
      <h2 id="school-activities-title" className="text-base font-semibold">
        Atividades
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Cadastre e acompanhe as atividades de cada criança.
      </p>
      <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
        <Button asChild>
          <Link href={`/atividades${query}`}>
            <ListChecks aria-hidden />
            Ver atividades
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/calendario${query}`}>
            <CalendarDays aria-hidden />
            Ver calendário
          </Link>
        </Button>
      </div>
    </section>
  );
}
