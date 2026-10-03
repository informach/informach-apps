import { cn } from "@informach/ui/lib/utils";
import { CoursePicker, StartButton } from "@/components/controls";
import { EmptyProfile } from "@/components/empty-profile";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { tomClaro } from "@/components/ui/chapa";
import { Horizonte, tomDoCurso } from "@/components/ui/horizonte";
import { type EstadoNo, NoTrilha } from "@/components/ui/no-trilha";
import { Etiqueta } from "@/components/ui/pagina";
import { SeloHabilidade } from "@/components/ui/selo-habilidade";
import { assertableAvailabilityMessage, lessonAvailability } from "@/features/content/availability";
import { courseLessons, coursesForGrade, skillNames } from "@/features/content/catalog";
import { gradeLabel, ofGrade } from "@/features/family/school-year";
import { CourseCompletion } from "@/features/learning/components/course-completion";
import { RecoveryOptions } from "@/features/learning/components/recovery-options";
import { courseProgress } from "@/features/learning/recommendation";
import { currentDashboard } from "@/lib/view";

export const metadata = { title: "Minha trilha" };

export default async function Journey() {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const profile = data.profile;
  const course = data.course;
  if (!course) return null;
  const completed = new Set(data.attemptedItemIds);
  const licoes = courseLessons(course);
  const progress = courseProgress(licoes, completed);
  const nextReviewOn =
    data.states
      .filter((state) => course.skills.includes(state.skillId))
      .map((state) => state.dueOn)
      .sort()[0] ?? null;
  const tomCurso = tomDoCurso(course);

  /** Estado de cada lição, na ordem do curso. */
  const estados = licoes.map((lesson) => {
    const done = lesson.items.every((item) => completed.has(item.id));
    const availability = lessonAvailability({
      lesson,
      course,
      grade: profile.grade,
      paid: data.access.paid,
      profileAllowed: data.profileAllowed,
      state: data.contentStates.get(lesson.id),
    });
    return { lesson, done, unavailable: !availability.available, availability };
  });
  /* Só existe um "nó atual": a primeira lição aberta e ainda não concluída. */
  const atualId = estados.find((e) => !e.done && !e.unavailable)?.lesson.id;

  return (
    <>
      <header className="mb-6">
        <Etiqueta tom="uva">Passos pequenos, conexões grandes</Etiqueta>
        <h1 className="mt-2 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
          Minha trilha.
        </h1>
        <p className="mt-2 max-w-2xl text-tinta-suave">
          Você pode retomar os fundamentos ou explorar outra estratégia. O caminho se constrói com
          compreensão.
        </p>
      </header>

      <nav aria-label="Atividades da trilha" className="mb-7 flex flex-wrap gap-3">
        <LinkChapa href="/revisao" tom="contorno" medida="p">
          Revisar
        </LinkChapa>
        <LinkChapa href="/simulados" tom="contorno" medida="p">
          Simulados
        </LinkChapa>
        <LinkChapa href="/historico" tom="contorno" medida="p">
          Minha atividade
        </LinkChapa>
        <LinkChapa href="/meu-espaco" tom="contorno" medida="p">
          Minhas preferências
        </LinkChapa>
      </nav>

      {data.courseTransition && (
        <p
          role="status"
          className="mb-5 rounded-card border-2 border-lima-fundo/40 bg-lima/30 px-4 py-3 text-sm text-tinta"
        >
          {data.courseTransition.to
            ? `Novo ano escolar: sua trilha agora é ${data.courseTransition.to.label}. Prefere outra? Escolha abaixo.`
            : `Novo ano escolar: as trilhas ${ofGrade(profile.grade)} estão em preparação. Enquanto isso, a trilha atual continua aberta.`}
        </p>
      )}

      {/* Cada trilha tem seu horizonte. Ele fica atrás do conteúdo, com
          opacidade baixa: território não pode competir com texto. */}
      <section
        className={cn(
          "relative mb-9 overflow-hidden rounded-heroi border-2 p-5 sm:p-6",
          tomClaro[tomCurso],
        )}
      >
        <Horizonte tom={tomCurso} className="opacity-25" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Etiqueta tom={tomCurso}>
              {course.label} · {gradeLabel(profile.grade)}
            </Etiqueta>
            <h2 className="mt-2.5 font-display text-2xl font-semibold text-tinta">
              {course.title}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm text-tinta-suave">{course.description}</p>
          </div>
          <CoursePicker
            profileId={profile.id}
            current={course.id}
            courses={coursesForGrade(profile.grade)}
          />
        </div>
      </section>

      {progress.finished && <CourseCompletion nextReviewOn={nextReviewOn} />}
      {course.skills.map((skill, i) => {
        const state = data.states.find((s) => s.skillId === skill);
        const doCapitulo = estados.filter((e) => e.lesson.skillId === skill);
        if (!doCapitulo.length) return null;
        /* Progresso do capítulo em descobertas, a mesma unidade que cada lição
           anuncia no seu cartão. "Percorridas" e não "dominadas": a medida de
           autonomia é o selo ao lado, que exige acerto sem pista em dias
           diferentes. */
        const itensCapitulo = doCapitulo.flatMap((e) => e.lesson.items);
        const percorridas = itensCapitulo.filter((item) => completed.has(item.id)).length;
        return (
          <section key={skill} className="mb-10">
            {/* Faixa do capítulo */}
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-card border-2 border-sombra bg-creme p-4 shadow-chapa">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-lima font-display text-lg font-semibold text-tinta"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-semibold text-tinta">
                  {skillNames[skill]}
                </h2>
                <p className="mt-0.5 text-sm text-tinta-suave">
                  {i === 0
                    ? data.access.paid
                      ? "Primeiro capítulo da trilha."
                      : "Primeiro capítulo da trilha. As primeiras missões são gratuitas."
                    : `Ponte sugerida: ${skillNames[course.skills[i - 1] ?? "fracoes"]}.${
                        doCapitulo.some((e) => e.lesson.lab)
                          ? " Use o laboratório se precisar representar a ideia."
                          : ""
                      }`}
                </p>
                <p className="mt-2 font-display text-sm font-semibold text-tinta">
                  {percorridas} de {itensCapitulo.length} descobertas percorridas
                </p>
                <BarraProgresso
                  feitos={percorridas}
                  total={itensCapitulo.length}
                  className="mt-1.5 max-w-xs"
                />
              </div>
              <SeloHabilidade nivel={state?.level ?? "starting"} />
            </div>

            {/* Trilha: no celular o caminho corre à esquerda; a partir de sm
                ele passa pelo centro e as lições alternam de lado. */}
            <ol className="relative mx-auto max-w-2xl">
              <span
                aria-hidden="true"
                className="absolute inset-y-5 left-[34px] w-1.5 -translate-x-1/2 rounded-full bg-sombra/60 sm:left-1/2"
              />
              {doCapitulo.map(({ lesson, done, unavailable, availability }, j) => {
                const estado: EstadoNo = done
                  ? "concluido"
                  : unavailable
                    ? "bloqueado"
                    : lesson.id === atualId
                      ? "atual"
                      : "disponivel";
                const direita = j % 2 === 1;
                const numero = licoes.findIndex((l) => l.id === lesson.id) + 1;
                return (
                  <li
                    key={lesson.id}
                    className="relative flex items-center gap-4 pb-6 last:pb-0 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-5"
                  >
                    <NoTrilha estado={estado} numero={numero} className="sm:col-start-2" />
                    <div
                      className={cn(
                        "min-w-0 flex-1",
                        direita ? "sm:col-start-3" : "sm:col-start-1 sm:text-right",
                      )}
                    >
                      <h3 className="font-display text-lg leading-snug font-semibold text-tinta">
                        {lesson.title}
                      </h3>
                      <p className="mt-0.5 text-sm text-tinta-suave">
                        {lesson.items.length} descobertas ·{" "}
                        {lesson.free
                          ? "Grátis"
                          : unavailable
                            ? availability.reason === "WITHDRAWN"
                              ? "Pausada para correção"
                              : availability.reason === "PROFILE_LIMIT"
                                ? "Perfil fora do limite do plano"
                                : "Na assinatura"
                            : "Na assinatura"}
                      </p>
                      {unavailable && (
                        <p className="mt-1 text-xs text-tinta-suave">
                          {assertableAvailabilityMessage(availability.reason)}
                        </p>
                      )}
                      <div className={cn("mt-2.5 flex", direita ? "" : "sm:justify-end")}>
                        <StartButton
                          profileId={profile.id}
                          lessonId={lesson.id}
                          disabled={unavailable}
                          tom={estado === "atual" ? "verde" : "contorno"}
                          medida="p"
                        >
                          {done ? "Reencontrar" : "Explorar"}
                        </StartButton>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <RecoveryOptions
              skillId={skill}
              evidence={data.evidence}
              attempted={completed}
              profile={profile}
              course={course}
              paid={data.access.paid}
              profileAllowed={data.profileAllowed}
              states={data.contentStates}
            />
          </section>
        );
      })}
    </>
  );
}
