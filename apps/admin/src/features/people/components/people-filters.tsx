import { Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { PRODUCT_KEYS, PRODUCTS } from "@/lib/products";
import { ACCOUNT_FILTERS, type PeopleFilters, PLAN_FILTERS, peopleQuery } from "../service";

const selectClass =
  "min-h-11 w-full rounded-[10px] border border-line-warm bg-surface px-3 font-semibold text-ink sm:w-auto";

function FilterSelect({
  id,
  name,
  label,
  value,
  empty,
  options,
}: {
  id: string;
  name: string;
  label: string;
  value: string | null;
  empty: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[13px] font-bold text-ink-soft">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""} className={selectClass}>
        <option value="">{empty}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Busca e filtros por GET: funcionam sem JavaScript e o endereço pode ser compartilhado na equipe. */
export function PeopleFilterBar({
  filters,
  shortcuts,
}: {
  filters: PeopleFilters;
  shortcuts: { atraso: number; naoConfirmada: number; teste: number; banida: number };
}) {
  const base: PeopleFilters = { q: "", product: null, plan: null, account: null, page: 1 };
  const active = Boolean(filters.q || filters.product || filters.plan || filters.account);
  const chips = [
    { label: "Pagamento em atraso", count: shortcuts.atraso, change: { plan: "atraso" as const } },
    {
      label: "E-mail não confirmado",
      count: shortcuts.naoConfirmada,
      change: { account: "nao-confirmada" as const },
    },
    { label: "Em teste", count: shortcuts.teste, change: { plan: "teste" as const } },
    { label: "Banidas", count: shortcuts.banida, change: { account: "banida" as const } },
  ];

  return (
    <div className="grid gap-4">
      <search>
        <form method="get" action="/pessoas" className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-0 flex-[1_1_320px] gap-1">
            <label htmlFor="pessoas-busca" className="text-[13px] font-bold text-ink-soft">
              Buscar pessoa
            </label>
            <span className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line-warm bg-surface px-3.5 text-ink-muted">
              <Search aria-hidden="true" className="size-[18px] shrink-0" />
              <input
                id="pessoas-busca"
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder="E-mail, nome ou ID"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
              />
            </span>
          </div>
          <FilterSelect
            id="pessoas-produto"
            name="produto"
            label="Produto"
            value={filters.product}
            empty="Todos"
            options={PRODUCT_KEYS.map((key) => ({ value: key, label: PRODUCTS[key].name }))}
          />
          <FilterSelect
            id="pessoas-situacao"
            name="situacao"
            label="Plano"
            value={filters.plan}
            empty="Qualquer"
            options={Object.entries(PLAN_FILTERS).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            id="pessoas-conta"
            name="conta"
            label="Conta"
            value={filters.account}
            empty="Qualquer"
            options={Object.entries(ACCOUNT_FILTERS).map(([value, label]) => ({ value, label }))}
          />
          <button
            type="submit"
            className="min-h-11 rounded-[10px] bg-night px-4 font-extrabold text-white"
          >
            Buscar
          </button>
          {active ? (
            <Link
              href="/pessoas"
              className="inline-flex min-h-11 items-center px-1 font-bold text-ink underline underline-offset-2"
            >
              Limpar
            </Link>
          ) : null}
        </form>
      </search>

      <nav aria-label="Atalhos" className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-ink-muted">Atalhos</span>
        {chips.map((chip) => {
          const href = `/pessoas${peopleQuery(base, chip.change)}` as Route;
          const current =
            ("plan" in chip.change && filters.plan === chip.change.plan && !filters.account) ||
            ("account" in chip.change && filters.account === chip.change.account && !filters.plan);
          return (
            <Link
              key={chip.label}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold no-underline ${
                current
                  ? "border-night bg-night text-white"
                  : "border-line-warm bg-surface text-ink"
              }`}
            >
              {chip.label} ·{" "}
              <span className="tabular ml-1 font-mono">{formatNumber(chip.count)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
