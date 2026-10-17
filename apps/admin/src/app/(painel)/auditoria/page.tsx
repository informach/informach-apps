import { Download, Info } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Empty, Note, PageHeader } from "@/components/blocks";
import { AuditFilterBar } from "@/features/audit/components/audit-filters";
import { AuditList } from "@/features/audit/components/audit-list";
import {
  AUDIT_GROUPS,
  AUDIT_PERIODS,
  filtersQuery,
  parseAuditFilters,
} from "@/features/audit/filters";
import { getAuditPage } from "@/features/audit/service";
import { requireStaff } from "@/lib/access";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const filters = parseAuditFilters(await searchParams);
  const page = await getAuditPage(filters);
  const group = AUDIT_GROUPS.find((item) => item.key === filters.group)?.label ?? "Tudo";
  const period = AUDIT_PERIODS.find((item) => item.key === filters.period)?.label ?? "";

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Quem fez o quê, e quando. Inclusive dentro do Bastidores."
      >
        {staff.role === "owner" ? (
          <a
            href={`/api/auditoria/export${filtersQuery({ ...filters, page: 1 })}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-warm bg-surface px-4 font-bold text-ink no-underline"
          >
            <Download aria-hidden="true" className="size-4" />
            Exportar CSV
          </a>
        ) : null}
      </PageHeader>

      <AuditFilterBar filters={filters} />

      <section aria-labelledby="eventos" className="grid gap-3">
        <h2 id="eventos" className="m-0 text-lg font-extrabold">
          {group}, {period.toLowerCase()}
          {page.person ? `, envolvendo ${page.person.name || "a conta"}` : ""}
        </h2>
        {page.personNotFound ? (
          <Empty>Nenhuma conta com esse e-mail ou ID. O e-mail precisa estar completo.</Empty>
        ) : page.rows.length === 0 ? (
          <Empty>Nada por aqui neste período.</Empty>
        ) : (
          <AuditList rows={page.rows} />
        )}
        {page.filters.page > 1 || page.hasNext ? (
          <nav aria-label="Páginas" className="flex flex-wrap items-center gap-3">
            {page.filters.page > 1 ? (
              <Link
                href={`/auditoria${filtersQuery(filters, { page: filters.page - 1 })}` as Route}
                className="inline-flex min-h-11 items-center rounded-xl border border-line-warm bg-surface px-4 font-bold text-ink no-underline"
              >
                Mais recentes
              </Link>
            ) : null}
            <span className="text-sm text-ink-muted">Página {page.filters.page}</span>
            {page.hasNext ? (
              <Link
                href={`/auditoria${filtersQuery(filters, { page: filters.page + 1 })}` as Route}
                className="inline-flex min-h-11 items-center rounded-xl border border-line-warm bg-surface px-4 font-bold text-ink no-underline"
              >
                Mais antigos
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      <div className="grid gap-2">
        <Note>
          <Info aria-hidden="true" className="mr-1.5 inline size-3.5 align-[-2px]" />O registro
          guarda IDs e nomes de campos, nunca conteúdo, senha, código ou e-mail bruto, como manda a
          política de auditoria. A frase em português é montada na tela a partir desses campos.
        </Note>
        <Note>
          As linhas em azul são consultas e ações da equipe: abrir ficha, encerrar sessões, banir,
          desbanir e mudar papel.
        </Note>
      </div>
    </>
  );
}
