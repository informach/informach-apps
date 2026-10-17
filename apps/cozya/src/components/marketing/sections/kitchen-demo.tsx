"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import { ArrowRight, Check, ChefHat, Minus, Plus, RotateCcw, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { LunchboxIcon } from "@/components/brand/lunchbox-icon";
import { CATEGORIES, scaleIngredient } from "@/features/kitchen/ingredients";
import { DEMO_MEALS, DEMO_OMELET, demoShopping } from "../demo-data";
import { useDemoReady } from "../use-demo-ready";

const STAGES = [
  { value: "week", number: "01", label: "Sua semana" },
  { value: "shopping", number: "02", label: "No mercado" },
  { value: "cooking", number: "03", label: "Na cozinha" },
] as const;

const AISLES = (Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).filter(
  (category) => category !== "despensa",
);

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function KitchenDemo() {
  const ready = useDemoReady();
  const [tab, setTab] = useState("week");
  const [table, setTable] = useState(2);
  const [lunchboxes, setLunchboxes] = useState(0);
  const [listPortions, setListPortions] = useState<number | null>(null);
  const [have, setHave] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const shoppingTab = useRef<HTMLButtonElement>(null);
  const cookingTab = useRef<HTMLButtonElement>(null);
  const weekTab = useRef<HTMLButtonElement>(null);
  const portions = table + lunchboxes;
  const lines = listPortions === null ? [] : demoShopping(listPortions);
  const toBuy = lines.filter((line) => line.category !== "despensa");
  const pantry = lines.filter((line) => line.category === "despensa");
  const outdated = listPortions !== null && listPortions !== portions;
  const steps = DEMO_OMELET.preparation.split("\n");

  function makeList() {
    const next = demoShopping(portions);
    // Checks survive only where the amount did not change, like the app's list.
    setHave((previous) =>
      previous.filter((key) => {
        const before = lines.find((line) => line.key === key);
        const after = next.find((line) => line.key === key);
        return before && after && before.amount === after.amount;
      }),
    );
    setListPortions(portions);
    setTab("shopping");
    shoppingTab.current?.focus();
  }

  function reset() {
    setTab("week");
    setTable(2);
    setLunchboxes(0);
    setListPortions(null);
    setHave([]);
    setCompleted([]);
    weekTab.current?.focus();
  }

  const hint =
    lunchboxes === 0
      ? `${plural(table, "pessoa", "pessoas")} na mesa, sem marmita. Vai levar almoço amanhã? Some uma marmita.`
      : `${table} na mesa + ${plural(lunchboxes, "marmita", "marmitas")} = ${portions} porções. ${
          portions === 2
            ? "A receita rende 2, fica certinho."
            : "A receita rende 2; as quantidades se ajustam."
        }`;

  return (
    <section
      id="como-funciona"
      className="landing-shell landing-section"
      aria-labelledby="demo-title"
    >
      <div className="landing-section-heading">
        <div>
          <p className="landing-eyebrow">Experimente aqui, sem cadastro</p>
          <h2 id="demo-title" className="landing-title">
            Da receita salva à mesa posta.
          </h2>
        </div>
        <p className="landing-description">
          Três jantares de exemplo. Mude quantos comem a omelete e quantas marmitas quer, veja a
          lista mudar e acompanhe o preparo.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="kitchen-demo" aria-busy={!ready}>
        <TabsList className="demo-tabs" aria-label="Etapas do exemplo">
          {STAGES.map((item) => (
            <TabsTrigger
              ref={
                item.value === "week"
                  ? weekTab
                  : item.value === "shopping"
                    ? shoppingTab
                    : cookingTab
              }
              className="demo-tab"
              disabled={!ready}
              key={item.value}
              value={item.value}
            >
              <span className="demo-tab-number">{item.number}</span>
              <span>{item.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="demo-panel-wrap">
          <TabsContent value="week" className="demo-panel">
            <ul className="demo-meals">
              {DEMO_MEALS.map((meal) =>
                meal.id === "omelet" ? (
                  <li key={meal.id} className="demo-meal demo-meal-active">
                    <div className="demo-meal-row">
                      <strong className="demo-meal-day">{meal.shortDay}</strong>
                      <span className="demo-meal-name">
                        {meal.recipe.name} <small>· a receita rende 2</small>
                      </span>
                    </div>
                    <div className="demo-steppers">
                      <fieldset className="demo-stepper">
                        <legend>Na mesa</legend>
                        <button
                          type="button"
                          disabled={!ready || table <= 1}
                          onClick={() => setTable((value) => value - 1)}
                          aria-label="Menos uma pessoa na mesa"
                        >
                          <Minus size={16} aria-hidden />
                        </button>
                        <output aria-live="polite" aria-label="Pessoas na mesa">
                          {table}
                        </output>
                        <button
                          type="button"
                          disabled={!ready || table >= 6}
                          onClick={() => setTable((value) => value + 1)}
                          aria-label="Mais uma pessoa na mesa"
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                      </fieldset>
                      <fieldset className="demo-stepper demo-stepper-peach">
                        <legend>
                          <LunchboxIcon width={16} height={16} /> Marmitas
                        </legend>
                        <button
                          type="button"
                          disabled={!ready || lunchboxes <= 0}
                          onClick={() => setLunchboxes((value) => value - 1)}
                          aria-label="Menos uma marmita"
                        >
                          <Minus size={16} aria-hidden />
                        </button>
                        <output aria-live="polite" aria-label="Marmitas">
                          {lunchboxes}
                        </output>
                        <button
                          type="button"
                          disabled={!ready || lunchboxes >= 4}
                          onClick={() => setLunchboxes((value) => value + 1)}
                          aria-label="Mais uma marmita"
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                      </fieldset>
                    </div>
                    <p className="demo-hint" role="status">
                      {hint}
                    </p>
                  </li>
                ) : (
                  <li key={meal.id} className="demo-meal">
                    <div className="demo-meal-row">
                      <strong className="demo-meal-day">{meal.shortDay}</strong>
                      <span className="demo-meal-name">{meal.recipe.name}</span>
                      <span className="demo-meal-portions">{meal.portions} porções</span>
                    </div>
                  </li>
                ),
              )}
            </ul>
            <button
              type="button"
              className="landing-button landing-button-navy demo-next"
              disabled={!ready}
              onClick={makeList}
            >
              <ShoppingBasket size={18} aria-hidden />
              {listPortions === null ? "Montar a lista do mercado" : "Atualizar a lista do mercado"}
            </button>
          </TabsContent>
          <TabsContent value="shopping" className="demo-panel">
            {listPortions === null ? (
              <div className="demo-empty">
                <ShoppingBasket size={36} aria-hidden />
                <p>Os três jantares já estão na semana. Monte a lista para ver o que comprar.</p>
                <button
                  type="button"
                  className="landing-button landing-button-navy"
                  onClick={makeList}
                >
                  Montar a lista do mercado <ArrowRight size={16} aria-hidden />
                </button>
              </div>
            ) : (
              <>
                {outdated && (
                  <div className="demo-update" role="status">
                    <p>A semana mudou: a omelete agora é para {portions}.</p>
                    <button
                      type="button"
                      className="landing-button landing-button-navy"
                      onClick={makeList}
                    >
                      <RotateCcw size={15} aria-hidden /> Atualizar a lista
                    </button>
                  </div>
                )}
                <p className="demo-shopping-summary" role="status">
                  {toBuy.length - have.length} de {toBuy.length} para pegar · toque no que já tem ou
                  já pegou
                </p>
                <div className="demo-shopping-scroll">
                  {AISLES.map((category) => {
                    const group = toBuy.filter((line) => line.category === category);
                    if (!group.length) return null;
                    return (
                      <section
                        className="demo-shopping-group"
                        key={category}
                        aria-label={CATEGORIES[category]}
                      >
                        <h3>{CATEGORIES[category]}</h3>
                        <ul>
                          {group.map((line) => (
                            <li key={line.key}>
                              <label className={have.includes(line.key) ? "demo-item-checked" : ""}>
                                <input
                                  type="checkbox"
                                  checked={have.includes(line.key)}
                                  onChange={(event) => {
                                    const checked = event.currentTarget.checked;
                                    setHave((previous) =>
                                      checked
                                        ? [...previous, line.key]
                                        : previous.filter((key) => key !== line.key),
                                    );
                                  }}
                                />
                                <span className="demo-checkmark">
                                  <Check size={14} aria-hidden />
                                </span>
                                <span className="demo-item-name">
                                  {line.name}
                                  {line.note && <small>{line.note}</small>}
                                </span>
                                <span className="demo-item-amount">{line.amount}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                  {pantry.length > 0 && (
                    <p className="demo-pantry">
                      <b>Na despensa:</b>{" "}
                      {new Intl.ListFormat("pt-BR", { type: "conjunction" }).format(
                        pantry.map((line) => line.name.toLocaleLowerCase("pt-BR")),
                      )}
                      . Tem tudo?
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="landing-button landing-button-navy demo-next"
                  onClick={() => {
                    setTab("cooking");
                    cookingTab.current?.focus();
                  }}
                >
                  <ChefHat size={18} aria-hidden /> Ver o preparo da omelete
                </button>
              </>
            )}
          </TabsContent>
          <TabsContent value="cooking" className="demo-panel">
            <div className="demo-cooking">
              <div className="demo-cooking-head">
                <span className="landing-mini-label">TERÇA · JANTAR</span>
                <h3>Omelete de abobrinha</h3>
                <p className="demo-cooking-tags">
                  <span>{table} na mesa</span>
                  {lunchboxes > 0 && (
                    <span className="tag-peach">
                      <LunchboxIcon width={14} height={14} />+{" "}
                      {plural(lunchboxes, "marmita", "marmitas")}
                    </span>
                  )}
                </p>
                <ul className="demo-cooking-ingredients">
                  {DEMO_OMELET.parsedIngredients.map((ingredient) => (
                    <li key={ingredient.original}>
                      {scaleIngredient(ingredient, DEMO_OMELET.servings, portions)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="demo-shopping-summary" role="status">
                  {completed.length} de {steps.length} passos feitos
                </p>
                <ol className="demo-cooking-steps">
                  {steps.map((step, index) => (
                    <li key={step}>
                      <label className={completed.includes(step) ? "demo-item-checked" : ""}>
                        <input
                          type="checkbox"
                          checked={completed.includes(step)}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setCompleted((previous) =>
                              checked
                                ? [...previous, step]
                                : previous.filter((item) => item !== step),
                            );
                          }}
                        />
                        <span className="demo-step-number" aria-hidden>
                          {completed.includes(step) ? <Check size={16} /> : index + 1}
                        </span>
                        <span className="demo-step-text">{step}</span>
                      </label>
                    </li>
                  ))}
                </ol>
                <p className="demo-cooking-finish" role="status">
                  {completed.length === steps.length
                    ? "Pronto! No app, aqui entra o “Como foi?” e uma nota para a próxima vez."
                    : "Toque num passo para marcar. No app, cada passo ocupa a tela inteira."}
                </p>
                <Link href="/signup" className="landing-button landing-button-primary demo-next">
                  Montar minha semana grátis <ArrowRight size={17} aria-hidden />
                </Link>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
      <div className="demo-foot">
        <p className="demo-footnote">
          Receitas de exemplo, ainda sem teste em cozinha. Nada do que você faz aqui é salvo.
        </p>
        <button
          type="button"
          className="landing-text-link demo-reset"
          disabled={!ready}
          onClick={reset}
        >
          <RotateCcw size={15} aria-hidden /> Recomeçar exemplo
        </button>
      </div>
      <noscript>
        <p className="demo-footnote">Ative o JavaScript do navegador para mexer neste exemplo.</p>
      </noscript>
    </section>
  );
}
