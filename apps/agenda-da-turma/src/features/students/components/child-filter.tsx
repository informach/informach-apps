import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { StudentAvatar } from "./student-avatar";

/**
 * O filtro de criança em pílulas, o mesmo em Hoje e na Semana: "Todas" e uma
 * pílula por criança, com o avatar. Some quando a casa tem uma criança só.
 *
 * `hrefFor` monta o endereço de cada pílula, porque cada tela guarda os
 * próprios parâmetros. `plain` tira o avatar: é a versão do computador, ao
 * lado da data, como na prancha de Hoje no computador.
 */
export function ChildFilter({
  profiles,
  current,
  hrefFor,
  plain = false,
}: {
  profiles: Array<{ id: string; name: string }>;
  current: string | null;
  hrefFor: (profileId: string | null) => string;
  plain?: boolean;
}) {
  if (profiles.length < 2) return null;
  return (
    <nav
      aria-label="Filtrar por criança"
      className={cn("flex flex-wrap", plain ? "gap-1.5" : "gap-2")}
    >
      <Link
        className={cn(
          "inline-flex min-h-10 relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] items-center rounded-full text-sm font-bold",
          plain ? "px-3.5" : "px-4",
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
            "inline-flex min-h-10 relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] items-center gap-2 rounded-full text-sm font-bold",
            plain ? "px-3.5" : "pl-1.5 pr-3.5",
            current === p.id
              ? "bg-foreground text-background"
              : "border border-foreground/15 bg-background hover:bg-muted",
          )}
        >
          {plain ? null : <StudentAvatar name={p.name} size="pill" />}
          {p.name}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Onde as pílulas não aparecem (Hoje à noite, a Semana), o filtro continua
 * valendo pela URL. Esta linha diz que a tela mostra uma criança só e devolve
 * todas, para ninguém imprimir ou ler a semana de uma criança achando que é a
 * da casa.
 */
export function FilteredByChild({
  profiles,
  current,
  clearHref,
}: {
  profiles: Array<{ id: string; name: string }>;
  current: string | null;
  clearHref: string;
}) {
  const child = current ? profiles.find((profile) => profile.id === current) : null;
  if (!child || profiles.length < 2) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-muted-foreground">
      <span>Só de {child.name}</span>
      <span aria-hidden>·</span>
      <Link
        href={clearHref}
        className="inline-flex min-h-11 items-center font-bold text-primary-ink underline"
      >
        Ver todas
      </Link>
    </p>
  );
}
