import { getIsProForUser } from "@/features/billing/server-cache";
import { FamilyHeader } from "@/features/family/components/family-tabs";
import { StudentsSection } from "@/features/students/components/students-section";
import { FREE_STUDENT_PROFILE_LIMIT, PRO_STUDENT_PROFILE_LIMIT } from "@/features/students/limits";
import { listStudentProfilesWithActiveTurmaForUser } from "@/features/students/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Crianças" };

export default async function FamilyChildrenPage() {
  const user = await requireUserServer();
  const [profiles, isPro] = await Promise.all([
    listStudentProfilesWithActiveTurmaForUser(user.id),
    getIsProForUser(user.id),
  ]);
  const limit = isPro ? PRO_STUDENT_PROFILE_LIMIT : FREE_STUDENT_PROFILE_LIMIT;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 pb-28 md:px-8">
      <FamilyHeader
        current="/familia"
        subtitle="Um perfil por criança organiza a rotina escolar de cada uma."
      />
      <StudentsSection
        currentUserId={user.id}
        profiles={profiles}
        isPro={isPro}
        currentCount={profiles.filter((p) => p.userId === user.id).length}
        limit={limit}
      />
    </main>
  );
}
