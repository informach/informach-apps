import { PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autorDaFamilia } from "@/features/familia/autor";
import { paginaDaGestao } from "@/features/sessao/ator";
import { CartaoDeContato } from "@/features/social/components/contato";
import { consultarContatosDoMenor } from "@/features/social/supervisao-service";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Contatos do perfil" };
export default async function ContatosDoPerfil({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apos?: string }>;
}) {
  const perfilId = PerfilIdSchema.safeParse((await params).id),
    cursor = PerfilIdSchema.optional().safeParse((await searchParams).apos);
  if (!perfilId.success || !cursor.success) notFound();
  const destino = `/conta/perfis/${perfilId.data}/contatos`;
  await paginaDaGestao(destino);
  const acesso = `/entrar?recente=1&next=${encodeURIComponent(destino)}`;
  const pagina = await consultarContatosDoMenor(
    await autorDaFamilia(),
    perfilId.data,
    cursor.data ? { apos: cursor.data } : {},
  ).catch((erro: unknown) => {
    if (erro instanceof AppError) {
      if (erro.code === "PEDIDO" || erro.code === "PERFIL") notFound();
      if (erro.code === "AUTH") redirect(acesso);
      if (erro.code === "CONFLITO") return null;
    }
    throw erro;
  });
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-widest text-sol">Cuidados do perfil</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        {pagina ? `Contatos de ${pagina.apelido}` : "Contatos do perfil"}
      </h1>
      <p className="mt-4 text-tinta-suave">
        Você analisa os pedidos e cuida das relações deste perfil. A identificação exibida foi
        escolhida pela outra pessoa; não é uma comprovação de identidade.
      </p>
      {!pagina ? (
        <div className="painel mt-6 p-5">
          <p>Os cuidados mudaram. Confira a supervisão antes de continuar.</p>
          <Link
            href={`/conta/perfis/${perfilId.data}/supervisao`}
            className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
          >
            Conferir supervisão
          </Link>
        </div>
      ) : (
        <>
          <p className="painel mt-6 p-4 font-semibold" role="status">
            {pagina.avisosNaoLidos === 0
              ? "Nenhum aviso pendente de leitura."
              : `${pagina.avisosNaoLidos} ${pagina.avisosNaoLidos === 1 ? "aviso aguarda" : "avisos aguardam"} sua leitura.`}
          </p>
          <p className="mt-4 text-sm text-tinta-suave">
            Aprovar não substitui o aceite de quem recebeu o pedido. Remover ou bloquear não apaga o
            progresso nem transfere a responsabilidade por mundos.
          </p>
          {pagina.contatos.length === 0 ? (
            <p className="painel mt-6 p-6">Nenhum contato ou pedido nesta página.</p>
          ) : (
            <div className="mt-6 grid gap-4">
              {pagina.contatos.map((contato) => (
                <CartaoDeContato
                  key={contato.perfilId}
                  tipo="responsavel"
                  perfilId={pagina.perfilId}
                  contato={contato}
                  versao={pagina.versao}
                  destino={destino}
                  acesso={acesso}
                />
              ))}
            </div>
          )}
          <nav aria-label="Páginas de contatos do perfil" className="mt-4 flex flex-wrap gap-4">
            {cursor.data && (
              <Link
                href={destino}
                className="inline-flex min-h-11 items-center font-bold text-ceu underline"
              >
                Primeira página
              </Link>
            )}
            {pagina.proximo && (
              <Link
                href={`${destino}?apos=${pagina.proximo}`}
                className="inline-flex min-h-11 items-center font-bold text-ceu underline"
              >
                Próximos contatos
              </Link>
            )}
          </nav>
        </>
      )}
      <Link
        href={`/conta/perfis/${perfilId.data}/supervisao`}
        className="mt-6 inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Voltar à supervisão
      </Link>
    </div>
  );
}
