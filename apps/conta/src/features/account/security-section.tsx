import { EmailChangeForm } from "./email-change";
import { AccountDetails, PasswordForm } from "./security";
import { type AccountSessions, SessionSettings } from "./sessions";
import { TwoFactorSettings } from "./two-factor";

export type AccountIdentity = {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled?: boolean | null;
};
export function AccountSecurity({
  user,
  security,
}: {
  user: AccountIdentity;
  security: AccountSessions;
}) {
  return (
    <section id="seguranca" className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sua conta</p>
          <h2>Seus dados. Seu controle.</h2>
        </div>
      </div>
      <div className="security-grid">
        <article className="sheet">
          <h3>Como você aparece</h3>
          <p>Seu nome acompanha a conta nos aplicativos.</p>
          <AccountDetails name={user.name} email={user.email} />
        </article>
        <article className="sheet">
          <h3>Cuide do seu acesso</h3>
          <p>Escolha uma senha que você não usa em outros lugares.</p>
          <PasswordForm />
        </article>
        <TwoFactorSettings enabled={user.twoFactorEnabled === true} />
        <EmailChangeForm email={user.email} />
        <SessionSettings data={security} />
      </div>
    </section>
  );
}
