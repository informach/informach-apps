import { AuditPersistenceError } from "@informach/auth";
import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader } from "@/components/blocks";
import { FichaView } from "@/features/people/components/ficha-view";
import { loadFicha } from "@/features/people/loaders";
import { requireStaff } from "@/lib/access";
import { needsConfirmation } from "@/lib/fetch-site";
import { cameFromSignInNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Ficha" };

const linkClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl px-4 font-extrabold no-underline";

/**
 * Abrir a ficha grava a consulta na auditoria (`admin.user_viewed`), em nome de
 * quem abriu. Um link vindo de outro site (`Sec-Fetch-Site` igual a
 * `cross-site` ou `same-site`, ou ausente) não pode fazer alguém da equipe
 * gravar uma consulta sem querer: aí aparece só a pergunta, e o clique no
 * botão, já de dentro do Bastidores, abre a ficha. `none` (endereço digitado ou
 * favorito) e `same-origin` abrem direto, menos quando a ficha chega pelo `next`
 * da entrada: o link de fora que levou à tela de entrada escolheu o destino, e
 * a navegação depois do código sai de dentro. `safeNext` marca esse destino
 * (`?confirmar=1`), e a marca vale como navegação de fora.
 */
export default async function FichaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const personId = decodeURIComponent(id);

  if (
    cameFromSignInNext(await searchParams) ||
    needsConfirmation((await headers()).get("sec-fetch-site"))
  ) {
    return (
      <>
        <PageHeader title="Abrir esta ficha?" />
        <Empty>
          Você chegou aqui por um link, não por uma tela do Bastidores. Abrir a ficha grava a
          consulta na auditoria em seu nome, então ela só abre quando você confirma.
        </Empty>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/pessoas/${encodeURIComponent(personId)}` as Route}
            prefetch={false}
            className={`${linkClass} bg-night text-white`}
          >
            Abrir a ficha
          </Link>
          <Link
            href="/pessoas"
            prefetch={false}
            className={`${linkClass} border border-line-warm bg-surface text-ink`}
          >
            Voltar para Pessoas
          </Link>
        </div>
      </>
    );
  }

  let ficha: Awaited<ReturnType<typeof loadFicha>>;
  try {
    ficha = await loadFicha(personId, staff);
  } catch (error) {
    if (!(error instanceof AuditPersistenceError)) throw error;
    // Sem o rastro gravado, a ficha não aparece.
    return (
      <>
        <PageHeader title="A ficha não abriu" />
        <Empty>
          Não deu para registrar a consulta na auditoria, e sem esse registro a ficha não aparece.
          Tente de novo em instantes.
        </Empty>
        <Link
          href={`/pessoas/${encodeURIComponent(personId)}` as Route}
          prefetch={false}
          className={`${linkClass} justify-self-start bg-night text-white`}
        >
          Tentar de novo
        </Link>
      </>
    );
  }
  if (!ficha) notFound();
  return <FichaView ficha={ficha} staff={staff} />;
}
