import { ehErroDoRecreio } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Marca } from "@/components/desenhos";
import { paginaDoJogador } from "@/features/autoridade-de-jogo/http";
import { acompanharDenuncias } from "@/features/moderacao/acompanhamento-service";
import { DenunciasDoPerfil } from "@/features/moderacao/components/denuncias";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Acompanhar denúncias" };
export default async function Denuncias({
  searchParams,
}: {
  searchParams: Promise<{ protocolo?: string }>;
}) {
  const jogador = await paginaDoJogador("/denuncias");
  const protocolo = z
    .uuid()
    .optional()
    .safeParse((await searchParams).protocolo);
  if (!protocolo.success) notFound();
  const pagina = await acompanharDenuncias(
    {
      tipo: "jogador",
      jogador: {
        perfilId: jogador.perfil.id,
        sessaoDeAparelhoId: jogador.sessaoDeAparelhoId,
      },
    },
    protocolo.data,
  ).catch((erro: unknown) => {
    if (
      ehErroDoRecreio(erro, "SESSAO_INVALIDA") ||
      ehErroDoRecreio(erro, "SESSAO_ENCERRADA") ||
      ehErroDoRecreio(erro, "NAO_AUTENTICADO")
    )
      redirect(jogador.protegido ? "/aparelho" : "/entrar?recente=1&next=%2Fdenuncias");
    if (erro instanceof AppError && ["CONFLITO", "CONTATO"].includes(erro.code)) return null;
    throw erro;
  });
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-3xl px-4 py-8 sm:px-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <Link
          href={jogador.protegido ? "/aparelho" : "/estante"}
          aria-label="Recreio, voltar para jogar"
        >
          <Marca tamanho={30} />
        </Link>
        <Link href="/amigos" className="rb rb-vazado">
          Voltar aos contatos
        </Link>
      </header>
      {pagina ? (
        <DenunciasDoPerfil
          pagina={pagina}
          gestor={false}
          destino="/denuncias"
          protocolo={protocolo.data}
        />
      ) : (
        <div className="painel p-5">
          <h1 className="font-display text-2xl font-bold">Confira o acesso deste perfil</h1>
          <p className="mt-3 text-tinta-suave">
            Os cuidados ou o aparelho mudaram. Atualize para consultar seus protocolos.
          </p>
          <a
            href="/denuncias"
            className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
          >
            Atualizar acompanhamento
          </a>
        </div>
      )}
    </main>
  );
}
