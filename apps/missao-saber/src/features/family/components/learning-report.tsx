import { skillNames } from "@/features/content/catalog";
import { EvidenceProgress } from "@/features/learning/components/evidence-progress";
import { reviewDateLabel } from "@/features/learning/engine";
import type { FamilyLearningReport } from "../reports";

export function LearningReport({ report }: { report: FamilyLearningReport }) {
  const {
    profile,
    course,
    last,
    evidence,
    reflections,
    weekly,
    states,
    nextSkill,
    support,
    narrative,
    laboratory,
    difficulties,
    notStudied,
  } = report;
  return (
    <article className="min-w-0 space-y-6 rounded-card border border-sombra bg-creme p-5 sm:p-7">
      <h2 className="font-display text-2xl font-semibold wrap-anywhere">
        O percurso de {profile.nickname}
      </h2>
      <section>
        <h3 className="font-semibold">O que está aprendendo?</h3>
        <p className="mt-2 text-tinta-suave">
          {last
            ? `Último assunto trabalhado: ${skillNames[last.skillId] ?? last.skillId}.`
            : `A trilha ${course?.label ?? "escolhida"} está pronta. Ainda não há tentativas para descrever a aprendizagem.`}
        </p>
        {nextSkill && (
          <p className="mt-2 text-sm">
            {last ? "Próximo assunto da trilha" : "Sugestão inicial da trilha"}:{" "}
            {skillNames[nextSkill] ?? nextSkill}.
          </p>
        )}
      </section>
      <section className="rounded-controle bg-verde-claro p-4">
        <h3 className="font-semibold">O que já observamos?</h3>
        <div className="mt-2 space-y-2">
          {narrative.linhas.map((line) => (
            <p key={line} className="text-sm leading-relaxed">
              {line}
            </p>
          ))}
        </div>
      </section>
      <section>
        <h3 className="font-semibold">Como posso apoiar?</h3>
        {!evidence.length && (
          <p className="mt-2 text-sm text-tinta-suave">
            Sugestão inicial da trilha: esta orientação ainda não é baseada em tentativas do
            estudante.
          </p>
        )}
        {support ? (
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            {support.map((idea) => (
              <li key={idea}>{idea}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-tinta-suave">
            Peça que conte como pensou. Você pode ajudar a ler sem antecipar a resposta.
          </p>
        )}
      </section>
      <details className="rounded-controle border border-sombra p-4">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Ver detalhes da aprendizagem
        </summary>
        <p className="mt-3 text-sm text-tinta-suave">
          Últimos sete dias: {weekly.total} tentativas · {weekly.practiceDays} dias com prática ·{" "}
          {weekly.withHelp} com pistas.
        </p>
        <p className="mt-3 text-sm">
          A autonomia considera primeiras respostas em estratégias variadas, com evidências em mais
          de um dia. Prática e uso de ajuda são registrados separadamente. Não é uma classificação
          de capacidade.
        </p>
        <p className="mt-3 text-sm">
          Reflexões registradas: {reflections.length}, sem nota automática.
        </p>
        <p className="mt-2 text-sm">
          Dificuldades repetidas:{" "}
          {difficulties.length
            ? difficulties.map((state) => skillNames[state.skillId]).join(", ")
            : evidence.length
              ? "nenhuma repetição recente identificada"
              : "ainda não há uso suficiente para observar"}
          .
        </p>
        <p className="mt-2 text-sm">
          Ainda não estudado:{" "}
          {notStudied.length
            ? notStudied.map((id) => skillNames[id] ?? id).join(", ")
            : "todas as habilidades da trilha já têm algum registro"}
          .
        </p>
        {!!states.length && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-3 text-left font-semibold">
                Evidência acumulada e próximas revisões
              </caption>
              <thead>
                <tr>
                  <th className="p-2">Habilidade</th>
                  <th className="p-2">Evidência</th>
                  <th className="p-2">Próximo passo</th>
                </tr>
              </thead>
              <tbody>
                {states.map((state) => (
                  <tr key={state.skillId} className="border-t border-sombra">
                    <th scope="row" className="p-2 font-medium">
                      {skillNames[state.skillId]}
                    </th>
                    <td className="p-2">
                      {state.independentFamilies} estratégias novas sem pistas ·{" "}
                      {state.level === "independent"
                        ? "autonomia em construção contínua"
                        : "precisa de mais encontros"}
                    </td>
                    <td className="p-2">
                      Rever em {reviewDateLabel(state.dueOn)}
                      <EvidenceProgress evidence={evidence} skillId={state.skillId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!evidence.length && (
          <details className="mt-5">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Ver tentativas que sustentam o relatório
            </summary>
            <ul className="mt-3 space-y-2 text-sm">
              {evidence.slice(-12).map((row) => (
                <li key={`${row.sessionId}:${row.itemId}`}>
                  {skillNames[row.skillId]} ·{" "}
                  {row.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}:{" "}
                  {row.correct ? "acerto" : "próximo passo de aprendizagem"},{" "}
                  {row.helpCount ? "com pistas" : "sem pistas nesta tentativa"}.
                </li>
              ))}
            </ul>
          </details>
        )}
      </details>
      {!!laboratory.length && (
        <details className="rounded-controle border border-sombra p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Investigações no laboratório
          </summary>
          <p className="mt-2 text-sm text-tinta-suave">
            Exploração e autoavaliação são registradas separadamente da autonomia nas missões.
          </p>
          <ul className="mt-4 space-y-4">
            {laboratory.map((entry) => (
              <li key={entry.id} className="text-sm">
                <strong>{entry.title}</strong>
                <p>{entry.status}.</p>
                <p>{entry.summary}</p>
                <p className="mt-1">Próximo passo: {entry.next}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
