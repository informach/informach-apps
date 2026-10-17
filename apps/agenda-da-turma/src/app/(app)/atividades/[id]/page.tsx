import { notFound } from "next/navigation";
import { z } from "zod";
import { ActivityDetail } from "@/features/unified-activities/components/activity-detail";
import { findTaskForUser } from "@/features/unified-activities/task-repository";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Atividade",
  robots: { index: false, follow: false },
};

/**
 * Uma atividade, um lugar, e uma consulta só.
 *
 * Antes desta página o detalhe dependia da origem: a atividade de recado abria
 * uma página completa, a escolar abria um diálogo sem responsável nem hora, e a
 * extracurricular não abria nada. Com a convergência das tabelas nem a
 * resolução por fonte sobra: é uma tarefa, buscada com o controle de acesso por
 * criança embutido. `?editar=1` abre o formulário; sem ele, a leitura.
 */
export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editar?: string; historico?: string }>;
}) {
  const user = await requireUserServer();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();

  const task = await findTaskForUser(user.id, id);
  if (!task) notFound();

  return (
    <ActivityDetail
      userId={user.id}
      task={task}
      editing={query.editar === "1"}
      historyOpen={query.historico === "1"}
    />
  );
}
