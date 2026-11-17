import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { safeDestination } from "@/lib/destination";

export const metadata = { title: "Entrar" };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reautenticar?: string }>;
}) {
  const { next, reautenticar } = await searchParams;
  return (
    <main className="auth-page" id="conteudo">
      <section className="auth-intro">
        <Brand />
        <h1>Bora treinar em casa, no seu ritmo.</h1>
        <p className="muted lead">
          Cada pessoa da casa tem seu perfil para treinar no próprio ritmo. A conta compartilhada
          acompanha você entre os apps.
        </p>
        <p className="muted">
          Já usa o Cozya, a Agenda da Turma ou o Missão Saber? Entre com a mesma conta Informach.
        </p>
      </section>
      <section className="card auth-card">
        <AuthForm next={safeDestination(next)} reauthenticate={reautenticar === "1"} />
      </section>
    </main>
  );
}
