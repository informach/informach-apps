"use client";

import { ArrowRight, Check, Repeat2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEMO_MEALS } from "../demo-data";
import { useDemoReady } from "../use-demo-ready";

/** This week's Wednesday was planned before repeating: it must stay as it is. */
const ALREADY_PLANNED = "Batata e brócolis de assadeira";

export function RepeatWeek() {
  const ready = useDemoReady();
  const [repeated, setRepeated] = useState(false);
  const touched = useRef(false);
  const repeatButton = useRef<HTMLButtonElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  // The pressed button disappears or turns disabled: keep the keyboard on the next action.
  useEffect(() => {
    if (!touched.current) return;
    (repeated ? resetButton : repeatButton).current?.focus();
  }, [repeated]);
  const choose = (value: boolean) => {
    touched.current = true;
    setRepeated(value);
  };
  return (
    <section
      className="landing-shell landing-section repeat-section"
      aria-labelledby="repeat-title"
    >
      <div className="landing-section-heading">
        <div>
          <p className="landing-eyebrow">Na semana seguinte</p>
          <h2 className="landing-title" id="repeat-title">
            Uma semana que funcionou merece se repetir.
          </h2>
        </div>
        <p className="landing-description">
          Repita a semana passada nos dias que ainda estão livres, troque o que quiser e monte a
          lista de novo. Planejar, montar a lista e cozinhar não usam créditos.
        </p>
      </div>
      <section className="repeat-example" aria-label="Exemplo de repetir a semana">
        <div className="repeat-week">
          <p className="landing-mini-label">SEMANA PASSADA</p>
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
          <p className="landing-mini-label">ESTA SEMANA · EXEMPLO</p>
          <ul>
            {DEMO_MEALS.map((meal) => (
              <li key={meal.id} className={repeated || meal.id === "rice" ? "" : "repeat-empty"}>
                <span>{meal.shortDay}</span>
                <strong>
                  {meal.id === "rice" ? ALREADY_PLANNED : repeated ? meal.recipe.name : "Dia livre"}
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
          ref={repeatButton}
          disabled={!ready || repeated}
          onClick={() => choose(true)}
        >
          <Repeat2 size={18} aria-hidden />
          {repeated ? "Semana repetida" : "Repetir a semana passada"}
        </button>
        <p role="status" className="repeat-status">
          {repeated
            ? "2 jantares copiados para os dias livres. A quarta que você já tinha planejado ficou como estava."
            : "Experimente: só os dias livres recebem as refeições da semana passada."}
        </p>
        {repeated && (
          <button
            ref={resetButton}
            type="button"
            className="landing-text-link"
            onClick={() => choose(false)}
          >
            <RotateCcw size={15} aria-hidden /> Recomeçar
          </button>
        )}
      </div>
    </section>
  );
}
