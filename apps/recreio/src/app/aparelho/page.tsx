import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { SairDoAparelho } from "@/features/protecao/components/encerrar-aparelho";
import { aparelhoPareadoAtual, temContextoPareado } from "@/features/protecao/http";
import { identidadeNativaDoAparelho } from "@/features/protecao/nativo";
import { escolhasDoAparelho } from "@/features/protecao/service";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Seu aparelho" };
export default async function Aparelho() {
  const pareado = await aparelhoPareadoAtual();
  if (!pareado && (await temContextoPareado())) redirect("/parear");
  const identidade = !pareado ? await identidadeNativaDoAparelho() : null;
  if (!pareado && !identidade) redirect("/parear");
  const escolhas = identidade
    ? await escolhasDoAparelho(identidade).catch((erro: unknown) => {
        if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
        throw erro;
      })
    : null;
  if (escolhas && !escolhas.restrito) redirect("/perfis");
  const perfil =
    pareado?.perfil ?? escolhas?.menores.find((item) => item.id === escolhas.atualId) ?? null;
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-2xl px-4 py-10 sm:px-8">
      <Link href="/" aria-label="Recreio, página inicial" className="inline-flex">
        <Marca tamanho={32} />
      </Link>
      <section className="painel mt-10 p-6 sm:p-8">
        {perfil && <AvatarDoPerfil avatar={perfil.avatar} apelido={perfil.apelido} tamanho="lg" />}
        <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
          {perfil ? `Olá, ${perfil.apelido}!` : "Este perfil não está disponível"}
        </h1>
        <p className="mt-3 text-lg text-tinta-suave">
          {pareado
            ? "Este aparelho está ligado ao seu perfil do Recreio."
            : perfil
              ? "Você está jogando em um aparelho compartilhado."
              : "Peça ao adulto para conferir a escolha do perfil neste aparelho."}
        </p>
        <div className="mt-8">
          {!pareado && (
            <Link href="/perfis" className="rb rb-vazado mb-4">
              Trocar de perfil
            </Link>
          )}
          <SairDoAparelho tipo={pareado ? "pareado" : "compartilhado"} />
        </div>
      </section>
    </main>
  );
}
