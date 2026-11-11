import { APELIDO } from "@informach/recreio";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { Sair } from "@/features/account/components/sair";
import { CriarPerfil } from "@/features/perfis/components/criar-perfil";
import { paginaDaConta } from "@/features/sessao/ator";

export const metadata = { title: "Começar" };

/** Primeiro uso: a conta ganha o seu perfil. Quem já tem um vai escolher quem joga. */
export default async function Comecar() {
  const { user, ator, perfis } = await paginaDaConta("/comecar");
  if (perfis.length > 0) redirect(ator.perfil ? "/estante" : "/perfis");
  return (
    <main id="conteudo" className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-10 sm:px-8">
      <Link href="/" aria-label="Recreio, página inicial" className="inline-flex">
        <Marca tamanho={32} />
      </Link>
      <h1 className="mt-8 font-display text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
        Crie o seu perfil
      </h1>
      <p className="mt-3 max-w-xl text-lg leading-relaxed text-tinta-suave">
        O perfil é quem joga. Os jogos conhecem só o apelido e o avatar; o seu e-mail fica com a
        conta.
      </p>
      <section className="painel mt-8 p-5 sm:p-8">
        <CriarPerfil limites={{ min: APELIDO.min, max: APELIDO.max }} />
      </section>
      <div className="mt-8">
        <p className="text-sm font-semibold text-tinta-suave [overflow-wrap:anywhere]">
          Você entrou como {user.email}. Não é você?
        </p>
        <div className="mt-3">
          <Sair />
        </div>
      </div>
    </main>
  );
}
