import { Button } from "@informach/ui/components/button";
import { CalendarDays, ListChecks } from "lucide-react";
import Link from "next/link";

export function DashboardNavButtons() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
      <Button asChild variant="outline" size="lg">
        <Link href="/atividades">
          <ListChecks aria-hidden />
          Ver atividades
        </Link>
      </Button>
      <Button asChild variant="outline" size="lg">
        <Link href="/calendario">
          <CalendarDays aria-hidden />
          Ver calendário
        </Link>
      </Button>
    </div>
  );
}
