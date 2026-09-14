import { notFound } from "next/navigation";
import { z } from "zod";
import { SchoolActivityDetail } from "@/features/activities/components/school-activity-detail";
import { findSchoolActivityForUser } from "@/features/activities/repository";
import { getTurmasWithSubjectsForForm } from "@/features/activities/service";
import { getIsProForUser } from "@/features/billing/server-cache";
import { NoticeActivityDetail } from "@/features/notices/components/notice-activity-detail";
import { getNoticeAction } from "@/features/notices/repository";
import { ExtraActivityDetail } from "@/features/profile-subject-activities/components/extra-activity-detail";
import { findExtraActivityDetailForUser } from "@/features/profile-subject-activities/repository";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Atividade",
  robots: { index: false, follow: false },
};

/**
 * Uma atividade, um lugar.
 *
 * O `id` pode vir de qualquer uma das três tabelas — a família não sabe, nem
 * precisa saber, de qual delas o item veio. Antes, a atividade de recado abria
 * uma página com responsável, hora, local, cancelamento e histórico; a escolar
 * abria um diálogo sem nada disso; a extracurricular não abria nada.
 *
 * A ordem das tentativas não afeta a corretude: os ids são uuid e cada busca já
 * aplica o controle de acesso por criança.
 */
export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserServer();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const notice = await getNoticeAction(user.id, id);
  if (notice) return <NoticeActivityDetail userId={user.id} id={id} found={notice} />;

  const schoolRows = await findSchoolActivityForUser(user.id, id);
  if (schoolRows.length) {
    const [isPro, turmas] = await Promise.all([
      getIsProForUser(user.id),
      getTurmasWithSubjectsForForm(user.id),
    ]);
    return (
      <SchoolActivityDetail
        currentUserId={user.id}
        rows={schoolRows}
        isPro={isPro}
        turmas={turmas}
      />
    );
  }

  const extra = await findExtraActivityDetailForUser(user.id, id);
  if (extra) return <ExtraActivityDetail found={extra} />;

  notFound();
}
