import { MundoIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Responsabilidade } from "@/features/mundos/components/responsabilidade";
import { painelDaResponsabilidade } from "@/features/mundos/responsabilidade";
import { paginaDoPortal } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Responsabilidade pelo mundo" };

export default async function ResponsabilidadePeloMundo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = MundoIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const { ator } = await paginaDoPortal(`/conta/mundos/${id.data}/responsabilidade`);
  const painel = await (async () => {
    try {
      return await painelDaResponsabilidade(
        {
          contaId: ator.contaId,
          perfilId: ator.perfil.id,
          sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
        },
        id.data,
      );
    } catch (erro) {
      if (erro instanceof AppError && erro.code === "MUNDO") notFound();
      if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
      throw erro;
    }
  })();
  return (
    <>
      <Link href="/conta/mundos" className="font-bold text-ceu underline underline-offset-4">
        Participações em mundos
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        {painel.mundo.nome}
      </h1>
      <p className="mt-3 max-w-2xl text-tinta-suave">Responsabilidade pelo mundo</p>
      <Responsabilidade
        painel={painel}
        prazoDaProposta={
          painel.proposta
            ? new Intl.DateTimeFormat("pt-BR", {
                timeZone: "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short",
              }).format(painel.proposta.expiraEm)
            : null
        }
      />
    </>
  );
}
