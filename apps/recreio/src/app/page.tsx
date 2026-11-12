import { DoorOpen, Hammer, LibraryBig } from "lucide-react";
import Link from "next/link";
import { CapaMorada, Marca } from "@/components/desenhos";
import { Rodape } from "@/components/pagina-publica";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

const hoje = [
  {
    Icone: DoorOpen,
    titulo: "Dá para entrar",
    texto: "Com a conta Informach, por código enviado ao seu e-mail.",
  },
  {
    Icone: LibraryBig,
    titulo: "A estante já existe",
    texto: "Ela mostra o Morada, que ainda não abre.",
  },
  {
    Icone: Hammer,
    titulo: "Ainda não dá para jogar",
    texto: "Os mundos e o jogo em si estão em construção.",
  },
];

export default async function Inicio() {
  const user = await getCurrentUser();
  const fechado = env.RECREIO_ACCESS_MODE === "fechado";
  const entrada = user ? "/estante" : "/entrar";
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-5 sm:px-8">
        <Marca />
        <span className="flex-1" />
        <Link href={entrada} className="rb rb-vazado">
          {user ? "Abrir a estante" : "Entrar"}
        </Link>
      </header>

      <main id="conteudo" className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:py-16">
          <div>
            {fechado && <p className="etiqueta mb-5">Alfa fechado</p>}
            <h1 className="font-display text-6xl leading-[0.95] font-extrabold tracking-tight sm:text-7xl">
              Seu lugar
              <br />
              de jogar<span className="text-coral">.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-tinta-suave">
              O Recreio é a plataforma de jogos da Informach, para jogar no navegador, sozinho ou
              junto. Ela ainda está sendo construída, e o primeiro jogo, o Morada, está em
              preparação.
            </p>
            {fechado && (
              <p className="mt-3 max-w-xl text-lg leading-relaxed font-semibold">
                Por enquanto, o acesso é por convite da equipe.
              </p>
            )}
            <div className="mt-7">
              <Link href={entrada} className="rb rb-sol rb-lg">
                {user ? "Abrir a estante" : "Entrar"}
              </Link>
            </div>
          </div>

          <div className="painel overflow-hidden">
            <div className="relative aspect-[5/3]">
              <CapaMorada className="absolute inset-0 size-full" />
              <span className="etiqueta etiqueta-sol absolute top-3 left-3">Primeiro jogo</span>
            </div>
            <div className="p-5 sm:p-6">
              <h2 className="font-display text-3xl font-extrabold tracking-tight">Morada</h2>
              <p className="mt-1 text-tinta-suave">
                Em preparação. Ainda não dá para jogar por aqui.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="como-esta-hoje"
          className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-8"
        >
          <h2
            id="como-esta-hoje"
            className="text-sm font-bold tracking-[0.12em] text-tinta-suave uppercase"
          >
            Como está hoje
          </h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {hoje.map(({ Icone, titulo, texto }) => (
              <li key={titulo} className="painel p-5">
                <Icone className="size-6 text-ceu" aria-hidden="true" />
                <h3 className="mt-3 font-display text-xl font-bold">{titulo}</h3>
                <p className="mt-1 text-tinta-suave">{texto}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Rodape />
    </div>
  );
}
