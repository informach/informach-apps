import { Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { AUDIT_GROUPS, AUDIT_PERIODS, type AuditFilters, filtersQuery } from "../filters";

function chip(current: boolean) {
  return `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold no-underline ${
    current ? "bg-night text-white" : "border border-line-warm bg-surface text-ink"
  }`;
}

export function AuditFilterBar({ filters }: { filters: AuditFilters }) {
  return (
    <div className="grid gap-3">
      <nav aria-label="Mostrar eventos de" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-ink-muted">Mostrar</span>
        {AUDIT_GROUPS.map((group) => (
          <Link
            key={group.key}
            href={`/auditoria${filtersQuery(filters, { group: group.key, page: 1 })}` as Route}
            aria-current={filters.group === group.key ? "page" : undefined}
            className={chip(filters.group === group.key)}
          >
            {group.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Período" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-ink-muted">Período</span>
        {AUDIT_PERIODS.map((period) => (
          <Link
            key={period.key}
            href={`/auditoria${filtersQuery(filters, { period: period.key, page: 1 })}` as Route}
            aria-current={filters.period === period.key ? "page" : undefined}
            className={chip(filters.period === period.key)}
          >
            {period.label}
          </Link>
        ))}
      </nav>
      <search>
        <form action="/auditoria" method="get" className="flex flex-wrap items-center gap-2">
          {filters.group !== "tudo" ? (
            <input type="hidden" name="grupo" value={filters.group} />
          ) : null}
          {filters.period !== "7d" ? (
            <input type="hidden" name="periodo" value={filters.period} />
          ) : null}
          <label
            htmlFor="auditoria-pessoa"
            className="flex min-h-11 min-w-0 flex-[1_1_280px] items-center gap-2.5 rounded-xl border border-line-warm bg-surface px-3.5 text-ink-muted"
          >
            <Search aria-hidden="true" className="size-[18px] shrink-0" />
            <span className="sr-only">Pessoa, por e-mail exato ou ID da conta</span>
            <input
              id="auditoria-pessoa"
              name="pessoa"
              type="search"
              defaultValue={filters.person}
              placeholder="Pessoa, por e-mail exato ou ID da conta"
              className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-xl bg-night px-4 font-extrabold text-white"
          >
            Filtrar
          </button>
          {filters.person ? (
            <Link
              href={`/auditoria${filtersQuery(filters, { person: "", page: 1 })}` as Route}
              className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-ink underline underline-offset-2"
            >
              Tirar o filtro de pessoa
            </Link>
          ) : null}
        </form>
      </search>
    </div>
  );
}
