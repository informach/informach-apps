import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { StartButton } from "@/components/controls";
import { EmptyProfile } from "@/components/empty-profile";
import { Chapa } from "@/components/ui/chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import {
  assertableAvailabilityMessage,
  isSuspended,
  lessonAvailability,
} from "@/features/content/availability";
import {
  assessment,
  assessmentHasAllSkills,
  courseAssessmentBanks,
  findCourse,
} from "@/features/content/catalog";
import { currentDashboard } from "@/lib/view";

export default async function Exams() {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const course = findCourse(data.profile.courseId);
  if (!course) return null;
  const unavailableSources = new Set(
    courseAssessmentBanks(course)
      .filter((lesson) => isSuspended(data.contentStates.get(lesson.id)))
      .map((lesson) => lesson.id),
  );
  const exam = assessment(
    course,
    "exam",
    unavailableSources,
    new Set(data.assessmentExposedFamilyIds),
  );
  const availability = lessonAvailability({
    lesson: exam,
    course,
    grade: data.profile.grade,
    paid: data.access.paid,
    profileAllowed: data.profileAllowed,
    state: data.contentStates.get(exam.id),
  });
  const complete = assessmentHasAllSkills(course, exam);
  const recentes = data.recent.filter((s) => s.mode === "exam");
  return (
    <>
      {/* Registro deliberadamente mais sóbrio que o das missões: simulado e
          treino são experiências diferentes, e a interface precisa dizer isso. */}
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="ceu">Um momento para conectar estratégias</Etiqueta>}
        titulo="Meu raciocínio em ação."
        apoio="Um percurso autoral com questões misturadas e devolutiva apenas ao terminar."
      />

      <Chapa tom="ceu">
        <Etiqueta tom="ceu">{course.label} · preparação independente</Etiqueta>
        <h2 className="mt-3 font-display text-2xl font-semibold text-tinta">
          Simulado de estratégias
        </h2>
        <p className="mt-2 text-tinta">
          {exam.items.length} questões · aproximadamente {exam.estimatedMinutes} minutos · retomada
          disponível.
        </p>
        <ul className="mt-4 grid gap-2">
          {[
            "Sem pistas e sem correção durante o percurso.",
            "Respostas registradas não podem ser alteradas.",
            "“Ainda não sei” deixa uma questão sem acerto.",
            "Ao responder a última questão, você vê as explicações e habilidades.",
          ].map((linha) => (
            <li key={linha} className="flex gap-2.5 text-sm text-tinta">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-ceu-fundo"
              />
              {linha}
            </li>
          ))}
        </ul>
        <p className="mt-4 mb-5 text-sm text-tinta-suave">
          Este modo formativo não reproduz duração, pontuação nem questões de uma edição oficial.
          Não inclui correção humana de prova discursiva.
        </p>
        {exam.assessmentNovelty !== "fresh" && (
          <p className="mb-5 rounded-lg border border-border bg-background/70 p-3 text-sm text-tinta">
            {exam.assessmentNovelty === "mixed"
              ? "Este percurso mistura atividades reservadas novas e já vistas. O resultado serve para orientar a prática, sem ser tratado como uma medida totalmente inédita."
              : "O banco reservado desta trilha já foi visto. Esta nova passagem é prática de recuperação e não será apresentada como uma avaliação inédita."}
          </p>
        )}
        <StartButton
          profileId={data.profile.id}
          lessonId={exam.id}
          mode="exam"
          medida="g"
          disabled={!availability.available || !complete}
        >
          Começar simulado
        </StartButton>
        {(!availability.available || !complete) && (
          <p className="mt-2 text-sm text-tinta-suave">
            {complete
              ? assertableAvailabilityMessage(availability.reason)
              : "O simulado está temporariamente incompleto durante uma correção."}
          </p>
        )}
      </Chapa>

      <h2 className="mt-9 mb-4 font-display text-2xl font-semibold text-tinta">
        Meus percursos recentes
      </h2>
      {!recentes.length && (
        <p className="text-tinta-suave">
          Nenhum simulado por aqui ainda. O primeiro fica registrado assim que você começar.
        </p>
      )}
      <div className="grid gap-3">
        {recentes.map((session) => (
          <Link
            key={session.id}
            href={`/missao/${session.id}`}
            className="flex min-h-16 items-center justify-between gap-4 rounded-card border-2 border-sombra bg-creme px-5 shadow-chapa no-underline transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
          >
            <span className="text-sm text-tinta-suave">
              {session.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </span>
            <strong className="flex items-center gap-1.5 font-display text-tinta">
              {session.completedAt
                ? "Ver devolutiva"
                : session.interruptedAt
                  ? "Ver sessão encerrada"
                  : "Retomar percurso"}
              <ArrowRight size={17} aria-hidden="true" />
            </strong>
          </Link>
        ))}
      </div>
    </>
  );
}
