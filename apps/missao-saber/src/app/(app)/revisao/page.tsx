import { CalendarClock, RotateCcw } from "lucide-react";
import { StartButton } from "@/components/controls";
import { EmptyProfile } from "@/components/empty-profile";
import { Mascote } from "@/components/mascote";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { SeloHabilidade } from "@/components/ui/selo-habilidade";
import { courseLessons, findCourse, skillNames } from "@/features/content/catalog";
import { availableLessons, reviewLesson } from "@/features/learning/recommendation";
import { currentDashboard } from "@/lib/view";

export default async function Review() {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const course = findCourse(data.profile.courseId);
  if (!course) return null;
  const agora = new Date();
  const pendentes = data.states
    .filter((s) => course.skills.includes(s.skillId))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="sol">Lembrar é reconstruir</Etiqueta>}
        titulo="Bom te reencontrar, ideia."
        apoio="Revisões distribuídas no tempo ajudam a recuperar uma estratégia. Uma resposta repetida não conta como um problema novo."
      />

      {!data.states.length && (
        <Chapa tom="creme" className="text-center">
          <Mascote humor="descansando" tamanho="m" className="mx-auto" />
          <h2 className="mt-2 font-display text-xl font-semibold text-tinta">
            Seu primeiro reencontro vem depois da prática.
          </h2>
          <p className="mx-auto mt-2 mb-5 max-w-md text-sm text-tinta-suave">
            Conclua uma missão. As habilidades trabalhadas aparecerão aqui com uma data de retorno.
          </p>
          <LinkChapa href="/jornada" medida="g">
            Explorar minha jornada
          </LinkChapa>
        </Chapa>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {pendentes.map((state) => {
          const options = availableLessons(courseLessons(course), {
            course,
            grade: data.profile.grade,
            paid: data.access.paid,
            profileAllowed: data.profileAllowed,
            states: data.contentStates,
          });
          const lesson = reviewLesson(
            options,
            state.skillId,
            data.evidence,
            new Set(data.attemptedItemIds),
          );
          const pronta = state.dueAt <= agora;
          return (
            <Chapa key={state.skillId} tom={pronta ? "sol" : "creme"} className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                {/* Ícone + texto: o estado nunca depende só da cor. */}
                <Etiqueta tom={pronta ? "sol" : "creme"}>
                  {pronta ? (
                    <>
                      <RotateCcw size={14} aria-hidden="true" /> Pronta para rever
                    </>
                  ) : (
                    <>
                      <CalendarClock size={14} aria-hidden="true" /> Volte em{" "}
                      {state.dueAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </>
                  )}
                </Etiqueta>
                <SeloHabilidade nivel={state.level} comTexto={false} />
              </div>
              <h2 className="mt-3 font-display text-xl font-semibold text-tinta">
                {skillNames[state.skillId]}
              </h2>
              <p className="mt-1.5 mb-4 text-sm text-tinta-suave">
                {state.independentFamilies} estratégias distintas com primeiro acerto sem pistas.{" "}
                {state.level === "independent"
                  ? "Há evidências em mais de um dia."
                  : "Continue variando os problemas e reencontrando a ideia em outros dias."}
              </p>
              <div className="mt-auto">
                {lesson ? (
                  <StartButton
                    profileId={data.profile?.id ?? ""}
                    lessonId={lesson.id}
                    mode="review"
                    tom={pronta ? "verde" : "contorno"}
                  >
                    Reencontrar esta ideia →
                  </StartButton>
                ) : (
                  <p className="text-sm text-tinta-suave">
                    As missões desta habilidade estão pausadas para correção ou exigem assinatura.
                    Seu histórico continua disponível.
                  </p>
                )}
              </div>
            </Chapa>
          );
        })}
      </div>
    </>
  );
}
