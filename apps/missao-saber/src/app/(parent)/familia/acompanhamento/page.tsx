import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { CabecalhoPagina } from "@/components/ui/pagina";
import { LearningReport } from "@/features/family/components/learning-report";
import { familyLearningReports } from "@/features/family/reports";
import { familyReports } from "@/features/learning/repository";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Acompanhamento" };
export default async function FollowUp({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  const { perfil } = await searchParams;
  const user = await requirePageUser();
  const reports = await familyLearningReports();
  const selected = perfil ? reports.find((report) => report.profile.id === perfil) : reports[0];
  if (perfil && !selected) notFound();
  const submitted = selected ? await familyReports(user.id, selected.profile.id) : [];
  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        titulo="Aprender, observar, apoiar."
        apoio="Um relato para conversar sobre o que está sendo construído. Sem comparação entre estudantes."
      />
      {!selected ? (
        <>
          <p className="mb-5">
            Prepare um perfil para começar. O acompanhamento aparece depois das primeiras
            atividades.
          </p>
          <LinkChapa href="/familia/preparar">Preparar o primeiro estudo</LinkChapa>
        </>
      ) : (
        <>
          <nav aria-label="Estudante acompanhado" className="mb-6 flex flex-wrap gap-3">
            {reports.map(({ profile }) => (
              <Link
                key={profile.id}
                href={`/familia/acompanhamento?perfil=${profile.id}`}
                aria-current={selected.profile.id === profile.id ? "page" : undefined}
                className={`inline-flex min-h-12 items-center rounded-controle border px-4 font-semibold ${selected.profile.id === profile.id ? "border-verde-fundo bg-verde-claro" : "border-sombra"}`}
              >
                {profile.nickname}
              </Link>
            ))}
          </nav>
          <LearningReport report={selected} />
          {!!submitted.length && (
            <details className="mt-6 rounded-card border border-sombra p-5">
              <summary className="min-h-11 cursor-pointer font-semibold">
                Relatos enviados sobre atividades
              </summary>
              <ul className="mt-3 space-y-4">
                {submitted.map((report) => (
                  <li key={report.id} className="text-sm">
                    <strong>
                      {report.status === "resolved"
                        ? "Tratado"
                        : report.status === "investigating"
                          ? "Em investigação"
                          : "Recebido"}
                    </strong>
                    <p>{report.detail || "Relato enviado sem comentário adicional."}</p>
                    {report.resolution && (
                      <p className="mt-2">Retorno da manutenção: {report.resolution}</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
