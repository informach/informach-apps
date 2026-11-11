import { findApp } from "@informach/config";
import { getCollectionApps } from "@informach/config/collections";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { getAppUrl } from "@informach/config/domains";
import { ClosureForm } from "./closure-form";
import { DepartureAssessment } from "./departure-assessment";
import type { loadDepartureReview } from "./departure-service";

type Review = Awaited<ReturnType<typeof loadDepartureReview>>;
const name = (app: string) =>
  app === "compasso" ? "Compasso" : (findApp(app)?.name ?? "Outro produto");
export function DeparturePanel({
  review,
  environment,
}: {
  review: Review;
  environment: "production" | "development";
}) {
  const memberships = review.records.flatMap((chunk) =>
    chunk.kind === "family.memberships" ? chunk.records : [],
  );
  const people = review.records.flatMap((chunk) =>
    chunk.kind === "family.identity_responsibilities" ? chunk.records : [],
  );
  const profiles = review.records.flatMap((chunk) =>
    chunk.kind === "family.profile_responsibilities" ? chunk.records : [],
  );
  const contracts = review.records.flatMap((chunk) =>
    chunk.kind === "billing.open_contracts" ? chunk.records : [],
  );
  const purchases = review.records.flatMap((chunk) =>
    chunk.kind === "billing.pending_credit_purchases" ? chunk.records : [],
  );
  const checkouts = review.records.flatMap((chunk) =>
    chunk.kind === "billing.subscription_checkouts" ? chunk.records : [],
  );
  const changes = review.records.flatMap((chunk) =>
    chunk.kind === "billing.scheduled_changes" ? chunk.records : [],
  );
  const reservations = review.records.flatMap((chunk) =>
    chunk.kind === "billing.active_ai_reservations" ? chunk.records : [],
  );
  const coordinations = review.records.flatMap((chunk) =>
    chunk.kind === "billing.pending_coordinations" ? chunk.records : [],
  );
  const independent = [
    ...new Set(
      review.records.flatMap((chunk) =>
        chunk.kind === "billing.independent_products"
          ? chunk.records.map((row) => name(row.app))
          : [],
      ),
    ),
  ];
  const identity = review.records.find(
    (chunk) => chunk.kind === "account.identity_dependencies",
  )?.data;
  const edi = review.records.find((chunk) => chunk.kind === "edi.identity_dependencies")?.data;
  return (
    <main id="conteudo" className="departure-main">
      <a href="/#privacidade">← Voltar para minha conta</a>
      <header className="welcome">
        <p className="eyebrow">Privacidade / Preparar encerramento</p>
        <h1>Uma saída bem cuidada.</h1>
        <p className="departure-copy">
          Confira seus vínculos e o que precisa ser resolvido antes de encerrar sua participação no
          Compasso.
        </p>
      </header>
      <div className="departure-grid">
        <section className="sheet">
          <p className="eyebrow">01 / Pessoas e família</p>
          <h2>Quem continua com você?</h2>
          <p className="departure-copy">
            O cadastro compartilhado de uma pessoa e as permissões de cada aplicativo têm
            responsáveis próprios.
          </p>
          {memberships.length === 0 ? (
            <p className="departure-copy">Você não participa de nenhuma família no momento.</p>
          ) : (
            <ul className="departure-list">
              {memberships.map((group) => (
                <li key={group.id}>
                  <strong>{group.name}</strong>
                  <p className="departure-copy">
                    {group.role === "administrator" &&
                    group.otherMembers > 0 &&
                    group.otherAdministrators === 0
                      ? "Transfira a administração para outro adulto antes de sair."
                      : group.otherMembers === 0
                        ? "Só você participa desta família. Seus dados e perfis precisam ser tratados antes de encerrá-la."
                        : "A família tem outros participantes. Os dados deles serão preservados."}
                  </p>
                  {!group.archivedAt && (
                    <a href={`/?familia=${group.id}#pessoas`}>Gerenciar família ↗</a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {people.length > 0 && (
            <details className="departure-details" open>
              <summary className="departure-summary">
                Cadastros sob sua responsabilidade ({people.length})
              </summary>
              <ul className="departure-list">
                {people.map((person) => (
                  <li key={person.id}>
                    <strong>
                      {person.displayName}
                      {person.archivedAt ? " · arquivado" : ""}
                    </strong>
                    <p className="departure-copy">
                      {person.otherCustodians > 0
                        ? "Há outro responsável pelo cadastro comum."
                        : "Você é o único responsável disponível pelo cadastro. Transfira a responsabilidade com aceite de outro adulto ou resolva o destino deste cadastro antes de encerrar."}
                    </p>
                    {person.accessibleGroups === 0 && (
                      <p className="departure-copy">
                        Você não tem mais acesso à família desse cadastro.{" "}
                        <a href={INFORMACH_CONTACT.directMessageUrl}>
                          Solicite ajuda para resolver a responsabilidade ↗
                        </a>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {profiles.length > 0 && (
            <details className="departure-details">
              <summary className="departure-summary">
                Perfis dos aplicativos ({profiles.length})
              </summary>
              <ul className="departure-list">
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <strong>
                      {name(profile.app)}
                      {profile.ownAccount ? " · seu perfil" : " · perfil sob sua gestão"}
                      {profile.archivedAt ? " · arquivado" : ""}
                    </strong>
                    <p className="departure-copy">
                      {profile.otherManagers > 0
                        ? "Outro adulto tem permissão para gerenciar este histórico."
                        : "Nenhum outro adulto possui permissão para gerenciar este histórico. Defina quem ficará responsável ou exclua os dados autorizados no aplicativo."}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
        <section className="sheet">
          <p className="eyebrow">02 / Assinaturas e créditos</p>
          <h2>Confira suas pendências.</h2>
          <p className="departure-copy">
            Esta consulta inclui somente compromissos financeiros pelos quais você é responsável.
          </p>
          <dl className="departure-counts">
            <div className="departure-count-row">
              <dt>Contratos a resolver</dt>
              <dd>{contracts.length}</dd>
            </div>
            <div className="departure-count-row">
              <dt>Compras de assinatura em conferência</dt>
              <dd>{checkouts.length}</dd>
            </div>
            <div className="departure-count-row">
              <dt>Recargas em conferência</dt>
              <dd>{purchases.length}</dd>
            </div>
            <div className="departure-count-row">
              <dt>Mudanças de plano pendentes</dt>
              <dd>{changes.length}</dd>
            </div>
            <div className="departure-count-row">
              <dt>Operações de IA com créditos reservados</dt>
              <dd>{reservations.length}</dd>
            </div>
            <div className="departure-count-row">
              <dt>Pedidos de adiamento da sua cobrança</dt>
              <dd>{coordinations.length}</dd>
            </div>
          </dl>
          {contracts.length > 0 && (
            <details className="departure-details">
              <summary className="departure-summary">Ver contratos</summary>
              <ul className="departure-list">
                {contracts.map((contract) => (
                  <li key={contract.id}>
                    <strong>{name(contract.app)}</strong>
                    <p className="departure-copy">
                      {contract.cancelAtPeriodEnd
                        ? "Cancelamento solicitado para o fim do período. O contrato ainda precisa ser conciliado no encerramento."
                        : "O contrato ainda precisa ser resolvido antes de encerrar a conta."}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="departure-copy">
            Cancelar uma assinatura encerra sua renovação. Créditos e dados têm destinos próprios;
            abrir esta página não os altera.
          </p>
          <a href="/#compasso">Gerenciar assinaturas e créditos ↗</a>
        </section>
        <section className="sheet">
          <p className="eyebrow">03 / Seu acesso compartilhado</p>
          <h2>Outros produtos continuam separados.</h2>
          <p className="departure-copy">
            O encerramento do Compasso não autoriza excluir o acesso à Suíte Edi nem a outros
            produtos independentes.
          </p>
          {independent.length > 0 && (
            <p className="departure-copy">Há registros de cobrança em: {independent.join(", ")}.</p>
          )}
          {edi &&
            (edi.devicesPresent ||
              edi.licenseRecordPresent ||
              edi.pendingOperationPresent ||
              edi.replayProofsPresent) && (
              <p className="departure-copy">
                Há registros de dispositivos, licenças ou operações da Suíte Edi associados à sua
                conta. Eles serão preservados e tratados na própria suíte.
              </p>
            )}
          {identity?.hasStaffRole && (
            <p className="departure-copy">
              Seu acesso ao Bastidores precisa ser preservado e tratado separadamente.
            </p>
          )}
          {identity &&
            (identity.desktopAuthorizationPresent ||
              identity.organizationMemberships > 0 ||
              identity.unscopedLiveSessions > 0 ||
              identity.hasOtherRole) && (
              <p className="departure-copy">
                Também existem vínculos de acesso fora das sessões web do Compasso. Eles serão
                conferidos antes de qualquer exclusão do login compartilhado.
              </p>
            )}
        </section>
        <section className="sheet">
          <p className="eyebrow">04 / Dados de cada aplicativo</p>
          <h2>Seu histórico, suas escolhas.</h2>
          <p className="departure-copy">
            Exporte o que deseja guardar. Confira os perfis e as opções de exclusão de cada
            aplicativo antes de decidir encerrar.
          </p>
          <div className="apps-strip">
            {getCollectionApps("compasso", { publishedOnly: true }).map((app) =>
              app.privacyPath ? (
                <a key={app.slug} href={`${getAppUrl(app.slug, environment)}${app.privacyPath}`}>
                  <span>{app.name}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              ) : null,
            )}
          </div>
          <p className="small-note">
            Esta é a conferência dos vínculos compartilhados. Ela não comprova a limpeza dos dados
            dos aplicativos e não executa exclusões.
          </p>
          <a href="/api/account/export">Baixar dados da conta ↗</a>
        </section>
        <DepartureAssessment assessment={review.appAssessment} />
        {review.appAssessment?.complete &&
          !review.appAssessment.expired &&
          !review.appAssessment.stale &&
          review.appAssessment.state !== "cancelled" && (
            <section className="sheet">
              <p className="eyebrow">06 / Próxima etapa</p>
              <h2>Preparar o encerramento do Compasso</h2>
              <p>
                Para conferir a seleção definitiva, vamos suspender temporariamente seus acessos ao
                Compasso e encerrar suas sessões web. Você entrará novamente nesta central para
                acompanhar a preparação.
              </p>
              <p>
                Essa etapa ainda não apaga dados nem cancela sua assinatura. Depois de conferir o
                resumo, você poderá confirmar o encerramento definitivo ou desistir.
              </p>
              <ClosureForm
                values={{ operation: "begin", reviewId: review.appAssessment.id }}
                label="Iniciar preparação do encerramento"
                confirmation="Entendo que meus acessos ao Compasso serão suspensos durante a preparação e que precisarei entrar novamente."
              />
            </section>
          )}
      </div>
      <p className="small-note">
        Consulta realizada em{" "}
        {new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "America/Sao_Paulo",
        }).format(review.observedAt)}
        . Mudanças na família, nos pagamentos e nos aplicativos serão conferidas novamente antes de
        qualquer encerramento.
      </p>
    </main>
  );
}
