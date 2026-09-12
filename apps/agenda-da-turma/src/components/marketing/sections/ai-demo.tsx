"use client";
import { useState } from "react";
import type { LandingScenario } from "@/features/metrics/landing-schema";
import styles from "../sales.module.css";
import { SalesCta } from "../sales-cta";

type DemoAction = { id: string; title: string; detail: string; date?: string; planning?: boolean };
type Scenario = {
  label: string;
  title: string;
  message: string;
  attachment: string;
  excerpt: string;
  actions: DemoAction[];
};
const SCENARIOS: Record<LandingScenario, Scenario> = {
  passeio: {
    label: "Passeio",
    title: "Um recado. Três coisas para resolver. Tudo à vista.",
    message:
      "O passeio ao museu será em 18/09/2026, às 8h. Enviem a autorização até 16/09. Os itens para levar estão no PDF.",
    attachment: "Orientações do passeio.pdf",
    excerpt:
      "Levar boné e garrafa de água. Saída no portão principal. O prazo para separar o material não foi informado.",
    actions: [
      {
        id: "autorizacao",
        title: "Enviar autorização",
        detail: "Prazo informado pela escola",
        date: "16/09",
      },
      {
        id: "preparacao",
        title: "Separar boné e garrafa",
        detail: "O recado não informa uma data de preparo",
        planning: true,
      },
      {
        id: "passeio",
        title: "Passeio ao museu",
        detail: "Às 8h · Saída no portão principal",
        date: "18/09",
      },
    ],
  },
  prova: {
    label: "Prova",
    title: "Uma prova. O que estudar e quando. Tudo à vista.",
    message: "Nossa avaliação de Ciências será em 22/09/2026. O roteiro de estudo está no anexo.",
    attachment: "Roteiro de Ciências.pdf",
    excerpt: "Revisar as páginas 24 a 31 do livro. Não foi definida uma data para a revisão.",
    actions: [
      {
        id: "estudo",
        title: "Revisar as páginas 24 a 31",
        detail: "Ciências · Data de estudo não informada",
      },
      {
        id: "prova",
        title: "Avaliação de Ciências",
        detail: "Data informada pela escola",
        date: "22/09",
      },
    ],
  },
  material: {
    label: "Material",
    title: "Um pedido de material. O que levar e até quando.",
    message:
      "Para a aula de Artes de 21/09/2026, cada criança deverá trazer os materiais da lista anexa.",
    attachment: "Materiais de Artes.pdf",
    excerpt: "Uma caixa de sapatos, cola branca e papéis coloridos.",
    actions: [
      {
        id: "material",
        title: "Levar o material de Artes",
        detail: "Caixa de sapatos, cola branca e papéis coloridos",
        date: "21/09",
      },
    ],
  },
};

function DemoResult({ scenario }: { scenario: LandingScenario }) {
  const [planned, setPlanned] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const data = SCENARIOS[scenario];
  return (
    <div className={styles.demoOutput}>
      <div className={styles.outputHeader}>
        <h3>O que precisa de atenção</h3>
        <span className={[styles.pill, styles.blue].join(" ")}>
          {data.actions.length} {data.actions.length === 1 ? "providência" : "providências"}
        </span>
      </div>
      {data.actions.map((action) => {
        const id = `demo-${action.id}`;
        return (
          <div className={styles.outputRow} key={action.id}>
            <input
              id={id}
              type="checkbox"
              checked={completed.includes(action.id)}
              data-landing-action="complete"
              data-landing-scenario={scenario}
              onChange={(event) =>
                setCompleted((current) =>
                  event.target.checked
                    ? [...current, action.id]
                    : current.filter((item) => item !== action.id),
                )
              }
            />
            <div>
              <label htmlFor={id}>{action.title}</label>
              <p className={styles.meta}>{action.detail}</p>
              <span className={[styles.pill, action.date ? styles.blue : styles.amber].join(" ")}>
                {action.date
                  ? `${action.date} · Informado pela escola`
                  : action.planning && planned
                    ? "17/09 · Planejado pela família"
                    : "Prazo a confirmar"}
              </span>
              {action.planning && (
                <button
                  type="button"
                  className={styles.planButton}
                  disabled={planned}
                  data-landing-action="plan"
                  data-landing-scenario={scenario}
                  onClick={() => setPlanned(true)}
                >
                  {planned ? "Planejado para 17/09" : "Planejar para a véspera"}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <p className={styles.demoState} role="status" aria-live="polite" aria-atomic="true">
        {completed.length > 0
          ? completed.length +
            " de " +
            data.actions.length +
            " concluídas nesta demonstração. Nada é enviado à escola."
          : planned
            ? "Preparação escolhida para 17/09. A autorização continua com prazo de 16/09."
            : "Experimente marcar uma providência como feita."}
      </p>
    </div>
  );
}
export function AiDemo() {
  const [scenario, setScenario] = useState<LandingScenario>("passeio");
  const data = SCENARIOS[scenario];
  return (
    <section
      id="demonstracao"
      className={[styles.section, styles.demoSection].join(" ")}
      aria-labelledby="demo-title"
    >
      <div className={styles.wrap}>
        <div className={styles.demoHeading}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Experimente antes de criar sua conta</p>
            <h2 id="demo-title">{data.title}</h2>
            <p>Veja a mensagem e o anexo organizados juntos.</p>
          </div>
          <fieldset className={styles.scenarioOptions} aria-label="Escolha um exemplo">
            {(Object.keys(SCENARIOS) as LandingScenario[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={scenario === key}
                data-landing-action="scenario"
                data-landing-scenario={key}
                onClick={() => setScenario(key)}
              >
                {SCENARIOS[key].label}
              </button>
            ))}
          </fieldset>
        </div>
        <div className={styles.demo}>
          <div className={styles.demoSource}>
            <p className={styles.demoLabel}>O recado que você recebeu</p>
            <blockquote>{data.message}</blockquote>
            <div className={styles.attachment}>
              <span className={styles.pdf}>PDF</span>
              <div>
                <strong>{data.attachment}</strong>
                <p>{data.excerpt}</p>
              </div>
            </div>
            <p className={styles.fine}>
              Demonstração com dados fictícios. A revisão e os responsáveis são escolhas da família.
              Nenhum recado real é enviado nesta demonstração.
            </p>
          </div>
          <DemoResult key={scenario} scenario={scenario} />
        </div>
        <div className={styles.demoFoot}>
          <p>Agora imagine fazer isso com o próximo recado da sua escola.</p>
          <SalesCta placement="demo" />
        </div>
      </div>
    </section>
  );
}
