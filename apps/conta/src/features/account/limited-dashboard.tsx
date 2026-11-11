import { INFORMACH_CONTACT } from "@informach/config/contact";
import { BillingPanel, type BillingPanelData } from "../billing/panel";
import { SignOutButton } from "./security";
import { type AccountIdentity, AccountSecurity } from "./security-section";
import type { AccountSessions } from "./sessions";

/** The global login survives a Compasso closure; family content stays gated. */
export function LimitedAccountDashboard({
  user,
  state,
  security,
  billing,
}: {
  user: AccountIdentity;
  state: "frozen" | "closed";
  security: AccountSessions;
  billing: BillingPanelData;
}) {
  return (
    <main id="conteudo" className="departure-main">
      <header className="welcome">
        <p className="eyebrow">Minha conta</p>
        <h1>
          {state === "closed" ? "Sua conta continua com você." : "Acompanhe sua solicitação."}
        </h1>
        <p>
          O acesso ao Compasso está {state === "closed" ? "encerrado" : "temporariamente suspenso"}.
          Você continua podendo cuidar do seu login e consultar seus registros de cobrança. Os
          produtos independentes são preservados.
        </p>
        <a href="/privacidade/encerramento">Ver andamento do encerramento ↗</a>
      </header>
      <AccountSecurity user={user} security={security} />
      <section id="compasso" className="section-block">
        <h2>Seus registros de cobrança</h2>
        <BillingPanel data={billing} group={null} groups={[]} />
      </section>
      <section id="privacidade" className="sheet">
        <h2>Seus dados de conta</h2>
        <p>
          A exportação exige uma entrada recente e mantém a separação entre sua conta e os dados de
          outras pessoas.
        </p>
        <a href="/api/account/export">Baixar dados da conta ↗</a>
      </section>
      <footer className="footer">
        <SignOutButton />
        <a href={INFORMACH_CONTACT.directMessageUrl}>Fale com a gente ↗</a>
      </footer>
    </main>
  );
}
