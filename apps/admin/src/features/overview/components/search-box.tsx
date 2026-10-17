import { Search } from "lucide-react";

/** Busca de pessoa: um GET para /pessoas, que faz a consulta e registra a abertura de ficha. */
export function SearchBox() {
  return (
    <search className="min-w-0 flex-[1_1_320px] sm:max-w-[520px]">
      <form action="/pessoas" method="get">
        <label
          htmlFor="painel-busca"
          className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line-warm bg-surface px-3.5 text-ink-muted focus-within:border-ink"
        >
          <Search aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />
          <span className="sr-only">Buscar pessoa</span>
          <input
            id="painel-busca"
            name="q"
            type="search"
            autoComplete="off"
            placeholder="Buscar pessoa por e-mail, nome ou ID"
            className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-ink-muted"
          />
        </label>
      </form>
    </search>
  );
}
