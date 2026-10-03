import { Avatar } from "@/components/avatares";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { resolvedCourse } from "@/features/content/catalog";
import { familyCourseChoices, familyGradeChoices } from "@/features/family/choices";
import {
  EditProfile,
  FamilyChallenge,
  Routine,
} from "@/features/family/components/family-controls";
import { ConfirmarAcesso } from "@/features/family/components/reconfirm";
import { suggestedGoal } from "@/features/family/desafio";
import { birthMonthValue, gradeLabel } from "@/features/family/school-year";
import { familyDashboard } from "@/features/family/view";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Estudantes" };
export default async function Students() {
  const data = await familyDashboard();
  const session = await getSession();
  const recent =
    !!session && Date.now() - new Date(session.session.createdAt).getTime() < 10 * 60_000;
  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        titulo="Estudantes e combinados."
        apoio="Organize os perfis e combine um tempo de estudo que caiba na rotina da família. Não há dívida por dias sem estudar."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {data.profiles.map((profile) => (
          <section
            key={profile.id}
            className="min-w-0 rounded-card border border-sombra bg-creme p-5"
          >
            <div className="flex items-center gap-3">
              <Avatar id={profile.avatar} tamanho="p" />
              <h2 className="font-display text-xl font-semibold wrap-anywhere">
                {profile.nickname}
              </h2>
            </div>
            <p className="mt-3 text-sm text-tinta-suave">
              {gradeLabel(profile.grade)} · {resolvedCourse(profile)?.label}
            </p>
            {!data.activeProfileIds.includes(profile.id) && (
              <p className="mt-3 text-sm">
                Histórico preservado; o plano atual não inclui novas missões assinadas para este
                perfil.
              </p>
            )}
            <div className="mt-4">
              <LinkChapa href={`/estudar?perfil=${profile.id}`} tom="contorno" medida="p">
                Abrir estudo de {profile.nickname}
              </LinkChapa>
            </div>
            {recent && (
              <EditProfile
                profile={{
                  id: profile.id,
                  nickname: profile.nickname,
                  avatar: profile.avatar,
                  grade: profile.grade,
                  birthMonth: birthMonthValue(profile.birthMonth),
                  courseId: resolvedCourse(profile)?.id ?? profile.courseId,
                }}
                courses={familyCourseChoices}
                grades={familyGradeChoices}
              />
            )}
          </section>
        ))}
      </div>
      <div className="my-6">
        {data.profiles.length < data.access.profileLimit ? (
          <LinkChapa href="/familia/preparar">
            {data.profiles.length ? "Preparar outro estudante" : "Preparar o primeiro estudo"}
          </LinkChapa>
        ) : (
          <p className="text-sm text-tinta-suave">
            Todos os perfis do plano atual estão preparados. As opções de plano ficam em Conta.
          </p>
        )}
      </div>
      {!recent && !!data.profiles.length && (
        <ConfirmarAcesso para="editar os perfis" next="/familia/estudantes" />
      )}
      {data.family && (
        <section className="mt-8 grid gap-5">
          <h2 className="font-display text-xl font-semibold">Combinados da família</h2>
          <Routine minutes={data.family.dailyMinutes} />
          <FamilyChallenge
            goal={data.challenge.goal}
            suggested={suggestedGoal(data.profiles.length)}
            progress={data.challenge.progress}
            contributions={data.challenge.contributions}
          />
        </section>
      )}
    </div>
  );
}
