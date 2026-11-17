import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { Sair } from "@/features/account/components/sair";
import { EstadoDoAcesso } from "@/features/acesso/components/estado-do-acesso";
import { avaliarAcesso } from "@/features/acesso/service";
import { descreverAcesso } from "@/features/acesso/texto";
import { novosPerfisProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { listarPerfisMenores } from "@/features/familia/service";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { paginaDaGestao } from "@/features/sessao/ator";
import { env } from "@/lib/env";

export const metadata = { title: "Conta" };

export default async function Conta() {
  const { user, ator, perfis } = await paginaDaGestao();
  const familiaVisivel =
    novosPerfisProtegidosDisponiveis || (await listarPerfisMenores(ator)).itens.length > 0;
  const perfil = ator.perfil;
  const acesso = perfil ? await avaliarAcesso({ profileId: perfil.id }) : null;
  const texto = acesso
    ? descreverAcesso(acesso, { fechado: env.RECREIO_ACCESS_MODE === "fechado" })
    : null;
  return (
    <>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Conta</h1>
      <div className="mt-8 grid max-w-2xl gap-5">
        {!perfil && (
          <section aria-labelledby="conta-sem-jogador" className="painel p-5 sm:p-6">
            <h2 id="conta-sem-jogador" className="font-display text-xl font-bold">
              Sua conta
            </h2>
            <p className="mt-2 text-tinta-suave">
              Você pode administrar sua conta sem usar um perfil de jogador.
            </p>
            <Link href={perfis.length ? "/perfis" : "/comecar"} className="rb rb-vazado mt-4">
              {perfis.length ? "Escolher quem joga" : "Criar meu perfil para jogar"}
            </Link>
          </section>
        )}
        {perfil && (
          <section aria-labelledby="conta-perfil" className="painel p-5 sm:p-6">
            <h2 id="conta-perfil" className="font-display text-xl font-bold">
              Quem está jogando
            </h2>
            <div className="mt-3 flex items-center gap-4">
              <AvatarDoPerfil avatar={perfil.avatar} apelido={perfil.apelido} />
              <p className="min-w-0 flex-1 text-lg font-semibold [overflow-wrap:anywhere]">
                {perfil.apelido}
              </p>
              <Link href="/perfis" className="rb rb-vazado">
                Trocar de perfil
              </Link>
            </div>
            <Link
              href="/conta/perfil"
              className="mt-4 inline-flex font-bold text-ceu underline underline-offset-4"
            >
              Editar perfil
            </Link>
          </section>
        )}

        {texto && (
          <section aria-labelledby="conta-acesso" className="painel p-5 sm:p-6">
            <EstadoDoAcesso texto={texto} id="conta-acesso" />
          </section>
        )}

        {perfil && (
          <section aria-labelledby="conta-mundos" className="painel p-5 sm:p-6">
            <h2 id="conta-mundos" className="font-display text-xl font-bold">
              Mundos
            </h2>
            <p className="mt-2 text-tinta-suave">
              Confira seus vínculos e saia dos mundos em que não quiser continuar.
            </p>
            <Link
              href="/conta/mundos"
              className="mt-4 inline-flex font-bold text-ceu underline underline-offset-4"
            >
              Gerenciar participações
            </Link>
          </section>
        )}

        <section aria-labelledby="conta-email" className="painel p-5 sm:p-6">
          <h2 id="conta-email" className="font-display text-xl font-bold">
            E-mail da conta
          </h2>
          <p className="mt-2 text-lg font-semibold [overflow-wrap:anywhere]">{user.email}</p>
          <p className="mt-1 text-sm text-tinta-suave">
            É a conta Informach, a mesma dos outros apps da casa.
          </p>
          <div className="mt-5">
            <Sair />
          </div>
        </section>

        <section aria-labelledby="conta-cobertura" className="painel p-5 sm:p-6">
          <h2 id="conta-cobertura" className="font-display text-xl font-bold">
            Cobertura do grupo
          </h2>
          <p className="mt-2 text-tinta-suave">
            Confira quais jogadores ficam na cobertura que você administra.
          </p>
          <Link
            href="/conta/grupo"
            className="mt-4 inline-flex font-bold text-ceu underline underline-offset-4"
          >
            Gerenciar cobertura
          </Link>
        </section>

        {familiaVisivel && (
          <section aria-labelledby="conta-familia" className="painel p-5 sm:p-6">
            <h2 id="conta-familia" className="font-display text-xl font-bold">
              Família
            </h2>
            <p className="mt-2 text-tinta-suave">
              Cuide dos perfis de crianças e adolescentes sob sua responsabilidade.
            </p>
            <Link
              href="/conta/perfis"
              className="mt-4 inline-flex font-bold text-ceu underline underline-offset-4"
            >
              Gerenciar perfis
            </Link>
          </section>
        )}

        <section aria-labelledby="conta-protecao" className="painel p-5 sm:p-6">
          <h2 id="conta-protecao" className="font-display text-xl font-bold">
            Proteção do aparelho
          </h2>
          <p className="mt-2 text-tinta-suave">
            Configure o PIN da sua área para usar aparelhos compartilhados com segurança.
          </p>
          <Link
            href="/conta/protecao"
            className="mt-4 inline-flex font-bold text-ceu underline underline-offset-4"
          >
            Gerenciar PIN
          </Link>
        </section>

        <section aria-labelledby="conta-aparelhos" className="painel p-5 sm:p-6">
          <h2 id="conta-aparelhos" className="font-display text-xl font-bold">
            Aparelhos
          </h2>
          <p className="mt-2 text-tinta-suave">
            Confira as sessões da sua conta no Recreio e desconecte outros aparelhos.
          </p>
          <Link
            href="/conta/aparelhos"
            className="mt-4 inline-flex font-bold text-ceu underline underline-offset-4"
          >
            Gerenciar aparelhos
          </Link>
        </section>

        <section aria-labelledby="conta-exclusao" className="painel p-5 sm:p-6">
          <h2 id="conta-exclusao" className="font-display text-xl font-bold">
            Excluir a conta
          </h2>
          <p className="mt-2 text-tinta-suave">
            A exclusão ainda não é feita por aqui. Para pedir, mande uma mensagem no direct do
            Instagram, em{" "}
            <a
              href={INFORMACH_CONTACT.directMessageUrl}
              className="font-bold text-ceu underline underline-offset-4"
            >
              @{INFORMACH_CONTACT.instagramHandle}
            </a>
            .
          </p>
        </section>

        <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-tinta-suave">
          <Link href="/termos" className="underline underline-offset-4 hover:text-tinta">
            Termos
          </Link>
          <Link href="/privacidade" className="underline underline-offset-4 hover:text-tinta">
            Privacidade
          </Link>
        </p>
      </div>
    </>
  );
}
