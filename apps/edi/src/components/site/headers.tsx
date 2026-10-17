import Link from "next/link";
import { Wordmark } from "./brand";
import { SignOutButton } from "./sign-out-button";

export function MarketingHeader({
  tone = "paper",
  current,
  billingOpen,
}: {
  tone?: "mat" | "paper";
  current?: "downloads";
  billingOpen: boolean;
}) {
  return (
    <header className={tone === "mat" ? "site-header site-header--mat" : "site-header"}>
      <div className="container site-header__inner">
        <Wordmark />
        <nav className="site-nav" aria-label="Principal">
          <Link href={{ pathname: "/", hash: "ferramentas" }}>Ferramentas</Link>
          <Link href={{ pathname: "/", hash: "como-funciona" }}>Como funciona</Link>
          <Link href={{ pathname: "/", hash: "precos" }}>Preço</Link>
          <Link href={{ pathname: "/", hash: "perguntas" }}>Perguntas</Link>
          <Link href="/downloads" aria-current={current === "downloads" ? "page" : undefined}>
            Downloads
          </Link>
        </nav>
        <div className="site-actions">
          <Link className="button button--sm" href="/entrar">
            Entrar
          </Link>
          {billingOpen ? (
            <Link
              className="button button--primary button--sm"
              href={{ pathname: "/", hash: "precos" }}
            >
              Assinar
            </Link>
          ) : (
            <Link className="button button--primary button--sm" href="/entrar?criar=1">
              Criar conta
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function AccountHeader({
  name,
  current,
}: {
  name: string;
  current?: "conta" | "conectar" | "downloads";
}) {
  const initial = name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "?";
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Wordmark />
        <nav className="site-nav" aria-label="Conta">
          <Link href="/conta" aria-current={current === "conta" ? "page" : undefined}>
            Minha conta
          </Link>
          <Link href="/downloads" aria-current={current === "downloads" ? "page" : undefined}>
            Downloads
          </Link>
          <Link href="/conectar" aria-current={current === "conectar" ? "page" : undefined}>
            Conectar computador
          </Link>
        </nav>
        <div className="site-actions">
          <span className="user-chip">
            <span className="user-chip__initial" aria-hidden="true">
              {initial}
            </span>
            {name}
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

/** Minimal header for error and not-found screens, which must not depend on the environment. */
export function SimpleHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Wordmark />
        <Link className="button button--sm" href="/">
          Voltar ao início
        </Link>
      </div>
    </header>
  );
}
