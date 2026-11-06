import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Lumi } from "@/components/desenhos";
import { safeDestination } from "@/lib/destination";

export const metadata = { title: "Entrar" };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ confirmar?: string; next?: string }>;
}) {
  const { confirmar, next } = await searchParams;
  return (
    <main
      id="conteudo"
      className="mx-auto grid min-h-dvh max-w-5xl gap-8 px-4 py-10 sm:px-8 lg:grid-cols-2 lg:items-center"
    >
      <section>
        <Link href="/" className="flex items-center gap-2">
          <Lumi tamanho={44} />
          <span className="font-display text-2xl font-extrabold">Dia de Estrela</span>
        </Link>
        <h1 className="mt-8 font-display text-4xl leading-tight font-extrabold">Área dos pais</h1>
        <p className="mt-3 max-w-md text-lg font-semibold text-tinta-suave">
          Monte a rotina das crianças, acompanhe o dia e combine as recompensas. A criança usa o
          tablet ou o celular dela, sem senha.
        </p>
        <Link href="/conectar" className="bp bp-claro mt-6">
          Sou criança · tenho um código
        </Link>
        <p className="mt-6 max-w-md text-sm font-semibold text-tinta-suave">
          Se você já usa outro app Informach, entre com a mesma conta.
        </p>
      </section>
      <section className="chapa p-6 sm:p-8">
        <h2 className="mb-1 font-display text-2xl font-extrabold">Vamos começar?</h2>
        <p className="mb-6 text-sm font-semibold text-tinta-suave">
          O plano gratuito tem uma criança e já inclui a rotina completa. Sem cartão.
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
