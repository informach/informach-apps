import { EDI_TOOLS } from "@informach/config/edi-tools";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ToolIcon, Wordmark } from "../../components/site/brand";
import { MonitorIcon } from "../../components/site/icons";
import { AuthForm } from "../../features/auth/auth-form";
import { getAuth } from "../../lib/auth";
import { safeReturnPath } from "../../lib/return-path";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const incoming = new Headers(await headers());
  if (await getAuth().getCurrentUser(incoming)) redirect(next);
  return (
    <div className="auth-layout">
      <div className="auth-column">
        <header>
          <Wordmark />
          <Link className="button button--sm" href="/">
            Voltar ao site
          </Link>
        </header>
        <main id="conteudo" className="auth-main">
          <div className="auth-panel">
            <AuthForm initialMode={params.criar === "1" ? "signup" : "login"} next={next} />
            {next !== "/conectar" && (
              <div className="hint-card">
                <MonitorIcon size={22} />
                <p>
                  Veio conectar um computador? Entre primeiro. Depois você digita o código que o Edi
                  Hub mostrou. <Link href="/conectar">Ir para Conectar</Link>
                </p>
              </div>
            )}
          </div>
        </main>
        <p className="auth-legal">
          Ao continuar, você concorda com os <a href="https://informach.com.br/termos">Termos</a> e
          a <a href="https://informach.com.br/privacidade">Privacidade</a> da Informach.
        </p>
      </div>
      <aside className="auth-aside mat" aria-label="O que vem com a conta">
        <div className="auth-aside__content">
          <p className="display-2">
            Uma conta para a <span className="tape">bancada</span> inteira.
          </p>
          <ul className="aside-tools">
            {EDI_TOOLS.map((tool) => (
              <li key={tool.id}>
                <ToolIcon tool={tool.id} size="sm" />
                <span>
                  <strong>{tool.name}</strong>
                  <small>{tool.description}</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="auth-aside__facts">
            Windows 64 bits · até 2 computadores · seus arquivos com você
          </p>
        </div>
        <span className="ruler" aria-hidden="true" />
      </aside>
    </div>
  );
}
