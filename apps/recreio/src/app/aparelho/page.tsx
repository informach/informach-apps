import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { SairDoAparelho } from "@/features/protecao/components/encerrar-aparelho";
import { aparelhoPareadoAtual } from "@/features/protecao/http";

export const metadata = { title: "Seu aparelho" };
export default async function Aparelho() {
  const atual = await aparelhoPareadoAtual();
  if (!atual) redirect("/parear");
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-2xl px-4 py-10 sm:px-8">
      <Link href="/" aria-label="Recreio, página inicial" className="inline-flex">
        <Marca tamanho={32} />
      </Link>
      <section className="painel mt-10 p-6 sm:p-8">
        <AvatarDoPerfil avatar={atual.perfil.avatar} apelido={atual.perfil.apelido} tamanho="lg" />
        <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
          Olá, {atual.perfil.apelido}!
        </h1>
        <p className="mt-3 text-lg text-tinta-suave">
          Este aparelho está ligado ao seu perfil do Recreio.
        </p>
        <div className="mt-8">
          <SairDoAparelho />
        </div>
      </section>
    </main>
  );
}
