import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { safeDestination } from "@/lib/destination";

export const metadata = { title: "Entrar" };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ confirmar?: string; next?: string; modo?: string }>;
}) {
  const { confirmar, next, modo } = await searchParams;
  return (
    <main className="auth-page" id="conteudo">
      <section className="auth-intro">
        <Brand />
        <h1>Bora treinar em casa, no seu ritmo.</h1>
        <p className="muted lead">
          Os primeiros 7 dias têm tudo liberado, sem cartão: a câmera contando, todos os treinos e
          os níveis. Mais alguém da casa quer treinar? Cada um tem o seu perfil.
        </p>
        <p className="muted">
          Já usa o Cozya, a Agenda da Turma ou o Missão Saber? Entre com a mesma conta Informach.
        </p>
      </section>
      <section className="card auth-card">
        <AuthForm
          next={safeDestination(next)}
          initialMode={confirmar ? "verify" : modo === "criar" ? "signup" : "login"}
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
