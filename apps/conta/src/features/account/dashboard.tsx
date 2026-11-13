import { COMPASSO_POLICY, getCollectionApps } from "@informach/config/collections";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { getAppUrl } from "@informach/config/domains";
import { BillingPanel, type BillingPanelData, SubscriptionOffer } from "../billing/panel";
import { FamilyForm } from "./forms";
import { FamilyManagement, ReceiveInvitation } from "./management";
import { PrivacyPanel } from "./privacy-panel";
import { SignOutButton } from "./security";
import { AccountSecurity } from "./security-section";
import type { accountOverview } from "./service";
import type { AccountSessions } from "./sessions";

type Overview = Awaited<ReturnType<typeof accountOverview>>;
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(
    value,
  );
export function AccountDashboard({
  user,
  data,
  environment,
  security,
  billing,
  initialCycle,
  privacyStatus,
}: {
  user: { id: string; name: string; email: string; twoFactorEnabled?: boolean | null };
  data: Overview;
  environment: "production" | "development";
  security: AccountSessions;
  billing: BillingPanelData;
  initialCycle?: "monthly" | "annual";
  privacyStatus?: "recente" | "limite" | "erro";
}) {
  return (
    <div className="account-layout">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Minha conta, início">
          <span className="compass-mark" aria-hidden="true">
            ↗
          </span>
          <span>
            Minha conta<small>Seu ponto de encontro</small>
          </span>
        </a>
        <nav aria-label="Minha conta">
          <a href="#visao-geral">
            Visão geral <span>01</span>
          </a>
          <a href="#pessoas">
            Pessoas da família <span>02</span>
          </a>
          <a href="#compasso">
            Compasso e créditos <span>03</span>
          </a>
          <a href="#seguranca">
            Dados e segurança <span>04</span>
          </a>
          <a href="#privacidade">
            Privacidade <span>05</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <a href={INFORMACH_CONTACT.directMessageUrl}>Conversar com a gente ↗</a>
          <SignOutButton />
        </div>
      </aside>
      <main id="conteudo" className="account-main">
        <header className="page-top">
          <span>MINHA CONTA / VISÃO GERAL</span>
          <span className="account-badge">{user.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
        </header>
        <section id="visao-geral" className="welcome">
          <p className="eyebrow">Tudo começa por você</p>
          <h1>
            Olá, {user.name.split(" ")[0]}.<br />
            <span>Vamos organizar a casa?</span>
          </h1>
          <p>
            Sua conta, as pessoas da sua família e seus aplicativos.
            <br className="wide-only" /> Cada coisa no seu lugar, com você no controle.
          </p>
        </section>
        {data.groups.length > 1 && (
          <form className="group-switch" action="/">
            <label>
              Família
              <select name="familia" defaultValue={data.group?.id ?? ""} required>
                <option value="" disabled>
                  Escolha uma família
                </option>
                {data.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="secondary">
              Trocar família
            </button>
          </form>
        )}
        <section id="pessoas" className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">02 / Pessoas</p>
              <h2>
                {data.group?.name ??
                  (data.groups.length
                    ? "Escolha a família que deseja acessar."
                    : "Sua família começa aqui.")}
              </h2>
            </div>
            <span className="small-note">
              Até {COMPASSO_POLICY.capacity.adults} adultos e {COMPASSO_POLICY.capacity.dependents}{" "}
              dependentes
            </span>
          </div>
          {!data.group && data.groups.length > 0 ? (
            <div className="sheet">
              <p>
                Selecione uma família acima para ver as pessoas, as permissões e o saldo de IA dela.
              </p>
            </div>
          ) : !data.group ? (
            <div className="sheet setup-grid">
              <div>
                <h3>Um lugar para quem faz parte.</h3>
                <p>
                  Cadastre sua família uma vez. Cada pessoa terá seu próprio histórico nos
                  aplicativos e você escolherá com quem compartilhar.
                </p>
                <span className="line-art" aria-hidden="true">
                  ◯ ─ ◯ ─ ◯
                </span>
              </div>
              <FamilyForm operation="create-family" />
            </div>
          ) : (
            <>
              <div className="people-grid">
                {data.people.map((person) => (
                  <article className="person" key={person.id}>
                    <span
                      className="person-avatar"
                      aria-hidden="true"
                      style={{ backgroundColor: person.color }}
                    >
                      {person.displayName.slice(0, 1).toLocaleUpperCase("pt-BR")}
                    </span>
                    <div>
                      <h3>{person.displayName}</h3>
                      <p>
                        {person.kind === "dependent"
                          ? "Criança ou adolescente"
                          : person.kind === "adult"
                            ? "Adulto"
                            : "Classificação pendente"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
              {data.group.role === "administrator" && (
                <details className="sheet add-person">
                  <summary>
                    Adicionar alguém à família <span aria-hidden="true">+</span>
                  </summary>
                  <p>
                    Cadastre uma pessoa sem login. Um adulto com conta própria deve entrar por
                    convite.
                  </p>
                  <FamilyForm operation="add-person" groupId={data.group.id} />
                </details>
              )}
              <p className="small-note">
                Aqui aparecem as pessoas que você pode acessar. Ser pagante não dá acesso automático
                aos dados de outra pessoa.
              </p>
              <FamilyManagement data={data} actorId={user.id} />
            </>
          )}
          <ReceiveInvitation />
        </section>
        <section id="compasso" className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">03 / Aplicativos e IA</p>
              <h2>Um Compasso para a rotina.</h2>
            </div>
            <span className="tag">
              {data.access?.source === "review"
                ? "Cobrança em conferência"
                : data.access?.source === "legacy"
                  ? "Período anterior preservado"
                  : data.access?.source === "trial"
                    ? "Teste em andamento"
                    : data.access?.active
                      ? "Assinatura ativa"
                      : "Conheça o Compasso"}
            </span>
          </div>
          <div className="subscription-grid">
            <article className="plan-panel">
              <div className="plan-title">
                <span className="compass-mark" aria-hidden="true">
                  ↗
                </span>
                <h3>Compasso</h3>
              </div>
              <p>
                Um conjunto de aplicativos para cuidar da rotina, aprender e criar espaço para o que
                importa.
              </p>
              <div className="price">
                {money(COMPASSO_POLICY.monthlyAmountCents)}
                <small>/mês</small>
              </div>
              <p className="plan-annual">ou {money(COMPASSO_POLICY.annualAmountCents)} por ano</p>
              <ul>
                <li>Os aplicativos web do Compasso</li>
                <li>{COMPASSO_POLICY.ai.monthlyCredits} créditos de IA a cada mês</li>
                <li>Uma família, com permissões por pessoa</li>
              </ul>
              {data.access?.active && data.access.endsAt ? (
                <p className="plan-state">
                  {data.access.source === "trial" ? "Seu teste vai até" : "Período pago até"}{" "}
                  {date(data.access.endsAt)}.
                  {data.access.source === "legacy" &&
                    " Durante esse período, valem os créditos anteriores convertidos."}
                </p>
              ) : data.group?.role === "administrator" && data.access?.canStartTrial ? (
                <FamilyForm operation="start-trial" groupId={data.group.id} />
              ) : (
                <p className="plan-state">
                  {data.access?.source === "review"
                    ? "Estamos conferindo uma atualização do pagamento. Seus dados e o histórico de créditos estão preservados."
                    : data.group
                      ? data.access?.canStartTrial
                        ? "O administrador da família pode iniciar o teste."
                        : "Seu teste terminou. Seus dados continuam guardados."
                      : data.groups.length
                        ? "Selecione uma família para consultar seu Compasso."
                        : "Crie sua família para experimentar por 14 dias, sem cartão."}
                </p>
              )}
              {data.group &&
                !billing.anotherPayer &&
                data.access?.source !== "paid" &&
                data.access?.source !== "legacy" &&
                data.access?.source !== "review" &&
                (data.group.role === "administrator" ||
                  billing.accounts.accounts.some(
                    (a) => a.groupId === data.group?.id && !a.closedAt,
                  )) && (
                  <SubscriptionOffer
                    groupId={data.group.id}
                    enabled={billing.enabled}
                    initialCycle={initialCycle}
                  />
                )}
            </article>
            <article className="sheet wallet">
              <p className="eyebrow">Sua carteira de IA</p>
              <div className="wallet-balance">
                {data.group ? (data.balance?.available ?? 0) : "—"}
                <span>
                  {!data.group
                    ? "selecione uma família"
                    : billing.history?.underReview
                      ? "créditos registrados"
                      : "créditos disponíveis"}
                </span>
              </div>
              <p>O mesmo saldo acompanha sua família pelos aplicativos do Compasso.</p>
              {billing.history?.underReview && (
                <p role="status">
                  O uso de IA aguarda a conferência de uma atualização de pagamento. Seu saldo e
                  histórico estão preservados.
                </p>
              )}
              <div className="wallet-detail">
                <span>Reservados em usos em andamento</span>
                <strong>{data.balance?.reserved ?? 0}</strong>
              </div>
              <div className="callout">
                <strong>Você escolhe antes de usar.</strong>
                <p>
                  Cada recurso informa o custo antes de começar. Créditos comprados não vencem; a
                  franquia mensal se renova sem acumular.
                </p>
              </div>
              <p className="small-note">
                O teste inclui {COMPASSO_POLICY.ai.trialCredits} créditos para conhecer os recursos
                de IA.
              </p>
            </article>
          </div>
          <div className="apps-strip">
            {getCollectionApps("compasso").map((app) =>
              app.published ? (
                <a key={app.slug} href={getAppUrl(app.slug, environment)}>
                  <span>{app.name}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <span className="app-soon" key={app.slug}>
                  {app.name}
                  <small>Em preparação</small>
                </span>
              ),
            )}
          </div>
          <BillingPanel data={billing} group={data.group} groups={data.groups} />
        </section>
        <AccountSecurity user={user} security={security} />
        <PrivacyPanel environment={environment} status={privacyStatus} />
        <footer className="footer">
          <span>Minha conta · Informach</span>
          <SignOutButton />
          <a href={INFORMACH_CONTACT.directMessageUrl}>Conte com a gente ↗</a>
        </footer>
      </main>
    </div>
  );
}
