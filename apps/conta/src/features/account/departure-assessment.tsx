"use client";
import { findApp } from "@informach/config";
import { useActionState } from "react";
import { requestDepartureAssessmentAction } from "./departure-actions";
import type { loadDepartureReview } from "./departure-service";

type Assessment = Awaited<ReturnType<typeof loadDepartureReview>>["appAssessment"];
export function DepartureAssessment({ assessment }: { assessment: Assessment }) {
  const [state, action, pending] = useActionState(requestDepartureAssessmentAction, {
    ok: false,
    message: "",
  });
  const stale = assessment?.expired || assessment?.stale || assessment?.state === "cancelled";
  return (
    <section className="sheet departure-assessment" aria-labelledby="app-assessment-title">
      <p className="eyebrow">05 / Consulta nos aplicativos</p>
      <h2 id="app-assessment-title">O que precisa de atenção em cada app.</h2>
      <p className="departure-copy">
        Consulte a presença de dados, perfis compartilhados e acessos independentes. A consulta
        inclui aplicativos ainda não publicados que possam guardar dados da sua conta.
      </p>
      <p className="departure-copy" role="status">
        {!assessment
          ? "Inicie a consulta para reunir as respostas dos aplicativos."
          : stale
            ? "Esta consulta venceu ou foi substituída. Inicie uma nova avaliação."
            : assessment.complete
              ? "Todos os aplicativos responderam. Confira os resultados abaixo."
              : "Aguardando respostas dos aplicativos. Você pode atualizar o andamento em alguns minutos."}
      </p>
      {assessment && !stale && (
        <ul className="departure-app-results">
          {assessment.apps.map((app) => (
            <li key={app.app} className="departure-app-result">
              <h3>{findApp(app.app)?.name ?? app.app}</h3>
              {!app.result ? (
                <p className="small-note">
                  {app.retrying
                    ? "Consulta interrompida; uma nova tentativa está pendente."
                    : "Resposta pendente."}
                </p>
              ) : (
                <dl className="departure-counts">
                  <div className="departure-count-row">
                    <dt>Dados pessoais</dt>
                    <dd>{app.result.hasPersonalData ? "Presentes" : "Não identificados"}</dd>
                  </div>
                  <div className="departure-count-row">
                    <dt>Dados em contexto familiar</dt>
                    <dd>{app.result.hasSharedData ? "Presentes" : "Não identificados"}</dd>
                  </div>
                  <div className="departure-count-row">
                    <dt>Perfis sob sua responsabilidade</dt>
                    <dd>{app.result.managedProfiles}</dd>
                  </div>
                  <div className="departure-count-row">
                    <dt>Perfis com outro adulto autorizado</dt>
                    <dd>{app.result.sharedProfiles}</dd>
                  </div>
                  <div className="departure-count-row">
                    <dt>Acessos independentes ativos</dt>
                    <dd>{app.result.activeCredentials}</dd>
                  </div>
                  <div className="departure-count-row">
                    <dt>Operações pendentes</dt>
                    <dd>{app.result.pendingOperations}</dd>
                  </div>
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="departure-assessment-actions">
        <input type="hidden" name="refresh" value={assessment ? "true" : "false"} />
        <button type="submit" disabled={pending}>
          {pending
            ? "Solicitando…"
            : assessment
              ? "Refazer consulta dos aplicativos"
              : "Consultar meus aplicativos"}
        </button>
        {assessment && !stale && !assessment.complete && (
          <a href={`/privacidade/encerramento?avaliacao=${assessment.id}`}>Atualizar andamento</a>
        )}
      </form>
      {state.message && (
        <p role="alert" className="form-message">
          {state.message}
        </p>
      )}
      <p className="small-note">
        As respostas valem por 30 minutos. Nenhum conteúdo é apagado por esta consulta. Dados
        compartilhados e acessos de outras pessoas precisam ser tratados antes do encerramento.
      </p>
    </section>
  );
}
