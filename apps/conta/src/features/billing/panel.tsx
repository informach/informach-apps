import { randomUUID } from "node:crypto";
import type {
  getCompassoPayerAccount,
  getCompassoWalletHistory,
  listCompassoPayerAccounts,
} from "@informach/billing/compasso-account";
import type { listLegacyCreditWallets } from "@informach/billing/credit-migration";
import type { listLegacyContracts } from "@informach/billing/legacy-contracts";
import type { activeLegacyFutureIntent } from "@informach/billing/legacy-future-contract";
import { APPS, findApp, PRODUCTS } from "@informach/config";
import { COMPASSO_POLICY } from "@informach/config/collections";
import type { billingAvailability } from "./availability";
import { BillingForm } from "./form";
import { FutureContractForm } from "./future-contract-form";
import { LegacyContractForm } from "./legacy-contract-form";
import { CreditMigrationForm } from "./migration-form";

export type BillingPanelData = {
  accounts: Awaited<ReturnType<typeof listCompassoPayerAccounts>>;
  selected: Awaited<ReturnType<typeof getCompassoPayerAccount>> | null;
  history: Awaited<ReturnType<typeof getCompassoWalletHistory>> | null;
  anotherPayer: boolean;
  legacy: Awaited<ReturnType<typeof listLegacyCreditWallets>>;
  legacyContracts: Awaited<ReturnType<typeof listLegacyContracts>> | null;
  legacyFamilyEligible: boolean;
  futureContract: Awaited<ReturnType<typeof activeLegacyFutureIntent>>;
  enabled: boolean;
  operations: ReturnType<typeof billingAvailability>;
};
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(
    value,
  );
const productName = (id: string) => PRODUCTS.find((p) => p.id === id)?.name ?? "Compasso";
const subscriptionStatus: Record<string, string> = {
  incomplete: "Pagamento pendente",
  active: "Ativa",
  trialing: "Em teste",
  past_due: "Pagamento em atraso",
  unpaid: "Pagamento necessário",
  paused: "Pausada",
};
const entries: Record<string, string> = {
  purchase: "Compra de créditos",
  bonus_grant: "Franquia mensal",
  promo_grant: "Créditos promocionais",
  consumption: "Uso de IA",
  refund: "Estorno de créditos",
  expiration: "Créditos vencidos",
  adjustment: "Ajuste de saldo",
  funding_suspension: "Créditos em análise",
  funding_restoration: "Créditos liberados após análise",
};

export function SubscriptionOffer({
  groupId,
  enabled,
  initialCycle,
}: {
  groupId: string;
  enabled: boolean;
  initialCycle?: "monthly" | "annual";
}) {
  return (
    <details className="subscribe-choice" open={initialCycle !== undefined}>
      <summary>Assinar o Compasso</summary>
      <BillingForm
        values={{ operation: "subscribe", groupId }}
        label="Continuar para pagamento"
        enabled={enabled}
        confirmation="Quero iniciar a assinatura agora, com renovação automática. Posso cancelar a próxima renovação pela minha conta."
      >
        <label>
          Periodicidade
          <select
            name="productId"
            defaultValue={initialCycle === "annual" ? "compasso_annual" : "compasso_monthly"}
            disabled={!enabled}
          >
            <option value="compasso_monthly">
              Mensal · {money(COMPASSO_POLICY.monthlyAmountCents)}/mês
            </option>
            <option value="compasso_annual">
              Anual · {money(COMPASSO_POLICY.annualAmountCents)}/ano
            </option>
          </select>
        </label>
        <p className="small-note">
          A compra inicia o período pago. No plano anual, os {COMPASSO_POLICY.ai.monthlyCredits}{" "}
          créditos continuam sendo liberados mês a mês.
        </p>
      </BillingForm>
      {!enabled && <p className="small-note">As assinaturas serão disponibilizadas em breve.</p>}
    </details>
  );
}

