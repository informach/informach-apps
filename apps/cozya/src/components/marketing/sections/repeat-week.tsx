"use client";

import { ArrowRight, Check, Repeat2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { DEMO_MEALS } from "../demo-data";
import { useDemoReady } from "../use-demo-ready";

export function RepeatWeek() {
  const ready = useDemoReady();
  const [repeated, setRepeated] = useState(false);
  return (
    <section className="landing-shell repeat-section" aria-labelledby="repeat-title">
      <div className="repeat-heading">
        <div>
          <p className="landing-eyebrow">Seu próximo começo já está aqui</p>
          <h2 className="landing-title" id="repeat-title">
            Uma semana que funciona
            <br />
            merece se repetir.
          </h2>
        </div>
        <p className="landing-description">
          Reaproveite as refeições da semana anterior, troque o que quiser e atualize a lista. Suas
          favoritas continuam à mão para a próxima rodada.
        </p>
      </div>
      <section className="repeat-example" aria-label="Exemplo de repetição da semana">
        <div className="repeat-week repeat-previous">
          <p className="landing-mini-label">SEMANA ANTERIOR</p>
          <ul>
            {DEMO_MEALS.map((meal) => (
              <li key={meal.id}>
                <span>{meal.shortDay}</span>
                <strong>{meal.recipe.name}</strong>
                <Check size={16} aria-hidden />
              </li>
            ))}
          </ul>
        </div>
        <div className="repeat-connector" aria-hidden>
          <ArrowRight size={24} />
        </div>
        <div className="repeat-week repeat-current">
          <p className="landing-mini-label">SUA PRÓXIMA SEMANA · EXEMPLO</p>
          <ul>
            {DEMO_MEALS.map((meal) => (
              <li key={meal.id} className={repeated || meal.id === "rice" ? "" : "repeat-empty"}>
                <span>{meal.shortDay}</span>
                <strong>
                  {repeated || meal.id === "rice"
                    ? meal.recipe.name
                    : "Espaço para uma escolha sua"}
                </strong>
                {meal.id === "rice" ? (
                  <small>Já planejado</small>
                ) : repeated ? (
                  <Check size={16} aria-label="Copiado" />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="repeat-actions">
        <button
          type="button"
          className="landing-button landing-button-navy"
          disabled={!ready || repeated}
          onClick={() => setRepeated(true)}
        >
          <Repeat2 size={18} aria-hidden />
          {repeated ? "Refeições copiadas" : "Repetir semana anterior"}
        </button>
        <p role="status">
          {repeated
            ? "2 refeições copiadas. A quarta-feira que você já planejou foi preservada."
            : "Experimente: as refeições preenchem os horários que ainda estão livres."}
        </p>
        {repeated && (
          <button type="button" className="landing-text-link" onClick={() => setRepeated(false)}>
            <RotateCcw size={15} aria-hidden /> Recomeçar
          </button>
        )}
      </div>
      <p className="repeat-credit-note">
        <Check size={16} aria-hidden /> Planejar, ajustar porções e acompanhar o preparo não consome
        créditos de IA.
      </p>
    </section>
  );
}
