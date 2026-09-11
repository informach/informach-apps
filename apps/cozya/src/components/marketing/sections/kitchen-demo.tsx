"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import { ArrowRight, Check, ChefHat, Minus, Plus, RotateCcw, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { CATEGORIES, scaleIngredient } from "@/features/kitchen/ingredients";
import { DEMO_MEALS, DEMO_OMELET, demoShopping } from "../demo-data";
import { useDemoReady } from "../use-demo-ready";

const STAGES = [
  {
    value: "week",
    number: "01",
    label: "Sua semana",
    title: "Escolha o que vai à mesa.",
    description:
      "Três jantares já são um começo. Experimente mudar as porções da omelete para incluir as marmitas.",
  },
  {
    value: "shopping",
    number: "02",
    label: "Suas compras",
    title: "Leve as escolhas para a lista.",
    description:
      "Os ingredientes das três receitas ficam reunidos por categoria. Marque o que já tem antes de sair.",
  },
  {
    value: "cooking",
    number: "03",
    label: "Na cozinha",
    title: "Um passo de cada vez.",
    description:
      "Com a receita aberta, acompanhe os ingredientes e marque as etapas do preparo. Seu próximo jantar está encaminhado.",
  },
] as const;

export function KitchenDemo() {
  const ready = useDemoReady();
  const [tab, setTab] = useState("week");
  const [portions, setPortions] = useState(2);
  const [listPortions, setListPortions] = useState<number | null>(null);
  const [have, setHave] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const shoppingTab = useRef<HTMLButtonElement>(null);
  const cookingTab = useRef<HTMLButtonElement>(null);
  const weekTab = useRef<HTMLButtonElement>(null);
  const lines = listPortions === null ? [] : demoShopping(listPortions);
  const outdated = listPortions !== null && listPortions !== portions;
  const stage = STAGES.find((item) => item.value === tab) ?? STAGES[0];
  const steps = DEMO_OMELET.preparation.split("\n");

  function generateList() {
    const next = demoShopping(portions);
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
    setPortions(2);
    setListPortions(null);
    setHave([]);
    setCompleted([]);
    weekTab.current?.focus();
  }

  return (
    <section
      id="como-funciona"
      className="landing-shell landing-section"
      aria-labelledby="demo-title"
    >
      <div className="landing-section-heading">
        <div>
          <p className="landing-eyebrow">Veja a rotina acontecer</p>
          <h2 id="demo-title" className="landing-title">
            Da receita salva
            <br />à mesa posta.
          </h2>
        </div>
        <p className="landing-description">
          Comece com três refeições. Escolha os dias, ajuste as porções e gere as compras. Na
          cozinha, acompanhe cada etapa.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="kitchen-demo" aria-busy={!ready}>
        <div className="demo-topbar">
          <span>
            <span className="landing-dot" /> Exemplo de uso
          </span>
          <span>Experimente aqui, sem cadastro</span>
        </div>
        <TabsList className="demo-tabs" aria-label="Etapas da rotina no Cozya">
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
        <div className="demo-body">
          <aside className="demo-guide">
            <span className="demo-guide-number" aria-hidden>
              {stage.number}
            </span>
            <h3>{stage.title}</h3>
            <p>{stage.description}</p>
            <button
              type="button"
              className="landing-text-link demo-reset"
              disabled={!ready}
              onClick={reset}
            >
              <RotateCcw size={15} aria-hidden /> Recomeçar exemplo
            </button>
          </aside>
          <div className="demo-workspace">
            <TabsContent value="week" className="demo-panel">
              <div className="demo-panel-heading">
                <div>
                  <span className="landing-mini-label">SEU PLANEJAMENTO</span>
                  <h3>Uma semana com a sua cara</h3>
                </div>
                <span className="demo-counter">3 refeições</span>
              </div>
              <div className="demo-meals">
                {DEMO_MEALS.map((meal) => (
                  <div
                    key={meal.id}
                    className={`demo-meal ${meal.id === "omelet" ? "demo-meal-active" : ""}`}
                  >
                    <div className="demo-meal-day">
                      <strong>{meal.shortDay}</strong>
                      <span>Jantar</span>
                    </div>
                    <div className="demo-meal-detail">
                      <h4>{meal.recipe.name}</h4>
                      <span>
                        {meal.id === "omelet"
                          ? "Experimente ajustar as porções"
                          : `${meal.portions} porções planejadas`}
                      </span>
                    </div>
                    {meal.id === "omelet" && (
                      <fieldset className="demo-stepper" aria-label="Porções da omelete">
                        <button
                          type="button"
                          disabled={!ready || portions <= 2}
                          onClick={() => setPortions((value) => value - 2)}
                          aria-label="Diminuir porções da omelete"
                        >
                          <Minus size={16} aria-hidden />
                        </button>
                        <output aria-live="polite" aria-label="Porções da omelete">
                          {portions}
                        </output>
                        <button
                          type="button"
                          disabled={!ready || portions >= 6}
                          onClick={() => setPortions((value) => value + 2)}
                          aria-label="Aumentar porções da omelete"
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                      </fieldset>
                    )}
                  </div>
                ))}
              </div>
              <p className="demo-hint" role="status">
                {portions === 2
                  ? "2 porções para o jantar. Vai separar marmitas? Experimente 4."
                  : portions === 4
                    ? "4 porções: 2 para o jantar + 2 para levar amanhã."
                    : "6 porções para dividir como sua rotina pedir."}
              </p>
              <button
                type="button"
                className="landing-button landing-button-navy demo-next"
                disabled={!ready}
                onClick={generateList}
              >
                <ShoppingBasket size={18} aria-hidden />
                {listPortions === null ? "Gerar lista de compras" : "Atualizar lista de compras"}
                <ArrowRight size={17} aria-hidden />
              </button>
            </TabsContent>
            <TabsContent value="shopping" className="demo-panel">
              <div className="demo-panel-heading">
                <div>
                  <span className="landing-mini-label">ANTES DE IR AO MERCADO</span>
                  <h3>Suas compras, reunidas</h3>
                </div>
                <ShoppingBasket size={22} aria-hidden />
              </div>
              {listPortions === null ? (
                <div className="demo-empty">
                  <ShoppingBasket size={36} aria-hidden />
                  <p>
                    Suas três refeições já estão no exemplo. Gere a lista para ver os ingredientes
                    juntos.
                  </p>
                  <button
                    type="button"
                    className="landing-button landing-button-navy"
                    onClick={generateList}
                  >
                    Gerar lista de compras <ArrowRight size={16} aria-hidden />
                  </button>
                </div>
              ) : (
                <>
                  {outdated && (
                    <div className="demo-update" role="status">
                      <p>As porções mudaram. Atualize a lista para levar as novas quantidades.</p>
                      <button type="button" className="landing-text-link" onClick={generateList}>
                        Atualizar lista de compras <RotateCcw size={15} aria-hidden />
                      </button>
                    </div>
                  )}
                  <p className="demo-shopping-summary" role="status">
                    {lines.length - have.length} de {lines.length} itens para conferir · omelete
                    para {listPortions} porções
                  </p>
                  <section className="demo-shopping-scroll" aria-label="Ingredientes da semana">
                    {Object.entries(CATEGORIES).map(([category, label]) => {
                      const group = lines.filter((line) => line.category === category);
                      if (!group.length) return null;
                      return (
                        <div className="demo-shopping-group" key={category}>
                          <h4>{label}</h4>
                          <ul>
                            {group.map((line) => (
                              <li key={line.key}>
                                <label
                                  className={have.includes(line.key) ? "demo-item-checked" : ""}
                                >
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
                                    <small>{line.amount}</small>
                                    {line.note && (
                                      <small className="demo-item-note">{line.note}</small>
                                    )}
                                  </span>
                                  <span className="demo-have-label">Já tenho</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </section>
                  <button
                    type="button"
                    className="landing-button landing-button-navy demo-next"
                    onClick={() => {
                      setTab("cooking");
                      cookingTab.current?.focus();
                    }}
                  >
                    <ChefHat size={18} aria-hidden /> Ver o preparo{" "}
                    <ArrowRight size={17} aria-hidden />
                  </button>
                </>
              )}
            </TabsContent>
            <TabsContent value="cooking" className="demo-panel">
              <div className="demo-panel-heading">
                <div>
                  <span className="landing-mini-label">TERÇA · JANTAR</span>
                  <h3>Omelete de abobrinha</h3>
                </div>
                <span className="demo-counter">{portions} porções</span>
              </div>
              <div className="demo-cooking-ingredients">
                {DEMO_OMELET.parsedIngredients.map((ingredient) => (
                  <span key={ingredient.original}>
                    {scaleIngredient(ingredient, DEMO_OMELET.servings, portions)}
                  </span>
                ))}
              </div>
              <p className="demo-shopping-summary" role="status">
                {completed.length} de {steps.length} etapas concluídas
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
              <div className="demo-cooking-finish" role="status">
                {completed.length === steps.length
                  ? "Preparo acompanhado. Agora leve essa organização para a sua semana."
                  : "Marque uma etapa para experimentar o modo de preparo."}
              </div>
              <Link href="/signup" className="landing-button landing-button-navy demo-next">
                Planejar minha semana grátis <ArrowRight size={17} aria-hidden />
              </Link>
            </TabsContent>
          </div>
        </div>
      </Tabs>
      <noscript>
        <p className="demo-footnote">
          Ative o JavaScript do navegador para interagir com este exemplo.
        </p>
      </noscript>
      <p className="demo-footnote">
        Uma demonstração com receitas de exemplo. Suas escolhas aqui não são salvas na conta.
      </p>
    </section>
  );
}