export function BillingPanel({
  data,
  group,
  groups,
}: {
  data: BillingPanelData;
  group: { id: string; name: string; role: string } | null;
  groups: { id: string; name: string }[];
}) {
  const selected = data.selected;
  const memberGroup = selected ? groups.find((g) => g.id === selected.account.groupId) : group;
  const sales = selected
    ? memberGroup && !selected.account.closedAt
      ? { groupId: selected.account.groupId, accountId: selected.account.id }
      : null
    : group?.role === "administrator" && !data.anotherPayer
      ? { groupId: group.id }
      : null;
  const pending = selected?.purchases.find((p) => p.status === "pending");
  const walletUnderReview = sales?.groupId === group?.id && data.history?.underReview;
  const contractOptions =
    selected && !data.accounts.accounts.some((a) => a.id === selected.account.id)
      ? [selected.account, ...data.accounts.accounts]
      : data.accounts.accounts;
  const query = (extra: Record<string, string>) =>
    `/?${new URLSearchParams({ ...(group ? { familia: group.id } : {}), ...(selected ? { pagamento: selected.account.id } : {}), ...extra })}#compasso`;
  return (
    <div className="billing-management">
      {group && data.legacyContracts && data.legacyContracts.contracts.length > 0 && (
        <section className="sheet legacy-wallets" aria-label="Seus contratos anteriores">
          <p className="eyebrow">Contratos anteriores</p>
          <h3>Confira seus períodos pagos</h3>
          <p>
            Escolha a família que receberá o acesso. Seus créditos anteriores são transferidos
            separadamente, com confirmação própria.
          </p>
          {data.legacyContracts.contracts.map((contract) => (
            <article className="legacy-wallet" key={contract.id}>
              <h4>{findApp(contract.app)?.name ?? contract.app}</h4>
              {contract.acceptanceId ? (
                <p>
                  {contract.acceptanceGroupId !== group.id
                    ? "Este contrato já foi associado a outra família."
                    : contract.cancellationConfirmedAt
                      ? "Cancelamento da renovação confirmado; a situação continua sendo verificada."
                      : "Aceite registrado. Estamos conferindo o encerramento da renovação anterior."}
                </p>
              ) : (
                <LegacyContractForm
                  groupId={group.id}
                  groupName={group.name}
                  subscriptionId={contract.id}
                  enabled={data.enabled}
                />
              )}
            </article>
          ))}
          {data.legacyContracts.hasMore && (
            <p>Há outros contratos antigos; consulte a equipe para concluir a conferência.</p>
          )}
          {!data.enabled && (
            <p className="small-note">
              A migração será disponibilizada após a preparação da cobrança.
            </p>
          )}
        </section>
      )}
      {(data.futureContract ||
        (group?.role === "administrator" &&
          data.legacyFamilyEligible &&
          !data.anotherPayer &&
          (!selected ||
            (selected.account.groupId === group.id &&
              !selected.account.closedAt &&
              !selected.subscriptions.some(
                (sub) =>
                  !["canceled", "incomplete_expired"].includes(sub.status) ||
                  (sub.status === "canceled" && sub.currentPeriodEnd > new Date()),
              ))))) && (
        <FutureContractForm
          groupId={group?.id ?? null}
          groupName={memberGroup?.name ?? group?.name ?? "sua família"}
          intent={data.futureContract}
          canOffer={data.enabled && !!group && (!selected || selected.account.groupId === group.id)}
          canCancel={data.operations["cancel-subscription"]}
        />
      )}
      {data.legacy.length > 0 && (
        <section className="sheet legacy-wallets" aria-label="Seus créditos anteriores">
          <p className="eyebrow">Créditos que já são seus</p>
          <h3>Traga seus créditos para o Compasso</h3>
          <p>
            Escolha conscientemente a família que vai compartilhar esta carteira. A conversão
            preserva o poder de uso e o vencimento de cada lote.
          </p>
          {data.legacy.map((wallet) => (
            <article className="legacy-wallet" key={wallet.sourceApp}>
              <h4>{findApp(wallet.sourceApp)?.name ?? wallet.sourceApp}</h4>
              {wallet.receipt ? (
                <p>
                  Transferida em {date(wallet.receipt.createdAt)} para{" "}
                  {groups.find((family) => family.id === wallet.receipt?.groupId)?.name ??
                    "a família escolhida na transferência"}
                  .
                </p>
              ) : group ? (
                <CreditMigrationForm
                  key={`${group.id}:${wallet.sourceApp}`}
                  sourceApp={wallet.sourceApp}
                  sourceName={findApp(wallet.sourceApp)?.name ?? wallet.sourceApp}
                  groupId={group.id}
                  groupName={group.name}
                  enabled={data.enabled}
                />
              ) : (
                <p>Escolha uma família na sua conta para conferir a transferência.</p>
              )}
            </article>
          ))}
          {!data.enabled && (
            <p className="small-note">
              A transferência será disponibilizada depois da preparação dos contratos e saldos
              anteriores.
            </p>
          )}
        </section>
      )}
      {data.accounts.accounts.length > 0 && (
        <div className="sheet billing-contracts">
          <p className="eyebrow">Cobranças sob sua responsabilidade</p>
          <form action="/#compasso" className="group-switch">
            {group && <input type="hidden" name="familia" value={group.id} />}
            <label>
              Contrato
              <select name="pagamento" defaultValue={selected?.account.id ?? ""} required>
                <option value="" disabled>
                  Escolha um contrato
                </option>
                {contractOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {groups.find((g) => g.id === account.groupId)?.name ?? "Família anterior"} ·
                    desde {date(account.createdAt)}
                    {account.closedAt ? " · encerrado" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="secondary">
              Ver cobrança
            </button>
          </form>
          {data.accounts.nextCursor && (
            <a href={query({ contratos: data.accounts.nextCursor })}>Ver outros contratos →</a>
          )}
          <p className="small-note">
            Você pode administrar uma cobrança sua mesmo depois de sair da família.
          </p>
        </div>
      )}
      {data.anotherPayer && !selected && (
        <p className="small-note">
          A cobrança desta família é administrada pelo pagante. As permissões nos aplicativos
          continuam independentes.
        </p>
      )}
      {selected && (
        <section className="sheet billing-contract" aria-label="Seu contrato Compasso">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sua assinatura</p>
              <h3>{memberGroup?.name ?? "Contrato da família anterior"}</h3>
            </div>
            {selected.account.closedAt && <span className="tag">Encerrado</span>}
          </div>
          {selected.subscriptions.map((sub) => (
            <article className="subscription-row" key={sub.id}>
              <div>
                <h4>{productName(sub.productId)}</h4>
                <p>{subscriptionStatus[sub.status] ?? "Confira a cobrança"}</p>
                <p>
                  {sub.cancelAtPeriodEnd
                    ? `Renovação cancelada. Período atual até ${date(sub.cancelAtPeriodEnd)}.`
                    : `Fim do período atual: ${date(sub.currentPeriodEnd)}.`}
                </p>
                {["past_due", "unpaid", "incomplete"].includes(sub.status) && (
                  <p className="form-message">Confira o pagamento para regularizar a assinatura.</p>
                )}
                {selected.planChanges
                  .filter((change) => change.subscriptionId === sub.id)
                  .map((change) => (
                    <div key={change.id} className="plan-change">
                      <p>
                        {change.cancelRequestedAt
                          ? "Conferindo a desistência da troca."
                          : change.status === "preparing"
                            ? "Conferindo o agendamento da troca."
                            : `Troca para ${productName(change.toProductId)} em ${date(change.effectiveAt)}.`}
                      </p>
                      <BillingForm
                        values={{
                          operation: "cancel-plan-change",
                          accountId: selected.account.id,
                          changeId: change.id,
                        }}
                        label="Desfazer troca"
                        enabled={data.operations["cancel-plan-change"] && !change.cancelRequestedAt}
                        confirmation="Quero manter o plano atual e desfazer esta troca de periodicidade."
                      />
                    </div>
                  ))}
                {sub.status === "active" &&
                  !sub.cancelAtPeriodEnd &&
                  memberGroup &&
                  !selected.account.closedAt &&
                  !selected.planChanges.some((change) => change.subscriptionId === sub.id) && (
                    <details>
                      <summary>Trocar periodicidade</summary>
                      <p>
                        O período já pago será respeitado. A próxima cobrança será em{" "}
                        {date(sub.currentPeriodEnd)}:
                        {sub.productId === "compasso_monthly"
                          ? " R$ 499 por ano."
                          : " R$ 49,90 por mês."}
                        A franquia de IA continua sendo de 200 créditos por mês.
                      </p>
                      <BillingForm
                        values={{
                          operation: "change-plan",
                          accountId: selected.account.id,
                          subscriptionId: sub.id,
                          expectedEnd: sub.currentPeriodEnd.toISOString(),
                          requestKey: randomUUID(),
                          productId:
                            sub.productId === "compasso_monthly"
                              ? "compasso_annual"
                              : "compasso_monthly",
                        }}
                        label="Agendar troca"
                        enabled={data.operations["change-plan"] && !data.history?.underReview}
                        confirmation="Autorizo a mudança e a renovação pelo novo valor ao fim do período atual, sem cobrança antecipada."
                      />
                    </details>
                  )}
              </div>
              <details>
                <summary>
                  {sub.cancelAtPeriodEnd ? "Retomar renovação" : "Cancelar renovação"}
                </summary>
                <BillingForm
                  values={{
                    operation: sub.cancelAtPeriodEnd ? "restore-renewal" : "cancel-subscription",
                    accountId: selected.account.id,
                    subscriptionId: sub.id,
                  }}
                  label={
                    sub.cancelAtPeriodEnd
                      ? "Retomar renovação automática"
                      : "Confirmar cancelamento"
                  }
                  enabled={
                    sub.cancelAtPeriodEnd
                      ? data.operations["restore-renewal"] &&
                        !!memberGroup &&
                        !selected.account.closedAt
                      : data.operations["cancel-subscription"]
                  }
                  confirmation={
                    sub.cancelAtPeriodEnd
                      ? "Autorizo as próximas renovações deste plano."
                      : "Quero encerrar a renovação. O acesso ao período pago e os créditos comprados serão preservados."
                  }
                />
              </details>
            </article>
          ))}
          {!selected.subscriptions.length && <p>Nenhuma assinatura em renovação neste contrato.</p>}
          {selected.customerReady && (
            <div className="billing-tools">
              <BillingForm
                values={{ operation: "portal", accountId: selected.account.id }}
                label="Pagamento e comprovantes"
                enabled={data.operations.portal}
              />
              <BillingForm
                values={{ operation: "refresh", accountId: selected.account.id }}
                label="Atualizar cobrança"
                enabled={data.operations.refresh}
              />
            </div>
          )}
        </section>
      )}
      {pending && selected && (
        <section className="sheet purchase-pending" aria-label="Compra em andamento">
          <p className="eyebrow">Compra em andamento</p>
          <h3>
            {pending.credits} créditos · {money(pending.amountCents)}
          </h3>
          <p>
            Continue o pagamento existente. Se já pagou, a confirmação pode levar alguns instantes.
          </p>
          <BillingForm
            values={{
              operation: "resume-purchase",
              accountId: selected.account.id,
              intentId: pending.id,
            }}
            label="Continuar ou verificar compra"
            enabled={data.operations["resume-purchase"]}
          />
          <details>
            <summary>Encerrar esta tentativa</summary>
            <BillingForm
              values={{
                operation: "cancel-purchase",
                accountId: selected.account.id,
                intentId: pending.id,
              }}
              label="Encerrar tentativa"
              enabled={data.operations["cancel-purchase"]}
              confirmation="Quero encerrar esta tentativa. Se o pagamento já estiver em processamento, será necessário aguardar o resultado."
            />
          </details>
        </section>
      )}
      {sales && (
        <section aria-label="Comprar créditos" className="credit-shop">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Créditos extras</p>
              <h3>Mais espaço para suas ideias.</h3>
            </div>
            <span className="small-note">Para {memberGroup?.name ?? group?.name}</span>
          </div>
          <p>
            Comprados uma vez, compartilhados entre os apps do Compasso, sem vencimento. Créditos
            extras não substituem a assinatura dos aplicativos.
          </p>
          <div className="credit-packs">
            {PRODUCTS.filter((p) => p.app === "compasso" && p.kind === "credit_pack").map(
              (pack) => (
                <article className="sheet credit-pack" key={pack.id}>
                  <h4>
                    {pack.creditAmount}
                    <small> créditos</small>
                  </h4>
                  <strong>{money(pack.listPrice?.amountCents ?? 0)}</strong>
                  <p>Sem vencimento</p>
                  <BillingForm
                    values={{
                      operation: "buy-credits",
                      ...sales,
                      productId: pack.id,
                      requestKey: randomUUID(),
                    }}
                    label="Comprar créditos"
                    enabled={data.operations["buy-credits"] && !pending && !walletUnderReview}
                    confirmation={`Quero comprar ${pack.creditAmount} créditos por ${money(pack.listPrice?.amountCents ?? 0)}.`}
                  />
                </article>
              ),
            )}
          </div>
          {!data.enabled && (
            <p className="small-note">As recargas serão disponibilizadas em breve.</p>
          )}
        </section>
      )}
      {selected && selected.purchases.length > 0 && (
        <section className="sheet purchase-history" aria-label="Compras recentes">
          <h3>Compras recentes</h3>
          <p className="small-note">As últimas dez tentativas e compras deste contrato.</p>
          <ul className="financial-list">
            {selected.purchases.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.credits} créditos</strong>
                  <span>
                    {date(p.createdAt)} ·{" "}
                    {p.disputed
                      ? "Pagamento em análise"
                      : p.status === "paid"
                        ? "Pagamento confirmado"
                        : p.status === "pending"
                          ? "Aguardando confirmação"
                          : "Tentativa encerrada"}
                  </span>
                  {p.refundedAmountCents > 0 && (
                    <span>Estorno de {money(p.refundedAmountCents)}</span>
                  )}
                </div>
                <strong>{money(p.amountCents)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.history && (
        <details className="sheet wallet-history">
          <summary>Extrato de créditos da família</summary>
          <p className="small-note">
            Lançamentos mais recentes primeiro. O extrato mostra valores e aplicativos, sem conteúdo
            das pessoas.
          </p>
          {!data.history.entries.length ? (
            <p>Ainda não há lançamentos.</p>
          ) : (
            <ul className="financial-list">
              {data.history.entries.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>
                      {entry.legacyApp &&
                      entry.amount > 0 &&
                      !["funding_restoration"].includes(entry.type)
                        ? `${entry.migrationKind === "opening" ? "Transferência de créditos" : "Créditos do contrato anterior"} · ${findApp(entry.legacyApp)?.name ?? "Aplicativo"}`
                        : (entries[entry.type] ?? "Movimentação de créditos")}
                    </strong>
                    <span>
                      {date(entry.createdAt)}
                      {entry.app
                        ? ` · ${Object.values(APPS).find((app) => app.slug === entry.app)?.name ?? "Aplicativo"}`
                        : ""}
                    </span>
                    {entry.expiresAt && <span>Validade até {date(entry.expiresAt)}</span>}
                  </div>
                  {entry.type === "funding_suspension" || entry.type === "funding_restoration" ? (
                    <span>Disponibilidade atualizada</span>
                  ) : (
                    <strong className={entry.amount > 0 ? "credit-in" : undefined}>
                      {entry.amount > 0 ? "+" : ""}
                      {entry.amount}
                    </strong>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data.history.nextCursor && (
            <a href={query({ extrato: String(data.history.nextCursor) })}>
              Lançamentos anteriores →
            </a>
          )}
        </details>
      )}
    </div>
  );
}
