import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { Etiqueta } from "@/components/ui/pagina";
import { safeDestination } from "@/features/study-access/policy";

export const metadata = { title: "Entrar" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ confirmar?: string; next?: string }>;
}) {
  const { confirmar, next } = await searchParams;
  return (
    <main
      id="conteudo"
      className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-16"
    >
      <section>
        <Brand />
        <div className="mt-8">
          <Etiqueta tom="verde">Conta do responsável</Etiqueta>
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
            Entre na área do responsável.
          </h1>
          <p className="mt-4 max-w-md text-tinta-suave">
            Acompanhe o que seu estudante está entendendo, com espaço para tentar, pensar e pedir
            ajuda.
          </p>
          <Link
            href="/estudar"
            className="mt-6 inline-flex min-h-12 items-center rounded-controle border-2 border-sombra px-4 font-semibold text-tinta"
          >
            Sou estudante · entrar para estudar
          </Link>
        </div>
        <p className="mt-8 max-w-md text-sm text-tinta-suave">
          Se você já usa a Agenda da Turma ou o Cozya, pode entrar com sua conta Informach.
        </p>
      </section>
      <section className="rounded-heroi border-2 border-sombra bg-creme p-6 shadow-chapa-lg sm:p-8">
        <h2 className="font-display text-2xl font-semibold text-tinta">Vamos começar?</h2>
        <p className="mt-1 mb-6 text-sm text-tinta-suave">
          As primeiras missões de cada trilha são gratuitas. Sem cartão.
        </p>
        <AuthForm
          next={safeDestination(next, "parent")}
          initialMode={confirmar ? "verify" : "login"}
          initialMessage={
            confirmar
              ? "Confirme o e-mail do responsável: digite o e-mail e o código de seis dígitos que enviamos. Para receber outro código, use Confirmar e-mail / reenviar código."
              : ""
          }
        />
      </section>
    </main>
  );
}
