import {
  ArrowRight,
  Clock3,
  Compass,
  FlaskConical,
  NotebookPen,
  Sprout,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatares";
import { StartButton } from "@/components/controls";
import { EmptyProfile } from "@/components/empty-profile";
import { Mascote } from "@/components/mascote";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { BolhasSemana } from "@/components/ui/bolhas-semana";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { FalaFaisca } from "@/components/ui/fala-faisca";
import { Etiqueta, Ladrilho } from "@/components/ui/pagina";
import { isSuspended, lessonAvailability } from "@/features/content/availability";
import {
  assessment,
  assessmentHasAllSkills,
  courseAssessmentBanks,
  courseLessons,
  skillNames,
} from "@/features/content/catalog";
import { inGrade } from "@/features/family/school-year";
import { localDaysApart } from "@/features/learning/engine";
import { availableLessons, recommend } from "@/features/learning/recommendation";
import { currentDashboard } from "@/lib/view";

export const metadata = { title: "Hoje" };

export default async function Today() {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const profile = data.profile;
  const course = data.course;
  if (!course) return null;
  const allLessons = courseLessons(course);
  const available = availableLessons(allLessons, {
    course,
    grade: profile.grade,
    paid: data.access.paid,
    profileAllowed: data.profileAllowed,
    states: data.contentStates,
  });
  const unavailableSources = new Set(
    courseAssessmentBanks(course)
      .filter((lesson) => isSuspended(data.contentStates.get(lesson.id)))
      .map((lesson) => lesson.id),
  );
  const diagnostic = assessment(
    course,
    "diagnostic",
    unavailableSources,
    new Set(data.assessmentExposedFamilyIds),
  );
  const diagnosticReady =
    assessmentHasAllSkills(course, diagnostic) &&
    lessonAvailability({
      lesson: diagnostic,
      course,
      grade: profile.grade,
      paid: data.access.paid,
      profileAllowed: data.profileAllowed,
      state: data.contentStates.get(diagnostic.id),
    }).available;
  const agora = new Date();
  const recommendation = recommend(
    available,
    data.evidence,
    data.states,
    agora,
    new Set(data.attemptedItemIds),
  );
  const recommended = recommendation?.lesson;
  const { paused, diagnosed } = data;
  const autonomas = data.states.filter((s) => s.level === "independent").length;

  /* Reencontro sem culpa: depois de uma ausência a Faísca cumprimenta e diz o
     que ficou esperando. Nunca conta dias perdidos — as bolhas da semana são
     contagem, não corrente, e a ausência não tem preço no produto.
     O limiar é de três viradas de calendário local, a mesma unidade dos dias
     com prática e das datas de revisão. Isso pode disparar com pouco mais de
     dois dias de relógio; como a mensagem é um cumprimento e nunca uma
     cobrança, errar para o lado de acolher é o lado seguro. */
  const ultimaTentativa = data.evidence.reduce<Date | null>(
    (maior, row) => (!maior || row.createdAt > maior ? row.createdAt : maior),
    null,
  );
  const reencontro = !!ultimaTentativa && localDaysApart(ultimaTentativa, agora) >= 3;
  const esperando = data.states
    .filter((state) => state.dueAt <= agora)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
  const desafio = data.challenge;

  return (
    <>
      {data.courseTransition && (
        <FalaFaisca humor="acolhendo" tom="lima" titulo="Novo ano escolar." className="mb-5">
          <p>
            {data.courseTransition.to
              ? `Agora você está ${inGrade(profile.grade)}, e sua trilha passa a ser ${data.courseTransition.to.label}. Dá para escolher outra em Minha jornada.`
              : `Agora você está ${inGrade(profile.grade)}. As trilhas desse ano estão em preparação; enquanto isso, a sua continua aberta.`}
          </p>
        </FalaFaisca>
      )}
      <header className="mb-6 flex items-center gap-4">
        <Avatar id={profile.avatar} tamanho="m" />
        <div className="min-w-0">
          <Etiqueta tom="lima">Um pouco hoje, um novo jeito de pensar</Etiqueta>
          {/* O ponto final faz parte do título — mantém a voz do produto. */}
          <h1 className="mt-1.5 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
            Olá, {profile.nickname}.
          </h1>
        </div>
      </header>

      {reencontro && (
        <FalaFaisca humor="acolhendo" tom="lima" titulo="Bom te ver de novo." className="mb-5">
          <p>
            {esperando
              ? `A revisão de ${skillNames[esperando.skillId] ?? esperando.skillId} esperou por você. Nada se perdeu no caminho.`
              : "Sua jornada continua exatamente de onde parou. Nada se perdeu no caminho."}
          </p>
        </FalaFaisca>
      )}

      <section className="rounded-heroi border-2 border-verde/30 bg-verde-claro p-5 shadow-[0_6px_0_color-mix(in_oklab,var(--ms-verde)_28%,transparent)] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <div className="min-w-0 flex-1">
            <Etiqueta tom="verde">
              <Sprout size={14} aria-hidden="true" /> Sua missão de hoje
            </Etiqueta>
            <h2 className="mt-3 font-display text-2xl leading-tight font-semibold text-tinta sm:text-3xl">
              {paused
                ? (paused.title ?? "Seu percurso está esperando")
                : (recommended?.title ?? "Explore uma nova ideia")}
            </h2>
            <p className="mt-2.5 text-tinta">
              {paused
                ? "Continue da questão em que parou. As respostas confirmadas estão guardadas."
                : (recommended?.objective ??
                  "Assim que uma trilha for liberada, ela aparece aqui com o próximo passo.")}
            </p>
            <p className="mt-2 text-sm text-tinta-suave">
              {paused ? "Uma pausa também faz parte do caminho." : recommendation?.reason}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {paused ? (
                <LinkChapa href={`/missao/${paused.id}`} medida="g" className="max-sm:w-full">
                  Retomar missão <ArrowRight size={19} aria-hidden="true" />
                </LinkChapa>
              ) : (
                recommended && (
                  <StartButton
                    profileId={profile.id}
                    lessonId={recommended.id}
                    mode={recommendation?.mode}
                    medida="g"
                    largo
                  >
                    Começar descoberta <ArrowRight size={19} aria-hidden="true" />
                  </StartButton>
                )
              )}
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-tinta-suave">
                <Clock3 size={16} aria-hidden="true" /> cerca de {data.family?.dailyMinutes ?? 10}{" "}
                min no seu ritmo
              </span>
            </div>
          </div>
          <Mascote humor="acolhendo" tamanho="g" className="mx-auto max-sm:hidden" />
        </div>
      </section>

      {/* Desafio da família: barra única, somada. A criança vê a meta da casa,
          nunca a posição dela em relação aos irmãos. */}
      {desafio?.goal ? (
        <Chapa tom="lima" className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Etiqueta tom="lima">
              <Users size={14} aria-hidden="true" /> Desafio da família
            </Etiqueta>
            <span className="font-display font-semibold text-tinta">
              {desafio.progress} de {desafio.goal} estratégias
            </span>
          </div>
          <p className="mt-2.5 text-sm text-tinta">
            Estratégias diferentes resolvidas sem pistas por toda a casa nesta semana. Cada
            descoberta nova soma na mesma barra.
          </p>
          <BarraProgresso
            feitos={desafio.progress}
            total={desafio.goal}
            className="mt-3 max-w-md"
          />
        </Chapa>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Ladrilho
          valor={data.weekly.practiceDays}
          sufixo="/ 7"
          rotulo="dias com descobertas nesta semana"
          tom="lima"
          extra={<BolhasSemana dias={data.weekly.practiceDays} />}
        />
        <Ladrilho valor={autonomas} rotulo="habilidades com evidências de autonomia" tom="verde" />
        <Ladrilho
          valor={data.weekly.withHelp}
          rotulo="tentativas com pistas: aprender tem apoio"
          tom="sol"
        />
      </div>

      <div className="mt-9 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-tinta">
          Seu próximo pequeno passo
        </h2>
        <Link
          href="/jornada"
          className="font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta"
        >
          Ver minha jornada ↗
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Chapa tom="uva" className="flex flex-col">
          <Compass size={30} strokeWidth={2.3} aria-hidden="true" className="text-tinta" />
          <h3 className="mt-3 font-display text-lg font-semibold text-tinta">
            {diagnosed ? "Reconheça seu caminho" : "Encontre seu ponto de partida"}
          </h3>
          <p className="mt-1.5 mb-4 text-sm text-tinta-suave">
            Um diagnóstico breve orienta o treino. “Ainda não sei” também ajuda a escolher o próximo
            passo.
          </p>
          <div className="mt-auto">
            <StartButton
              profileId={profile.id}
              lessonId={diagnostic.id}
              mode="diagnostic"
              disabled={!diagnosticReady}
              tom="contorno"
              medida="p"
            >
              {diagnosed ? "Refazer diagnóstico" : "Explorar meu ponto de partida"}
            </StartButton>
            {!diagnosticReady && (
              <p className="mt-2 text-sm text-tinta-suave">
                O diagnóstico está temporariamente incompleto durante uma correção.
              </p>
            )}
          </div>
        </Chapa>

        <Link href="/laboratorio" className="no-underline">
          <Chapa tom="ceu" interativa className="flex h-full flex-col">
            <FlaskConical size={30} strokeWidth={2.3} aria-hidden="true" className="text-tinta" />
            <h3 className="mt-3 font-display text-lg font-semibold text-tinta">
              Mexa. Observe. Descubra.
            </h3>
            <p className="mt-1.5 text-sm text-tinta-suave">
              Porcentagens, malhas e grupos: ideias que você pode manipular.
            </p>
            <span className="mt-auto pt-4 font-semibold text-tinta">Abrir laboratório →</span>
          </Chapa>
        </Link>

        <Link href="/caderno" className="no-underline">
          <Chapa tom="sol" interativa className="flex h-full flex-col">
            <NotebookPen size={30} strokeWidth={2.3} aria-hidden="true" className="text-tinta" />
            <h3 className="mt-3 font-display text-lg font-semibold text-tinta">
              Guarde o seu “ah, entendi!”
            </h3>
            <p className="mt-1.5 text-sm text-tinta-suave">
              Escreva uma estratégia com suas palavras. Ela pode ajudar no próximo desafio.
            </p>
            <span className="mt-auto pt-4 font-semibold text-tinta">Abrir meu caderno →</span>
          </Chapa>
        </Link>
      </div>

      <p className="mt-7 rounded-card border-2 border-sombra bg-creme px-5 py-4 text-center font-display font-semibold text-tinta">
        Não há vidas para perder. Uma tentativa difícil mostra por onde continuar.
      </p>
    </>
  );
}
