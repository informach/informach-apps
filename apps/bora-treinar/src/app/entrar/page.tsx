import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { safeDestination } from "@/lib/destination";

export const metadata = { title: "Entrar" };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ confirmar?: string; next?: string }>;
}) {
  const { confirmar, next } = await searchParams;
  return (
    <main className="auth-page" id="conteudo">
      <section className="auth-intro">
        <Brand />
        <h1>Bora treinar em casa, junto com a família.</h1>
        <p className="muted lead">
          Uma conta para a casa toda: cada pessoa tem o seu perfil, os seus níveis e os seus
          recordes. O Primeiro treino é gratuito, sem cartão.
        </p>
        <p className="muted">
          Já usa o Cozya, a Agenda da Turma ou o Missão Saber? Entre com a mesma conta Informach.
        </p>
      </section>
      <section className="card auth-card">
        <AuthForm
          next={safeDestination(next)}
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
