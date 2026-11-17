import { MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { mundosSobResponsabilidadeDoMenor } from "@/features/mundos/mundos-do-menor-repository";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Mundos do perfil" };
export default async function MundosDoPerfil({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apos?: string }>;
}) {
  const perfil = PerfilIdSchema.safeParse((await params).id),
    cursor = MundoIdSchema.optional().safeParse((await searchParams).apos);
  if (!perfil.success || !cursor.success) notFound();
  const destino = `/conta/perfis/${perfil.data}/mundos`;
  await paginaDaGestao(destino);
  const pagina = await mundosSobResponsabilidadeDoMenor(
    await autorDaFamilia(),
    perfil.data,
    cursor.data,
  ).catch((erro: unknown) => {
    if (erro instanceof AppError && ["PERFIL", "CONTATO"].includes(erro.code)) notFound();
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <div className="max-w-2xl">
      <Link href="/conta/perfis" className="font-bold text-ceu underline">
        Perfis sob seus cuidados
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        Mundos de {pagina.apelido}
      </h1>
      <p className="mt-4 text-tinta-suave">
        Mundos em que este perfil é responsável. Sua gestão depende do vínculo atual de
        responsabilidade pelo perfil; pagar a assinatura não substitui esse vínculo.
      </p>
      {pagina.itens.length === 0 ? (
        <p className="painel mt-6 p-5">
          Nenhum mundo sob responsabilidade deste perfil nesta página.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {pagina.itens.map((mundo) => (
            <li key={mundo.id} className="painel p-5">
              <h2 className="font-display text-xl font-bold [overflow-wrap:anywhere]">
                {mundo.nome}
              </h2>
              <p className="mt-2 text-sm text-tinta-suave">
                {mundo.estado === "archived" ? "Arquivado" : "Disponível"}
              </p>
              <Link
                href={`${destino}/${mundo.id}/gestao`}
                className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
              >
                Gerenciar {mundo.nome}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav className="mt-5 flex gap-4" aria-label="Páginas dos mundos do perfil">
        {cursor.data && (
          <Link href={destino} className="font-bold text-ceu underline">
            Primeira página
          </Link>
        )}
        {pagina.proximo && (
          <Link href={`${destino}?apos=${pagina.proximo}`} className="font-bold text-ceu underline">
            Próximos mundos
          </Link>
        )}
      </nav>
    </div>
  );
}
