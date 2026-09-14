import { redirect } from "next/navigation";

/** O histórico virou uma seção do detalhe, em vez de uma página à parte. */
export default async function ActivityHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/atividades/${id}`);
}
