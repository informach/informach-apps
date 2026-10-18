import { formatNumber, formatSigned } from "@/lib/format";
import { barHeights, type SeriesPoint, seriesDescription } from "../logic";

type Accounts = { total: number; new7: number; signedIn7: number; multiProduct: number };

function NightStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="grid">
      <strong className="tabular font-mono text-[32px] leading-tight font-semibold">{value}</strong>
      <span className="text-[13px] text-night-muted">{label}</span>
    </span>
  );
}

/** "Contas Informach": uma conta vale para todos os apps. */
export function AccountsPanel({
  accounts,
  signups,
}: {
  accounts: Accounts;
  signups: SeriesPoint[];
}) {
  const heights = barHeights(signups);
  const today = signups.length - 1;
  return (
    <section
      aria-labelledby="contas"
      className="on-night grid min-w-0 flex-[1_1_360px] content-start gap-4 rounded-[18px] bg-night p-5 text-night-ink"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="contas" className="m-0 text-lg font-extrabold">
          Contas Informach
        </h2>
        <span className="text-[13px] text-night-muted">uma conta vale para todos os apps</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NightStat value={formatNumber(accounts.total)} label="contas no total" />
        <NightStat value={formatSigned(accounts.new7)} label="novas nos últimos 7 dias" />
        <NightStat value={formatNumber(accounts.signedIn7)} label="entraram nos últimos 7 dias" />
        <NightStat value={formatNumber(accounts.multiProduct)} label="usam dois produtos ou mais" />
      </div>
      <div className="grid gap-2">
        <span className="text-[13px] text-night-muted">Novas contas por dia</span>
        <div
          role="img"
          aria-label={seriesDescription("Novas contas por dia", signups)}
          className="grid h-[84px] grid-cols-7 items-end gap-2"
        >
          {signups.map((point, index) => (
            <span
              key={point.day}
              title={`${point.label}: ${point.count}`}
              className={`rounded-t-md rounded-b-[2px] ${index === today ? "bg-sphere-light" : "bg-sphere"}`}
              style={{ height: `${heights[index]}%` }}
            />
          ))}
        </div>
        <div
          aria-hidden="true"
          className="grid grid-cols-7 gap-2 text-center text-xs text-night-muted"
        >
          {signups.map((point) => (
            <span key={point.day}>{point.label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
