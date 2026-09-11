import { Button } from "@informach/ui/components/button";
import Link from "next/link";
import { addDays, dayLabel } from "../dates";

export function WeekNavigation({ week, path }: { week: string; path: "/semana" | "/compras" }) {
  return (
    <nav aria-label="Navegar entre semanas" className="flex items-center justify-between gap-2">
      <Button asChild variant="outline" className="min-h-11">
        <Link href={`${path}?week=${addDays(week, -7)}`} aria-label="Semana anterior">
          ←
        </Link>
      </Button>
      <p className="text-center text-sm font-medium">
        {dayLabel(week)} — {dayLabel(addDays(week, 6))}
      </p>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={`${path}?week=${addDays(week, 7)}`} aria-label="Próxima semana">
          →
        </Link>
      </Button>
    </nav>
  );
}
