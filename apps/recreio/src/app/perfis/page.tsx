import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { Sair } from "@/features/account/components/sair";
import { EscolherPerfil } from "@/features/perfis/components/escolher-perfil";
import { SairDoAparelho } from "@/features/protecao/components/encerrar-aparelho";
import { EscolherComPin } from "@/features/protecao/components/escolher-com-pin";
import { temContextoPareado } from "@/features/protecao/http";
import { identidadeNativaDoAparelho } from "@/features/protecao/nativo";
import { escolhasDoAparelho } from "@/features/protecao/service";
import { paginaDaConta } from "@/features/sessao/ator";
import { safeDestination } from "@/lib/destination";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Quem vai jogar?" };

/** A lista é do servidor; um contexto infantil usa PIN e nunca recebe dados da conta. */
export default async function Perfis({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const destino = safeDestination((await searchParams).next);
  const volta = destino === "/estante" ? "/perfis" : `/perfis?next=${encodeURIComponent(destino)}`;
  if (await temContextoPareado()) redirect("/aparelho");
  const identidade = await identidadeNativaDoAparelho();
  if (!identidade) {
    await paginaDaConta(volta);
    redirect("/entrar?encerrada=1");
  }
  const escolhas = await escolhasDoAparelho(identidade).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  const nativo = escolhas.restrito ? null : await paginaDaConta(volta);
  const comPin = [
    ...(escolhas.restrito && escolhas.pinDaContaDefinido && escolhas.adulto
      ? [escolhas.adulto]
      : []),
    ...escolhas.menores,
  ].map((perfil) => ({ ...perfil, atual: perfil.id === escolhas.atualId }));
  return (
    <main id="conteudo" className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-10 sm:px-8">
      <Link href="/" aria-label="Recreio, página inicial" className="inline-flex">
        <Marca tamanho={32} />
      </Link>
      <h1 className="mt-8 font-display text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
        Quem vai jogar?
      </h1>
      <p className="mt-3 max-w-xl text-lg leading-relaxed text-tinta-suave">
        Escolha o perfil que joga neste aparelho.
      </p>
      {nativo && nativo.perfis.length > 0 && (
        <div className="mt-8">
          <EscolherPerfil
            next={destino}
            perfis={nativo.perfis.map((perfil) => ({
              id: perfil.id,
              apelido: perfil.apelido,
              avatar: perfil.avatar,
              atual: perfil.id === nativo.ator.perfil?.id,
            }))}
          />
        </div>
      )}
      {(comPin.length > 0 || (escolhas.restrito && escolhas.pinDaContaDefinido)) && (
        <section className="mt-8" aria-labelledby="perfis-com-pin">
          <h2 id="perfis-com-pin" className="mb-4 font-display text-2xl font-bold">
            {escolhas.restrito ? "Escolha com PIN" : "Perfis protegidos"}
          </h2>
          <EscolherComPin
            perfis={comPin}
            gestao={escolhas.restrito && escolhas.pinDaContaDefinido}
          />
        </section>
      )}
      {nativo && nativo.perfis.length === 0 && comPin.length === 0 && (
        <section className="painel mt-8 p-5">
          <p>Você pode cuidar da conta sem ocupar um perfil de jogador.</p>
          <Link href="/comecar" className="mt-3 inline-block font-bold text-ceu underline">
            Criar meu perfil para jogar
          </Link>
        </section>
      )}
      {nativo ? (
        <div className="mt-8">
          <Link href="/conta" className="mb-5 inline-block font-bold text-ceu underline">
            Voltar à conta
          </Link>
          <p className="text-sm font-semibold text-tinta-suave [overflow-wrap:anywhere]">
            Você entrou como {nativo.user.email}. Não é você?
          </p>
          <div className="mt-3">
            <Sair />
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <p className="text-sm text-tinta-suave">
            A área do adulto pede o PIN dele ou uma nova entrada.
          </p>
          <Link
            href="/entrar?recente=1&next=%2Fconta"
            className="my-4 inline-block font-bold text-ceu underline"
          >
            O adulto pode entrar novamente
          </Link>
          <SairDoAparelho tipo="compartilhado" />
        </div>
      )}
    </main>
  );
}
