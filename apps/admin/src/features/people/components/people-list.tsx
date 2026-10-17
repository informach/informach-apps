import type { Route } from "next";
import Link from "next/link";
import { Empty } from "@/components/blocks";
import { ProductMark } from "@/components/product-mark";
import { StatusPill } from "@/components/status";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { PRODUCTS } from "@/lib/products";
import type { PersonRowView, ProductPlan } from "../loaders";
import { PAGE_SIZE, type PeopleFilters, peopleQuery } from "../service";

function PlanTag({ plan }: { plan: ProductPlan }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft bg-paper px-2 py-0.5 text-[13px] font-semibold">
      <ProductMark product={plan.product} size={12} />
      {PRODUCTS[plan.product].name} · {plan.label}
    </span>
  );
}

function lastSignIn(date: Date | null, now: Date) {
  if (!date) return <span className="text-ink-muted">sem registro</span>;
  return (
    <time dateTime={date.toISOString()} title={formatDate(date)}>
      {formatRelative(date, now)}
    </time>
  );
}

export function PeopleList({
  people,
  total,
  filters,
}: {
  people: PersonRowView[];
  total: number;
  filters: PeopleFilters;
}) {
  const now = new Date();
  if (!people.length)
    return (
      <Empty>
        {filters.q || filters.product || filters.plan || filters.account
          ? "Nenhuma conta com esses filtros. Tente outro e-mail ou limpe os filtros."
          : "Ainda não há contas."}
      </Empty>
    );

  const from = (filters.page - 1) * PAGE_SIZE + 1;
  const to = from + people.length - 1;
  const hasPrevious = filters.page > 1;
  const hasNext = to < total;

  return (
    <div className="grid gap-4">
      <div className="hidden overflow-hidden rounded-[18px] border border-line-warm bg-surface md:block">
        <table className="w-full border-collapse text-left text-[15px]">
          <caption className="sr-only">Pessoas encontradas</caption>
          <thead>
            <tr className="text-[13px] text-ink-muted">
              <th scope="col" className="px-4 py-3 font-bold">
                Pessoa
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Nos produtos
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Conta desde
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Última entrada
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Situação
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id} className="border-t border-line-soft align-top">
                <td className="px-4 py-3">
                  <Link
                    prefetch={false}
                    href={`/pessoas/${person.id}` as Route}
                    className="grid no-underline"
                  >
                    <strong className="text-ink">{person.name || "Sem nome"}</strong>
                    <span className="text-sm break-all text-ink-muted">{person.email}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {person.plans.length ? (
                    <span className="flex flex-wrap gap-1.5">
                      {person.plans.map((plan) => (
                        <PlanTag key={plan.product} plan={plan} />
                      ))}
                    </span>
                  ) : (
                    <span className="text-sm text-ink-muted">ainda em nenhum produto</span>
                  )}
                </td>
                <td className="tabular px-4 py-3 font-mono text-[13px] whitespace-nowrap">
                  {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
                    person.createdAt,
                  )}
                </td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">
                  {lastSignIn(person.lastSignInAt, now)}
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1.5">
                    {person.pills.map((pill) => (
                      <StatusPill key={pill.label} tone={pill.tone}>
                        {pill.label}
                      </StatusPill>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="m-0 grid list-none gap-2.5 p-0 md:hidden">
        {people.map((person) => (
          <li key={person.id}>
            <Link
              prefetch={false}
              href={`/pessoas/${person.id}` as Route}
              className="grid gap-2 rounded-[14px] border border-line-warm bg-surface p-4 text-ink no-underline"
            >
              <span className="grid">
                <strong>{person.name || "Sem nome"}</strong>
                <span className="text-sm break-all text-ink-muted">{person.email}</span>
              </span>
              {person.plans.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {person.plans.map((plan) => (
                    <PlanTag key={plan.product} plan={plan} />
                  ))}
                </span>
              ) : null}
              <span className="flex flex-wrap gap-1.5">
                {person.pills.map((pill) => (
                  <StatusPill key={pill.label} tone={pill.tone}>
                    {pill.label}
                  </StatusPill>
                ))}
              </span>
              <span className="text-[13px] text-ink-muted">
                Última entrada: {lastSignIn(person.lastSignInAt, now)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <nav
        aria-label="Páginas"
        className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted"
      >
        <span>
          {formatNumber(from)} a {formatNumber(to)} de {formatNumber(total)}{" "}
          {total === 1 ? "conta" : "contas"} · a busca procura em nome, e-mail e ID
        </span>
        <span className="flex gap-2">
          {hasPrevious ? (
            <Link
              rel="prev"
              href={`/pessoas${peopleQuery(filters, { page: filters.page - 1 })}` as Route}
              className="inline-flex min-h-11 items-center rounded-[10px] border border-line-warm bg-surface px-3.5 font-semibold text-ink no-underline"
            >
              Anteriores
            </Link>
          ) : null}
          {hasNext ? (
            <Link
              rel="next"
              href={`/pessoas${peopleQuery(filters, { page: filters.page + 1 })}` as Route}
              className="inline-flex min-h-11 items-center rounded-[10px] border border-line-warm bg-surface px-3.5 font-semibold text-ink no-underline"
            >
              Próximas
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
