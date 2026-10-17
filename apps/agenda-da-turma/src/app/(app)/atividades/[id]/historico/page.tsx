import { redirect } from "next/navigation";

/**
 * O histórico virou uma seção do detalhe, em vez de uma página à parte. Links
 * antigos (e-mails, favoritos) chegam com a seção já aberta.
 */
export default async function ActivityHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/atividades/${id}?historico=1#historico`);
}
