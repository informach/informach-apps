import { PageHeader } from "@/components/blocks";

export default function PessoasLoading() {
  return (
    <>
      <PageHeader title="Pessoas" description="Buscando as contas..." />
      <div aria-hidden="true" className="h-64 animate-pulse rounded-[18px] bg-sand" />
    </>
  );
}
