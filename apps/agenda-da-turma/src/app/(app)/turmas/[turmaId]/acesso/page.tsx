import { notFound } from "next/navigation";
import { z } from "zod";
import { GroupAccessPanel } from "@/features/turmas/components/group-access-panel";
import { listGroupAdults } from "@/features/turmas/group-access";
import { findTurmaWithSchoolById } from "@/features/turmas/repository";
import { requireUserServer } from "@/lib/auth";
export default async function GroupAccessPage({
  params,
}: {
  params: Promise<{ turmaId: string }>;
}) {
  const user = await requireUserServer();
  const { turmaId: id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const adults = await listGroupAdults(user.id, id);
  if (!adults) notFound();
  const turma = await findTurmaWithSchoolById(id);
  if (!turma) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Acesso ao grupo · {turma.schoolName}</h1>
      <GroupAccessPanel turmaId={id} code={turma.code} adults={adults} />
    </main>
  );
}
