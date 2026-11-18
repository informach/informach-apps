import { MembroIdSchema, MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { TransferenciaDoMenor } from "@/features/mundos/components/transferencia-do-menor";
import { painelDaTransferenciaDoMenor } from "@/features/mundos/responsabilidade-infantil";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Transferir o mundo do perfil" };
export default async function Transferencia({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mundoId: string }>;
  searchParams: Promise<{ apos?: string }>;
}) {
  const p = await params,
    perfil = PerfilIdSchema.safeParse(p.id),
    mundo = MundoIdSchema.safeParse(p.mundoId),
    cursor = MembroIdSchema.optional().safeParse((await searchParams).apos);
  if (!perfil.success || !mundo.success || !cursor.success) notFound();
  const destino = `/conta/perfis/${perfil.data}/mundos/${mundo.data}/responsabilidade`;
  const painel = await painelDaTransferenciaDoMenor(
    await autorDaFamilia(),
    perfil.data,
    mundo.data,
    cursor.data,
  ).catch((erro: unknown) => {
    if (
      erro instanceof AppError &&
      ["PERFIL", "MUNDO", "CONTATO", "RESPONSAVEL"].includes(erro.code)
    )
      notFound();
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <>
      <Link
        href={`/conta/perfis/${perfil.data}/mundos/${mundo.data}/gestao`}
        className="inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Gestão do mundo
      </Link>
      <h1 className="mt-5 font-display text-3xl font-extrabold [overflow-wrap:anywhere]">
        {painel.mundo.nome}
      </h1>
      <TransferenciaDoMenor perfilId={perfil.data} painel={painel} destino={destino} />
      <nav
        aria-label="Páginas de participantes para transferência"
        className="mt-4 flex flex-wrap gap-4"
      >
        {cursor.data && (
          <Link href={destino} className="rb rb-vazado">
            Primeira página
          </Link>
        )}
        {painel.proximo && (
          <Link href={`${destino}?apos=${painel.proximo}`} className="rb rb-vazado">
            Próximos participantes
          </Link>
        )}
      </nav>
    </>
  );
}
