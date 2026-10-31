import Link from "next/link";

export default function NotFound() {
  return (
    <main className="profiles" id="conteudo">
      <div className="brand">
        <i />
        Bora Treinar
      </div>
      <h1>Este caminho não existe.</h1>
      <p className="muted lead">O treino pode ter mudado de endereço ou pertencer a outra conta.</p>
      <Link href="/perfis" className="btn primary big">
        Voltar ao início
      </Link>
    </main>
  );
}
