import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { ArrowRight, Check, ChevronRight, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { LunchboxIcon } from "@/components/brand/lunchbox-icon";
import { getKitchenAccess } from "@/features/kitchen/access";
import { FirstWeek } from "@/features/kitchen/components/first-week";
import { MissingForMeal } from "@/features/kitchen/components/missing-for-meal";
import { TodayViewed } from "@/features/kitchen/components/today-viewed";
import {
  daysBetween,
  localDay,
  longDayLabel,
  weekdayName,
  weekStart,
} from "@/features/kitchen/dates";
import { getRecipeChoices, hasAnyMeal } from "@/features/kitchen/repository";
import { STARTER_RECIPES } from "@/features/kitchen/starter-recipes";
import { getTodayData, type TodayMeal } from "@/features/kitchen/today";
import { recipePhoto } from "@/features/recipes/photos";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Hoje | Cozya" };

const SLOT = { lunch: "Almoço", dinner: "Jantar" } as const;
const VERDICT = { again: "faria de novo", tweak: "com ajustes", skip: "não repetiria" } as const;
/** The meal the cooking mode is for: "terça à noite". */
const MEAL_PARAM = { lunch: "almoco", dinner: "jantar" } as const;

function MealTags({ meal }: { meal: TodayMeal }) {
  if (!meal.recipeId) return null;
  const table = meal.servings - meal.lunchboxServings;
  return (
    <div className="flex flex-wrap gap-2">
      {meal.totalMinutes ? (
        <span className="inline-flex min-h-8 items-center rounded-full bg-muted px-3 text-sm font-bold">
          {meal.totalMinutes} min
        </span>
      ) : null}
      {table > 0 && (
        <span className="inline-flex min-h-8 items-center rounded-full bg-muted px-3 text-sm font-bold">
          {table} na mesa
        </span>
      )}
      {meal.lunchboxServings > 0 && (
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-peach px-3 text-sm font-bold text-peach-ink">
          <LunchboxIcon className="size-4" />+ {meal.lunchboxServings}{" "}
          {meal.lunchboxServings === 1 ? "marmita" : "marmitas"}
        </span>
      )}
    </div>
  );
}

/** A planned meal, or the lunchbox set aside at a dinner: "pronta hoje" seen from today. */
function MealRow({ meal, lunchboxTag }: { meal: TodayMeal; lunchboxTag: string }) {
  return (
    <li className="flex min-h-14 items-center gap-3 border-t border-border py-3">
      <span className="w-16 shrink-0 text-sm font-bold text-muted-foreground">
        {SLOT[meal.slot]}
      </span>
      <span className="min-w-0 flex-1 font-bold leading-snug">{meal.label}</span>
      {meal.kind === "lunchbox" ? (
        <span className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full bg-peach px-2.5 text-xs font-bold text-peach-ink">
          <LunchboxIcon className="size-3.5" />
          {lunchboxTag}
        </span>
      ) : meal.recipeId ? (
        <span className="shrink-0 text-sm font-bold text-muted-foreground">
          {meal.servings - meal.lunchboxServings}
          {meal.lunchboxServings ? ` + ${meal.lunchboxServings}` : ""}
        </span>
      ) : null}
    </li>
  );
}

export default async function TodayPage() {
  const user = await requireUserServer();
  const [access, started] = await Promise.all([getKitchenAccess(user.id), hasAnyMeal(user.id)]);

  const trialAvailable = !access.isPro && !access.profile?.trialStartedAt;
  // Planning controls only where they lead somewhere: Pro, an active trial or a trial to start.
  const canEdit = access.canPlan || trialAvailable;

  if (!started && canEdit) {
    const own = (await getRecipeChoices(user.id)).slice(0, 6);
    return (
      <main className="mx-auto w-full max-w-[1200px] px-5 py-5 md:px-10 md:py-12">
        <FirstWeek
          own={own.map((recipe) => ({
            key: `own:${recipe.id}`,
            id: recipe.id,
            name: recipe.name,
            servings: recipe.servings,
            photo: recipePhoto(recipe),
          }))}
          starters={STARTER_RECIPES.filter(
            (starter) => !own.some((recipe) => recipe.name === starter.name),
          ).map((starter) => ({
            key: `starter:${starter.name}`,
            index: STARTER_RECIPES.indexOf(starter),
            name: starter.name,
            servings: starter.servings ?? null,
            photo: recipePhoto(starter),
          }))}
          trialPending={trialAvailable}
        />
      </main>
    );
  }

  const data = await getTodayData(user.id);
  // Calendar days in São Paulo: on the last day the trial ends "hoje", not "amanhã".
  const trialDaysLeft =
    access.trialActive && access.trialEndsAt ? daysBetween(new Date(), access.trialEndsAt) : null;
  const trialEnded = !access.isPro && !access.trialActive && !!access.profile?.trialStartedAt;
  const hero = data.hero;
  const others = data.todayMeals.filter(
    (meal) => meal !== hero && meal !== data.evening && !(meal.slot === "dinner" && data.evening),
  );
  const next = data.next;
  const editHref = (meal: { day: string; slot: string }) =>
    `/semana?week=${data.week}&editar=${meal.day}:${meal.slot}`;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-5 py-5 md:px-10 md:py-10">
      <TodayViewed />
      <div className="grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-12">
        <div className="space-y-6">
          <p className="text-[15px] font-bold text-muted-foreground">{longDayLabel(localDay())}</p>

          {data.evening && (
            <section
              aria-label="O que teve hoje"
              className="space-y-3 rounded-[20px] bg-card p-5 ring-1 ring-border"
            >
              <p className="flex items-center gap-2.5 text-[13px] font-extrabold uppercase tracking-[0.12em] text-sage-ink">
                <span className="flex size-7 items-center justify-center rounded-full bg-sage text-white dark:text-background">
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                </span>
                Hoje teve
              </p>
              {/* Without a next meal, what was cooked tonight is the title of the page. */}
              {next ? (
                <p className="text-[26px] font-extrabold leading-tight tracking-display">
                  {data.evening.label}
                </p>
              ) : (
                <h1 className="text-[26px] font-extrabold leading-tight tracking-display">
                  {data.evening.label}
                </h1>
              )}
              <p className="text-sm text-muted-foreground">
                Cozinhado às {data.evening.cookedTime}
                {data.evening.verdict ? ` · ${VERDICT[data.evening.verdict]}` : ""}
              </p>
              {data.evening.lunchboxServings > 0 && (
                <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-peach px-3 text-sm font-bold text-peach-ink">
                  <LunchboxIcon className="size-4" />
                  {data.evening.lunchboxServings}{" "}
                  {data.evening.lunchboxServings === 1 ? "marmita" : "marmitas"} para amanhã
                </span>
              )}
            </section>
          )}

          {next ? (
            <section aria-labelledby="hoje-titulo" className="space-y-4">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-brand-ink">
                {data.evening ? "Amanhã tem" : "Hoje tem"} · {SLOT[next.slot]}
              </p>
              <h1
                id="hoje-titulo"
                className="text-[44px] font-extrabold leading-[0.98] tracking-display md:text-6xl"
              >
                {next.label}
              </h1>
              <MealTags meal={next} />
              {next.note && (
                <div className="space-y-1 rounded-2xl bg-card p-4 ring-1 ring-border">
                  <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
                    Sua nota da última vez
                  </p>
                  <p className="text-base leading-snug">“{next.note}”</p>
                </div>
              )}
              {!next.recipeId && (
                <p className="text-sm text-muted-foreground">
                  Sem receita: não entra na lista do mercado.
                </p>
              )}
              {next.recipeId && !data.evening && (
                <Button asChild className="h-14 w-full rounded-2xl text-[17px] font-extrabold">
                  <Link
                    href={`/receitas/${next.recipeId}/cozinhar?porcoes=${next.servings}&marmitas=${next.lunchboxServings}&refeicao=${MEAL_PARAM[next.slot]}`}
                  >
                    Começar a cozinhar
                    <ArrowRight className="size-5" aria-hidden />
                  </Link>
                </Button>
              )}
              <div
                className={cn(
                  "grid gap-2.5",
                  canEdit && next.recipeId && !data.evening ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                {canEdit && (
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-12 rounded-2xl text-[15px] font-bold"
                  >
                    <Link href={editHref(next)}>Trocar</Link>
                  </Button>
                )}
                {next.recipeId && !data.evening && (
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-12 rounded-2xl text-[15px] font-bold"
                  >
                    <Link
                      href={`/receitas/${next.recipeId}/cozinhar?porcoes=${next.servings}&marmitas=${next.lunchboxServings}&refeicao=${MEAL_PARAM[next.slot]}&etapa=fim`}
                    >
                      Já cozinhei
                    </Link>
                  </Button>
                )}
              </div>
            </section>
          ) : (
            !data.evening && (
              <section aria-labelledby="hoje-titulo" className="space-y-4">
                <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-brand-ink">
                  Hoje
                </p>
                <h1
                  id="hoje-titulo"
                  className="text-4xl font-extrabold leading-[1.02] tracking-display md:text-5xl"
                >
                  {data.todayMeals.length
                    ? "O jantar de hoje ainda está em aberto."
                    : "Hoje ainda não tem nada planejado."}
                </h1>
                {canEdit ? (
                  <>
                    <p className="text-muted-foreground">
                      Escolha uma receita ou marque como sobras, comer fora ou pedir comida.
                    </p>
                    <Button asChild className="h-14 w-full rounded-2xl text-[17px] font-extrabold">
                      <Link href={`/semana?week=${data.week}&editar=${data.today}:dinner`}>
                        Planejar o jantar de hoje
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      Suas receitas e o modo cozinha continuam aqui, sem limite de uso.
                    </p>
                    <Button asChild className="h-14 w-full rounded-2xl text-[17px] font-extrabold">
                      <Link href="/receitas">Ver suas receitas</Link>
                    </Button>
                  </>
                )}
              </section>
            )
          )}

          {data.missing.length > 0 && next && (
            <MissingForMeal
              when={`o ${SLOT[next.slot].toLowerCase()} de ${data.evening ? "amanhã" : "hoje"}`}
              phrase={data.missingPhrase}
              items={data.missing}
              week={data.week}
            />
          )}
          {data.allAtHome && next && (
            <p
              role="status"
              className="flex items-center gap-3 rounded-[18px] bg-sage-soft p-4 font-bold text-sage-ink"
            >
              <Check className="size-[22px] shrink-0" strokeWidth={2.6} aria-hidden />
              Tudo em casa para o {SLOT[next.slot].toLowerCase()} de{" "}
              {data.evening ? "amanhã" : "hoje"}.
            </p>
          )}

          {others.length > 0 && (
            <section aria-labelledby="tambem-hoje">
              <h2
                id="tambem-hoje"
                className="mb-1 text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground"
              >
                Também hoje
              </h2>
              <ul>
                {others.map((meal) => (
                  <MealRow key={`${meal.slot}:${meal.kind}`} meal={meal} lunchboxTag="de ontem" />
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-8" aria-label="A semana">
          {trialDaysLeft !== null && trialDaysLeft <= 3 && (
            <div className="space-y-2 rounded-2xl bg-muted p-4">
              <p className="font-bold">
                Seu teste termina{" "}
                {trialDaysLeft <= 0
                  ? "hoje"
                  : trialDaysLeft === 1
                    ? "amanhã"
                    : `em ${trialDaysLeft} dias`}
                .
              </p>
              <p className="text-sm text-muted-foreground">
                Suas receitas e listas continuam. Para seguir planejando, veja o Pro.
              </p>
              <Link
                href="/upgrade"
                className="inline-flex min-h-11 items-center font-bold underline underline-offset-4"
              >
                Ver o que muda
              </Link>
            </div>
          )}
          {trialEnded && (
            <div className="space-y-2 rounded-2xl bg-muted p-4">
              <p className="font-bold">Novas semanas ficam no Pro.</p>
              <p className="text-sm text-muted-foreground">
                Receitas, modo cozinha e as listas que você montou continuam aqui.
              </p>
              <Link
                href="/upgrade"
                className="inline-flex min-h-11 items-center font-bold underline underline-offset-4"
              >
                Conhecer o Pro
              </Link>
            </div>
          )}

          <section aria-labelledby="amanha">
            <h2
              id="amanha"
              className="mb-1 text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground"
            >
              {data.evening ? "Depois" : `Amanhã, ${weekdayName(data.tomorrow)}`}
            </h2>
            {data.tomorrowMeals.length > 0 ? (
              <ul>
                {data.tomorrowMeals
                  .filter((meal) => meal !== next)
                  .map((meal) => (
                    <MealRow
                      key={`${meal.slot}:${meal.kind}`}
                      meal={meal}
                      lunchboxTag="pronta hoje"
                    />
                  ))}
              </ul>
            ) : (
              <p className="border-t border-border py-3 text-sm text-muted-foreground">
                Nada planejado ainda.{" "}
                {canEdit && (
                  <Link
                    href={`/semana?week=${data.week}&editar=${data.tomorrow}:dinner`}
                    className="font-bold text-foreground underline underline-offset-4"
                  >
                    Planejar amanhã
                  </Link>
                )}
              </p>
            )}
          </section>

          <section aria-labelledby="semana-mini" className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2
                id="semana-mini"
                className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground"
              >
                Esta semana
              </h2>
              <Link
                href={`/semana?week=${data.week}`}
                className="text-sm font-bold underline-offset-4 hover:underline"
              >
                Ver semana
              </Link>
            </div>
            <ol className="grid grid-cols-7 gap-1.5 text-center">
              {data.weekDays.map((dot) => (
                <li key={dot.day} className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "text-xs font-bold",
                      dot.isToday ? "text-brand-ink" : "text-muted-foreground",
                    )}
                  >
                    {dot.short.charAt(0)}
                  </span>
                  <span className="sr-only">
                    {`${weekdayName(dot.day)}${dot.isToday ? ", hoje" : ""}: ${
                      dot.state === "no-recipe"
                        ? "sem receita"
                        : dot.planned
                          ? "planejado"
                          : "sem plano"
                    }`}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-[38px] items-center justify-center rounded-full text-[13px] font-bold",
                      dot.state === "today" && "bg-primary text-primary-foreground",
                      dot.state === "past" && "bg-sage-soft text-sage-ink",
                      dot.state === "past-empty" && "bg-muted text-muted-foreground",
                      dot.state === "planned" && "bg-card ring-1 ring-border",
                      dot.state === "no-recipe" && "bg-muted text-muted-foreground",
                      dot.state === "free" &&
                        "border-[1.5px] border-dashed border-input text-muted-foreground",
                    )}
                  >
                    {dot.state === "past" ? (
                      <Check className="size-4" strokeWidth={3} aria-hidden />
                    ) : (
                      Number(dot.day.slice(8))
                    )}
                  </span>
                </li>
              ))}
            </ol>
            {data.weekPhrase && (
              <p className="text-sm leading-normal text-muted-foreground">
                {data.weekPhrase}
                {canEdit && data.firstOpenDay && (
                  <>
                    {" "}
                    <Link
                      href={`/semana?week=${data.week}&editar=${data.firstOpenDay}:dinner`}
                      className="font-bold text-foreground underline underline-offset-4"
                    >
                      Planejar {weekdayName(data.firstOpenDay)}
                    </Link>
                  </>
                )}
              </p>
            )}
          </section>

          <Link
            href={`/compras?week=${data.week}`}
            className="flex items-center gap-3.5 rounded-[18px] bg-card p-4 ring-1 ring-border outline-none hover:ring-input focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
              <ShoppingBasket className="size-[22px]" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-bold">Lista do mercado</span>
              <span className="text-sm text-muted-foreground">
                {!data.list
                  ? "Ainda não montada para esta semana"
                  : data.list.stale
                    ? "A semana mudou. Atualize a lista"
                    : data.list.todo === 0
                      ? "Tudo em casa"
                      : `${data.list.total - data.list.todo} de ${data.list.total} em casa${
                          data.missing.length && next && weekStart(next.day) === data.week
                            ? ` · ${data.missing.length === 1 ? "falta" : "faltam"} ${data.missingPhrase}`
                            : ""
                        }`}
              </span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Link>
        </aside>
      </div>
    </main>
  );
}
