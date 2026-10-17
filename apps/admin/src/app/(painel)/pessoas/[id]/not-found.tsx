import Link from "next/link";
import { Empty, PageHeader } from "@/components/blocks";

export default function FichaNotFound() {
  return (
    <>
      <PageHeader title="Conta não encontrada" />
      <Empty>Nenhuma conta com esse ID. Ela pode ter sido excluída pela própria pessoa.</Empty>
      <Link href="/pessoas" className="font-bold">
        Voltar para Pessoas
      </Link>
    </>
  );
}
