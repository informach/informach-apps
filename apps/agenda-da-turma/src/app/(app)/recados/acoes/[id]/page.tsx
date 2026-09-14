import { redirect } from "next/navigation";

/**
 * A atividade deixou de morar sob a rota do recado que a originou: o detalhe
 * agora é `/atividades/[id]`, igual para as três fontes. A rota antiga fica
 * porque o e-mail de lembrete aponta para ela.
 */
export default async function NoticeActionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/atividades/${id}`);
}
