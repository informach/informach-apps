import { MembroIdSchema, MundoIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MembrosDoMundo } from "@/features/mundos/components/membros";
import { painelDeMembros } from "@/features/mundos/remocao";
import { paginaDoPortal } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Membros do mundo" };
export default async function Membros({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apos?: string | string[] }>;
}) {
  const id = MundoIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const destino = `/conta/mundos/${id.data}/membros`;
  const { apos } = await searchParams;
  if (apos !== undefined && !MembroIdSchema.safeParse(apos).success) redirect(destino);
  const { ator } = await paginaDoPortal(destino);
  const painel = await (async () => {
    try {
      return await painelDeMembros(
        {
          contaId: ator.contaId,
          perfilId: ator.perfil.id,
          sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
        },
        id.data,
        apos,
      );
    } catch (erro) {
      if (erro instanceof AppError) {
        if (erro.code === "MUNDO" || erro.code === "RESPONSAVEL") notFound();
        if (erro.code === "AUTH") redirect("/entrar?encerrada=1");
      }
      throw erro;
    }
  })();
  return (
    <>
      <Link href="/conta/mundos" className="font-bold text-ceu underline underline-offset-4">
        Participações em mundos
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        Membros de {painel.mundo.nome}
      </h1>
      <p className="mt-3 max-w-2xl text-tinta-suave">
        Como responsável, você pode encerrar a participação de outro membro sem apagar o mundo. Para
        deixar de responder por ele, use a transferência com aceite.
      </p>
      <MembrosDoMundo painel={painel} />
      <nav aria-label="Páginas de membros" className="mt-5 flex flex-wrap gap-4">
        {apos ? (
          <Link href={destino} className="font-bold text-ceu underline underline-offset-4">
            Primeira página
          </Link>
        ) : null}
        {painel.proximo ? (
          <Link
            href={`${destino}?apos=${painel.proximo}`}
            className="font-bold text-ceu underline underline-offset-4"
          >
            Próximos membros
          </Link>
        ) : null}
      </nav>
      <Link
        href={`/conta/mundos/${id.data}/responsabilidade`}
        className="mt-6 inline-flex font-bold text-ceu underline underline-offset-4"
      >
        Responsabilidade pelo mundo
      </Link>
    </>
  );
}
