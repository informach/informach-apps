import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { StudentAvatar } from "./student-avatar";

/**
 * O filtro de criança em pílulas, o mesmo em Hoje e na Semana: "Todas" e uma
 * pílula por criança, com o avatar. Some quando a casa tem uma criança só.
 *
 * Na Semana era um seletor com "Todos os perfis", e a criança tinha mais um
 * nome. `hrefFor` monta o endereço de cada pílula, porque cada tela guarda os
 * próprios parâmetros (a semana na tela, a vista).
 */
export function ChildFilter({
  profiles,
  current,
  hrefFor,
}: {
  profiles: Array<{ id: string; name: string }>;
  current: string | null;
  hrefFor: (profileId: string | null) => string;
}) {
  if (profiles.length < 2) return null;
  return (
    <nav aria-label="Filtrar por criança" className="flex flex-wrap gap-2">
      <Link
        className={cn(
          "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold",
          !current
            ? "bg-foreground text-background"
            : "border border-foreground/15 bg-background hover:bg-muted",
        )}
        aria-current={!current ? "page" : undefined}
        href={hrefFor(null)}
      >
        Todas
      </Link>
      {profiles.map((p) => (
        <Link
          key={p.id}
          href={hrefFor(p.id)}
          aria-current={current === p.id ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-bold",
            current === p.id
              ? "bg-foreground text-background"
              : "border border-foreground/15 bg-background hover:bg-muted",
          )}
        >
          <StudentAvatar name={p.name} size="pill" className="border" />
          {p.name}
        </Link>
      ))}
    </nav>
  );
}
