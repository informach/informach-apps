import { canCreateCustomRewards, canUseGoalPhoto } from "@/features/acesso/policy";
import { parentPage } from "@/features/familia/view";
import { CofrinhoDaCrianca, LojaDaFamilia } from "@/features/loja/components/cofrinho-pais";
import { parentPiggy } from "@/features/pais/dados";

export const metadata = { title: "Cofrinho" };

export default async function Cofrinho() {
  const ctx = await parentPage();
  const dados = await parentPiggy(ctx.actor, ctx.children);
  const taxa = ctx.family?.starsPerReal ?? 10;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">COFRINHO</p>
        <h1 className="font-display text-3xl font-extrabold leading-tight">
          Estrelas, metas e loja
        </h1>
        <p className="mt-1 text-sm font-bold text-tinta-suave">
          {taxa} estrelas valem R$ 1,00. Mude a taxa em Ajustes.
        </p>
      </header>
      {dados.criancas.map((c) => (
        <CofrinhoDaCrianca
          key={c.id}
          c={c}
          starsPerReal={taxa}
          podeFoto={canUseGoalPhoto(ctx.access)}
        />
      ))}
      <LojaDaFamilia
        podeGerenciar={ctx.mode === "adult" && ctx.role === "administrator"}
        itens={dados.rewards.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          icon: r.icon,
          priceStars: r.priceStars,
          moneyCents: r.moneyCents,
        }))}
        starsPerReal={taxa}
        podeItensProprios={canCreateCustomRewards(ctx.access)}
      />
    </div>
  );
}
