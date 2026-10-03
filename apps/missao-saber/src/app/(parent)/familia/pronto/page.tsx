import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { familyDashboard } from "@/features/family/view";
import { EnterStudy } from "@/features/study-access/components";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Tudo pronto para estudar" };
export default async function Ready({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  const { perfil } = await searchParams;
  await requirePageUser(`/familia/pronto${perfil ? `?perfil=${encodeURIComponent(perfil)}` : ""}`);
  const data = await familyDashboard();
  const profile = data.profiles.find((item) => item.id === perfil);
  if (!profile) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="verde">3. Tudo pronto</Etiqueta>}
        titulo={`Tudo pronto para ${profile.nickname}.`}
        apoio="A primeira missão tem espaço para tentar e pedir ajuda. O diagnóstico é uma opção, não uma obrigação para começar."
      />
      <section className="rounded-card border border-sombra bg-creme p-5 sm:p-8">
        <EnterStudy profiles={data.profiles} selected={profile.id} />
      </section>
      <Link
        href="/familia"
        className="mt-6 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      >
        Ir para meu painel
      </Link>
    </div>
  );
}
