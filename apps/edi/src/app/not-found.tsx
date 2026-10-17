import Link from "next/link";
export default function NotFound() {
  return (
    <section className="auth-panel">
      <h1>Esta página não está na bancada.</h1>
      <Link className="button" href="/">
        Voltar às ferramentas
      </Link>
    </section>
  );
}
