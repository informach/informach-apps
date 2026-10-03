import { CalendarClock, RotateCcw } from "lucide-react";
import { StartButton } from "@/components/controls";
import { EmptyProfile } from "@/components/empty-profile";
import { Mascote } from "@/components/mascote";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { SeloHabilidade } from "@/components/ui/selo-habilidade";
import { coursePracticeLessons, recoveryLessons, skillNames } from "@/features/content/catalog";
import { localDay, reviewDateLabel } from "@/features/learning/engine";
import { availableLessons, reviewLesson } from "@/features/learning/recommendation";
import { recoveryRelease } from "@/features/learning/recovery";
import { currentDashboard } from "@/lib/view";

export const metadata = { title: "Revisão" };

export default async function Review() {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const course = data.course;
  if (!course) return null;
  const agora = new Date();
  const pendentes = data.states
    .filter((s) => course.skills.includes(s.skillId))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="sol">Lembrar é reconstruir</Etiqueta>}
        titulo={data.profile.grade <= 5 ? "Vamos rever uma ideia?" : "Revisar e conectar ideias."}
        apoio="Revisar em outros dias ajuda a lembrar como resolver. Você pode tentar de novo, pedir uma pista e experimentar outro caminho."
      />

      {!pendentes.length && (
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
          const options = availableLessons(coursePracticeLessons(course), {
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
            agora,
          );
          const fresh = lesson?.items.some((item) => !data.attemptedItemIds.includes(item.id));
          const waiting = recoveryLessons
            .filter((l) => l.skillId === state.skillId)
            .map((l) => recoveryRelease(l, data.evidence, agora))
            .find((r) => !r.ready && r.on);
          const pronta = state.dueOn <= localDay(agora);
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
                      {reviewDateLabel(state.dueOn)}
                    </>
                  )}
                </Etiqueta>
                <SeloHabilidade nivel={state.level} comTexto={false} />
              </div>
              <h2 className="mt-3 font-display text-xl font-semibold text-tinta">
                {skillNames[state.skillId]}
              </h2>
              <p className="mt-1.5 mb-4 text-sm text-tinta-suave">
                {state.level === "independent"
                  ? "Você já conseguiu resolver sozinho em situações diferentes. Vamos reencontrar essa ideia."
                  : "Experimente outros problemas e volte a essa ideia em dias diferentes. Pedir ajuda faz parte."}
              </p>
              <details className="mb-4 text-sm text-tinta-suave">
                <summary className="min-h-11 cursor-pointer">
                  Como este progresso é observado
                </summary>
                <p>
                  {state.independentFamilies} estratégias distintas com primeiro acerto sem pistas.
                  A autonomia também considera evidências em dias diferentes; repetir uma resposta
                  não conta como uma estratégia nova.
                </p>
              </details>
              <div className="mt-auto">
                {lesson && !fresh && (
                  <p className="mb-3 text-sm text-tinta-suave">
                    {waiting?.on
                      ? `O próximo encontro com questões novas abre em ${reviewDateLabel(waiting.on)}. Por enquanto, você pode repetir para praticar.`
                      : "Você já respondeu às questões disponíveis desta habilidade. Repetir ajuda a estudar, mas não acrescenta primeira tentativa. Explore também os desafios no laboratório."}
                  </p>
                )}
                {lesson ? (
                  <StartButton
                    profileId={data.profile?.id ?? ""}
                    lessonId={lesson.id}
                    mode="review"
                    tom={pronta ? "verde" : "contorno"}
                  >
                    {fresh ? "Reencontrar com questões novas →" : "Repetir para praticar →"}
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
