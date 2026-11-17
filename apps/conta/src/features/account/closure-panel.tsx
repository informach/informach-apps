import { findApp } from "@informach/config";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { ClosureForm } from "./closure-form";
import type { loadAccountClosure } from "./closure-service";

type Closure = NonNullable<Awaited<ReturnType<typeof loadAccountClosure>>>;
const titles: Record<Closure["state"], string> = {
  preparing: "Conferindo o que será encerrado.",
  ready: "Confira antes de confirmar.",
  executing: "Seu encerramento está em andamento.",
  paused: "Uma mudança precisa da sua atenção.",
  repreparing: "Conferindo as etapas restantes.",
  review_required: "Confira a preparação atualizada.",
  finalizing: "Concluindo seu encerramento.",
  resuming: "Preparando seu retorno aos aplicativos.",
  completed: "Sua participação no Compasso foi encerrada.",
  cancelled: "Seu acesso ao Compasso foi retomado.",
};
const blockerMessages = {
  responsibilities: "Há responsabilidades familiares que precisam ser resolvidas.",
  pending_operations: "Há operações em andamento. Aguarde a conclusão e atualize a preparação.",
  financial_review: "Há pagamentos que precisam ser conferidos antes de continuar.",
  changed_authority: "As permissões mudaram. É necessário conferir a preparação novamente.",
};
const domainName = (domain: string) =>
  domain === "billing"
    ? "Assinatura e pagamentos"
    : domain === "family"
      ? "Pessoas e família"
      : (findApp(domain.slice(4))?.name ?? "Aplicativo");
export function ClosurePanel({ closure }: { closure: Closure }) {
  const beforeConsent = ["preparing", "ready"].includes(closure.state);
  const terminal = ["completed", "cancelled"].includes(closure.state);
  const phase = closure.state === "resuming" ? "resume" : "erase";
  return (
    <main id="conteudo" className="departure-main">
      <a href="/">← Minha conta</a>
      <header className="welcome">
        <p className="eyebrow">Privacidade / Compasso</p>
        <h1>{titles[closure.state]}</h1>
        <p className="departure-copy">
          Seu login compartilhado e os produtos independentes, como a Suíte Edi, são preservados.
        </p>
      </header>
      {!terminal && (
        <section className="sheet">
          <h2>
            {beforeConsent
              ? "Seu acesso está temporariamente suspenso."
              : "O que já foi concluído permanece registrado."}
          </h2>
          <p>
            {beforeConsent
              ? "As sessões dos aplicativos e os acessos de aparelhos vinculados a você foram suspensos para conferir os dados. Nenhuma exclusão foi autorizada ainda. Você pode desistir antes da confirmação definitiva."
              : closure.state === "resuming"
                ? "Estamos encerrando operações antigas antes de liberar o acesso novamente. Seus dados serão preservados; alguns aparelhos precisarão ser conectados outra vez."
                : "O encerramento definitivo já foi autorizado. Ele não pode ser desfeito. Uma interrupção não reabre o acesso nem repete etapas concluídas."}
          </p>
          {closure.state === "paused" && (
            <p>
              Os vínculos ou dados mudaram desde a confirmação. A execução foi pausada. Confira uma
              nova preparação do que ainda falta antes de autorizar a continuação.
            </p>
          )}
          <a href="/privacidade/encerramento">Atualizar andamento</a>
        </section>
      )}
      <div className="departure-grid">
        {closure.steps
          .filter((step) => step.phase === "prepare")
          .map((step) => {
            const execution = closure.steps.find(
              (item) => item.domain === step.domain && item.phase === phase,
            );
            const done = execution?.state === "done";
            return (
              <section key={step.domain} className="sheet">
                <h2>{domainName(step.domain)}</h2>
                <p className="small-note">
                  {done
                    ? "Etapa concluída"
                    : step.state !== "done"
                      ? "Conferência pendente"
                      : execution?.lastError
                        ? "Etapa pendente de nova conferência ou tentativa"
                        : "Preparação conferida"}
                </p>
                {step.plan && (
                  <>
                    <dl className="departure-counts">
                      <div className="departure-count-row">
                        <dt>Registros pessoais na seleção</dt>
                        <dd>{step.plan.personalRecords}</dd>
                      </div>
                      <div className="departure-count-row">
                        <dt>Registros compartilhados ou históricos preservados</dt>
                        <dd>{step.plan.sharedRecords}</dd>
                      </div>
                      <div className="departure-count-row">
                        <dt>
                          {step.domain === "billing"
                            ? "Programações futuras a encerrar"
                            : "Acessos a encerrar"}
                        </dt>
                        <dd>{step.plan.credentials}</dd>
                      </div>
                    </dl>
                    {step.plan.blockers.map((blocker) => (
                      <p className="form-message" key={blocker}>
                        {blockerMessages[blocker]}
                      </p>
                    ))}
                  </>
                )}
              </section>
            );
          })}
      </div>
      {closure.digest && (
        <section className="sheet">
          <h2>{beforeConsent ? "Encerrar definitivamente" : "Autorizar a continuação"}</h2>
          <p>
            Os dados pessoais selecionados serão apagados, seus acessos e renovações do Compasso
            serão encerrados. Históricos compartilhados, períodos já pagos, créditos e registros
            financeiros serão preservados conforme sua titularidade e permissões.
          </p>
          <p>
            A cópia abaixo reúne seu cadastro e seus registros financeiros. Os conteúdos dos
            aplicativos precisam ser exportados antes da preparação. Depois da confirmação, não há
            retorno aos dados apagados.
          </p>
          <a href="/api/account/export">Baixar dados da conta ↗</a>
          {beforeConsent && (
            <p>
              Se ainda precisa exportar conteúdos dos aplicativos, use “Desistir do encerramento”
              para voltar a acessá-los antes de decidir.
            </p>
          )}
          <ClosureForm
            values={{ operation: "confirm", closureId: closure.id, digest: closure.digest }}
            label={
              beforeConsent
                ? "Confirmar encerramento definitivo"
                : "Confirmar continuação do encerramento"
            }
            irreversible
            confirmation="Li a preparação acima e autorizo o encerramento das etapas pendentes, com exclusão irreversível dos dados selecionados."
          />
        </section>
      )}
      {beforeConsent && (
        <section className="sheet">
          <h2>Antes de decidir</h2>
          <ClosureForm
            values={{ operation: "refresh", closureId: closure.id }}
            label="Atualizar preparação"
          />
          <ClosureForm
            values={{ operation: "resume", closureId: closure.id }}
            label="Desistir do encerramento"
            confirmation="Quero manter meus dados e retomar o uso depois da conferência das operações pendentes."
          />
        </section>
      )}
      {["paused", "repreparing", "review_required"].includes(closure.state) && (
        <section className="sheet">
          <h2>Conferir o que ainda falta</h2>
          <ClosureForm
            values={{ operation: "reprepare", closureId: closure.id }}
            label="Atualizar etapas restantes"
          />
        </section>
      )}
      <p className="small-note">
        Precisa resolver uma responsabilidade ou uma etapa pendente?{" "}
        <a href={INFORMACH_CONTACT.directMessageUrl}>Fale com a gente ↗</a>
      </p>
    </main>
  );
}
