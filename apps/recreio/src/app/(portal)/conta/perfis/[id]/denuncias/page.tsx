import { PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { autorDaFamilia } from "@/features/familia/autor";
import { acompanharDenuncias } from "@/features/moderacao/acompanhamento-service";
import { DenunciasDoPerfil } from "@/features/moderacao/components/denuncias";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Denúncias do perfil" };
export default async function DenunciasSobGestao({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ protocolo?: string }>;
}) {
  const perfil = PerfilIdSchema.safeParse((await params).id),
    protocolo = z
      .uuid()
      .optional()
      .safeParse((await searchParams).protocolo);
  if (!perfil.success || !protocolo.success) notFound();
  const destino = `/conta/perfis/${perfil.data}/denuncias`;
  await paginaDaGestao(destino);
  const pagina = await acompanharDenuncias(
    { tipo: "gestor", nativo: await autorDaFamilia(), perfilId: perfil.data },
    protocolo.data,
  ).catch((erro: unknown) => {
    if (erro instanceof AppError) {
      if (["PERFIL", "CONTATO"].includes(erro.code)) notFound();
      if (erro.code === "AUTH") redirect(`/entrar?recente=1&next=${encodeURIComponent(destino)}`);
      if (erro.code === "CONFLITO") return null;
    }
    throw erro;
  });
  return (
    <div className="max-w-2xl">
      {pagina ? (
        <DenunciasDoPerfil pagina={pagina} gestor destino={destino} protocolo={protocolo.data} />
      ) : (
        <div className="painel p-5">
          <h1 className="font-display text-2xl font-bold">A situação do perfil mudou</h1>
          <a
            href={destino}
            className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
          >
            Atualizar acompanhamento
          </a>
        </div>
      )}
      <Link
        href="/conta"
        className="mt-6 inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Voltar à conta
      </Link>
    </div>
  );
}
