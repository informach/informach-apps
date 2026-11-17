import Link from "next/link";
import { Marca } from "@/components/desenhos";
import { novosPerfisProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { ParearAparelho } from "@/features/protecao/components/parear-aparelho";

export const metadata = { title: "Parear aparelho" };
export default function Parear() {
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-2xl px-4 py-10 sm:px-8">
      <Link href="/" aria-label="Recreio, página inicial" className="inline-flex">
        <Marca tamanho={32} />
      </Link>
      <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
        Um aparelho para jogar
      </h1>
      <p className="mt-3 text-lg text-tinta-suave">
        Sem compartilhar senha ou código de e-mail. Quem cuida do perfil confirma a entrada no
        próprio aparelho.
      </p>
      {novosPerfisProtegidosDisponiveis ? (
        <ParearAparelho />
      ) : (
        <p className="painel mt-8 p-6">
          O pareamento de novos aparelhos ainda não está disponível neste acesso.
        </p>
      )}
      <p className="mt-6 text-sm text-tinta-suave">
        É o aparelho do adulto?{" "}
        <Link href="/entrar?recente=1&next=%2Fconta" className="font-bold text-ceu underline">
          Entrar na minha conta
        </Link>
        .
      </p>
    </main>
  );
}
