import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatares";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { skillNames } from "@/features/content/catalog";
import { familyLearningReports } from "@/features/family/reports";
import { gradeLabel } from "@/features/family/school-year";
import { familyDashboard } from "@/features/family/view";

export const metadata = { title: "Visão geral da família" };
export default async function Family({
  searchParams,
}: {
  searchParams: Promise<{ pagamento?: string }>;
}) {
  const { pagamento } = await searchParams;
  if (pagamento) redirect(`/familia/conta?pagamento=${encodeURIComponent(pagamento)}`);
  const data = await familyDashboard();
  const reports = await familyLearningReports();
  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="verde">Área do responsável</Etiqueta>}
        titulo={
          data.profiles.length
            ? "Cada descoberta tem seu tempo."
            : "Vamos preparar o primeiro estudo."
        }
        apoio={
          data.profiles.length
            ? "Veja o que está sendo aprendido e encontre uma forma de apoiar. Cada estudante segue o próprio caminho."
            : "Você prepara o perfil e depois passa o aparelho para quem vai estudar. As primeiras missões são gratuitas, sem cartão."
        }
      />
      {!data.profiles.length ? (
        <section className="rounded-card border border-sombra bg-creme p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold">Um começo, em três passos</h2>
          <ol className="my-5 space-y-3 text-tinta-suave">
            <li>1. Informe o apelido e o ano escolar.</li>
            <li>2. Conheça a trilha sugerida para esse ano.</li>
            <li>3. Abra o estudo quando estiverem prontos.</li>
          </ol>
          <LinkChapa href="/familia/preparar" medida="g">
            Preparar o primeiro estudo
          </LinkChapa>
          <p className="mt-4 text-sm text-tinta-suave">
            O acompanhamento começa depois da primeira missão. Rotina e outras preferências podem
            esperar.
          </p>
        </section>
      ) : (
        <div className="grid gap-5">
          {reports.map(({ profile, course, last, activity, narrative, nextSkill }) => (
            <section
              key={profile.id}
              className="rounded-card border border-sombra bg-creme p-5 sm:p-6"
            >
              <div className="flex items-center gap-3">
                <Avatar id={profile.avatar} tamanho="p" />
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold wrap-anywhere">
                    {profile.nickname}
                  </h2>
                  <p className="text-sm text-tinta-suave">
                    {gradeLabel(profile.grade)} · {course?.label}
                  </p>
                </div>
              </div>
              {activity ? (
                <>
                  <p className="mt-4 text-sm text-tinta-suave">
                    Última atividade: {activity.label} ·{" "}
                    {activity.createdAt.toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                    .
                  </p>
                  <p className="mt-2 leading-relaxed">{activity.detail ?? narrative.linhas[0]}</p>
                </>
              ) : (
                <p className="mt-4">
                  Tudo pronto para começar. O acompanhamento de {profile.nickname} aparece depois
                  das primeiras missões.
                </p>
              )}
              {nextSkill && (
                <p className="mt-2 text-sm text-tinta-suave">
                  {last ? "Próximo assunto da trilha" : "Sugestão inicial da trilha"}:{" "}
                  {skillNames[nextSkill] ?? nextSkill}.
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <LinkChapa
                  href={
                    activity
                      ? `/familia/acompanhamento?perfil=${profile.id}`
                      : `/estudar?perfil=${profile.id}`
                  }
                  medida="p"
                >
                  {activity
                    ? `Acompanhar ${profile.nickname}`
                    : `Abrir estudo de ${profile.nickname}`}
                </LinkChapa>
                <Link
                  href={
                    activity
                      ? `/estudar?perfil=${profile.id}`
                      : `/familia/acompanhamento?perfil=${profile.id}`
                  }
                  className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
                >
                  {activity ? `Abrir estudo de ${profile.nickname}` : "Ver acompanhamento"}
                </Link>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
