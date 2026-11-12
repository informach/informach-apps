import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { Sair } from "@/features/account/components/sair";
import { EscolherPerfil } from "@/features/perfis/components/escolher-perfil";
import { paginaDaConta } from "@/features/sessao/ator";

export const metadata = { title: "Quem vai jogar?" };

/** A lista é a que o servidor monta para a conta; hoje, o perfil dela mesma. */
export default async function Perfis() {
  const { user, ator, perfis } = await paginaDaConta("/perfis");
  if (perfis.length === 0) redirect("/comecar");
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
      <div className="mt-8">
        <EscolherPerfil
          perfis={perfis.map((perfil) => ({
            id: perfil.id,
            apelido: perfil.apelido,
            avatar: perfil.avatar,
            atual: perfil.id === ator.perfil?.id,
          }))}
        />
      </div>
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
