import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Marca } from "@/components/desenhos";
import { safeDestination } from "@/lib/destination";
import { env } from "@/lib/env";

export const metadata = { title: "Entrar" };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ confirmar?: string; next?: string }>;
}) {
  const { confirmar, next } = await searchParams;
  const fechado = env.RECREIO_ACCESS_MODE === "fechado";
  return (
    <main
      id="conteudo"
      className="mx-auto grid min-h-dvh max-w-5xl gap-8 px-4 py-10 sm:px-8 lg:grid-cols-2 lg:items-center"
    >
      <section>
        <Link href="/" aria-label="Recreio, página inicial" className="inline-flex">
          <Marca tamanho={36} />
        </Link>
        <h1 className="mt-8 font-display text-5xl leading-none font-extrabold tracking-tight">
          Entrar no Recreio
        </h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-tinta-suave">
          Use a sua conta Informach. Se você já usa outro app da Informach, é a mesma conta.
        </p>
        {fechado && (
          <p className="mt-3 max-w-md text-lg leading-relaxed text-tinta-suave">
            Criar a conta não libera os jogos: nesta fase, o acesso é por convite da equipe.
          </p>
        )}
      </section>
      <section className="painel p-6 sm:p-8">
        <h2 className="mb-1 font-display text-2xl font-bold">Sua conta</h2>
        <p className="mb-6 text-sm text-tinta-suave">
          Dá para entrar com senha ou pedir um código de seis dígitos por e-mail.
        </p>
        <AuthForm
          next={safeDestination(next ?? null)}
          initialMode={confirmar ? "verify" : "login"}
          initialMessage={
            confirmar
              ? "Confirme o e-mail: digite o e-mail e o código de seis dígitos que enviamos."
              : ""
          }
        />
      </section>
    </main>
  );
}
