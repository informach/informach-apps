import { EyeOff } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/blocks";
import { PeopleFilterBar } from "@/features/people/components/people-filters";
import { PeopleList } from "@/features/people/components/people-list";
import { loadPeople } from "@/features/people/loaders";
import { parsePeopleFilters } from "@/features/people/service";
import { requireStaff } from "@/lib/access";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const filters = parsePeopleFilters(await searchParams);
  const { people, total, shortcuts } = await loadPeople(filters);

  return (
    <>
      <PageHeader
        title="Pessoas"
        description="Contas Informach em todos os produtos. Uma conta, os planos de cada app lado a lado."
      />
      <PeopleFilterBar filters={filters} shortcuts={shortcuts} />
      <p className="m-0 flex items-center gap-2.5 text-sm text-ink-muted">
        <EyeOff aria-hidden="true" className="size-4 shrink-0" />A lista mostra a conta e os planos.
        O que cada família cria dentro dos produtos não aparece aqui.
      </p>
      <PeopleList people={people} total={total} filters={filters} />
    </>
  );
}
