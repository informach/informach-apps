import { PageHeader } from "@/components/blocks";

export default function FichaLoading() {
  return (
    <>
      <PageHeader title="Abrindo a ficha..." />
      <div aria-hidden="true" className="h-72 animate-pulse rounded-[18px] bg-sand" />
    </>
  );
}
