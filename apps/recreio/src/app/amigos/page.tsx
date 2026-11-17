import { ehErroDoRecreio, PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { paginaDoJogador } from "@/features/autoridade-de-jogo/http";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { CartaoDeContato } from "@/features/social/components/contato";
import { NovosContatos } from "@/features/social/components/novos-contatos";
import { PresencaDoPerfil } from "@/features/social/components/presenca";
import { consultarSocial } from "@/features/social/service";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Amigos" };
export default async function Amigos({
  searchParams,
}: {
  searchParams: Promise<{ apos?: string }>;
}) {
  const jogador = await paginaDoJogador("/amigos");
  const cursor = PerfilIdSchema.optional().safeParse((await searchParams).apos);
  if (!cursor.success) notFound();
  const acesso = jogador.protegido ? "/aparelho" : "/entrar?recente=1&next=%2Famigos";
  const lista = await consultarSocial(
    { perfilId: jogador.perfil.id, sessaoDeAparelhoId: jogador.sessaoDeAparelhoId },
    cursor.data ? { apos: cursor.data } : {},
  ).catch((erro: unknown) => {
    if (
      ehErroDoRecreio(erro, "SESSAO_INVALIDA") ||
      ehErroDoRecreio(erro, "SESSAO_ENCERRADA") ||
      ehErroDoRecreio(erro, "NAO_AUTENTICADO")
    )
      redirect(acesso);
    if (erro instanceof AppError && ["CONFLITO", "CONTATO"].includes(erro.code)) return null;
    throw erro;
  });
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={jogador.protegido ? "/aparelho" : "/estante"}
          aria-label="Recreio, voltar para jogar"
        >
          <Marca tamanho={30} />
        </Link>
        <div className="flex flex-wrap gap-3">
          <Link href="/denuncias" className="rb rb-vazado">
            Acompanhar denúncias
          </Link>
          <Link href={jogador.protegido ? "/aparelho" : "/estante"} className="rb rb-vazado">
            Voltar para jogar
          </Link>
        </div>
      </header>
      <div className="mt-10 flex items-center gap-4">
        <AvatarDoPerfil avatar={jogador.perfil.avatar} apelido={jogador.perfil.apelido} />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-sol">
            Seu canto no Recreio
          </p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">Amigos</h1>
          <p className="mt-2 text-tinta-suave [overflow-wrap:anywhere]">
            Contatos de {jogador.perfil.apelido}
          </p>
        </div>
      </div>
      <p className="mt-5 max-w-2xl text-tinta-suave">
        Adicione quem você conhece. Uma amizade não dá acesso aos mundos ou ao progresso de outra
        pessoa.
      </p>
      {!lista ? (
        <div className="painel mt-8 p-6">
          <p>
            Os cuidados de um perfil mudaram. Atualize os contatos para conferir as permissões
            atuais.
          </p>
          <Link
            href="/amigos"
            className="mt-3 inline-flex min-h-11 items-center font-bold text-ceu underline"
          >
            Atualizar contatos
          </Link>
        </div>
      ) : (
        <>
          {lista.podeCriarContatos ? (
            <NovosContatos perfilId={jogador.perfil.id} acesso={acesso} />
          ) : (
            <p className="painel mt-8 p-5">
              Novos contatos não estão disponíveis neste momento. Você pode cuidar dos contatos
              existentes.
              {jogador.protegido ? " Peça ao seu responsável para conferir a supervisão." : ""}
            </p>
          )}
          <section aria-labelledby="seus-contatos" className="mt-10">
            <h2 id="seus-contatos" className="font-display text-2xl font-bold">
              Seus contatos e pedidos
            </h2>
            <p className="mt-2 text-sm text-tinta-suave">
              Bloquear encerra pedidos e a amizade. Remover um contato não apaga seu progresso nem
              muda as participações nos mundos.
            </p>
            {lista.contatos.length === 0 ? (
              <p className="painel mt-5 p-6">Nenhum contato ou pedido nesta página.</p>
            ) : (
              <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
                {lista.contatos.map((contato) => (
                  <CartaoDeContato
                    key={contato.perfilId}
                    tipo="jogador"
                    perfilId={jogador.perfil.id}
                    contato={contato}
                    novosContatos={lista.podeCriarContatos}
                    destino="/amigos"
                    acesso={acesso}
                  />
                ))}
              </div>
            )}
            <nav aria-label="Páginas de contatos" className="mt-4 flex flex-wrap gap-4">
              {cursor.data && (
                <Link
                  href="/amigos"
                  className="inline-flex min-h-11 items-center font-bold text-ceu underline"
                >
                  Primeira página
                </Link>
              )}
              {lista.proximo && (
                <Link
                  href={`/amigos?apos=${lista.proximo}`}
                  className="inline-flex min-h-11 items-center font-bold text-ceu underline"
                >
                  Próximos contatos
                </Link>
              )}
            </nav>
          </section>
          <PresencaDoPerfil
            perfilId={jogador.perfil.id}
            presenca={lista.presenca}
            editavel={lista.presencaEditavel}
            acesso={acesso}
          />
        </>
      )}
    </main>
  );
}
