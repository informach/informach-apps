import type { Metadata } from "next";
import { AccountsPanel } from "@/features/overview/components/accounts-panel";
import { AiWeek } from "@/features/overview/components/ai-week";
import { AttentionList } from "@/features/overview/components/attention-list";
import { AutoRefresh } from "@/features/overview/components/auto-refresh";
import { ProductCards } from "@/features/overview/components/product-cards";
import { SearchBox } from "@/features/overview/components/search-box";
import { ServicesNow } from "@/features/overview/components/services-now";
import { getOverview } from "@/features/overview/service";
import { firstName, requireStaff } from "@/lib/access";
import { formatTime, formatWeekday, greeting } from "@/lib/format";

export const metadata: Metadata = { title: "Painel" };

export default async function PainelPage() {
  const staff = await requireStaff();
  const overview = await getOverview(staff);

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox />
        <span className="inline-flex min-h-8 items-center rounded-full bg-info-wash px-3 text-[13px] font-bold text-info">
          {process.env.NODE_ENV === "production" ? "Produção" : "Desenvolvimento"}
        </span>
      </div>

      <header className="grid gap-1.5">
        <h1 className="m-0 text-[clamp(26px,3vw,40px)] leading-[1.1] font-extrabold tracking-[-0.025em]">
          {greeting(overview.now)}, {firstName(staff)}. {overview.headline}
        </h1>
        <p className="m-0 text-ink-muted">
          {formatWeekday(overview.now)} · atualizado às {formatTime(overview.now)} · a página
          confere os serviços a cada minuto
        </p>
      </header>

      <ServicesNow services={overview.services} />

      <div className="flex flex-wrap items-start gap-5">
        <AttentionList items={overview.attention} />
        <AccountsPanel accounts={overview.accounts} signups={overview.signups} />
      </div>

      <ProductCards cards={overview.products} />

      <AiWeek ai={overview.ai} />
    </>
  );
}
