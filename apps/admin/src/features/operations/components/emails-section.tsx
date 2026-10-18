import { Empty, Mono, Note, Panel, SectionTitle, Stat } from "@/components/blocks";
import { formatNumber } from "@/lib/format";
import type { EmailSummary } from "../service";

export function EmailsSection({ emails }: { emails: EmailSummary }) {
  const day = emails.day;
  const sent = day.sent + day.delivered;
  const total = sent + day.retrying + day.lost + day.skipped;
  return (
    <Panel labelledBy="emails">
      <SectionTitle id="emails" aside="via SendGrid">
        E-mails nas últimas 24 horas
      </SectionTitle>
      {total === 0 ? (
        <Empty>Nenhum e-mail nas últimas 24 horas.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat value={formatNumber(sent)} label="enviados" />
          <Stat value={formatNumber(day.retrying)} label="tentando de novo" />
          <Stat value={formatNumber(day.lost)} label="não chegaram" />
          <Stat
            value={formatNumber(day.skipped)}
            label="não enviados, por bloqueio ou descadastro"
          />
        </div>
      )}
      {emails.categories.length ? (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">E-mails por tipo, em 24 horas e em 7 dias</caption>
          <thead>
            <tr className="text-left text-[13px] text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-bold">
                Tipo
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-bold">
                24 horas
              </th>
              <th scope="col" className="py-2 text-right font-bold">
                7 dias
              </th>
            </tr>
          </thead>
          <tbody>
            {emails.categories.map((row) => (
              <tr key={row.label} className="border-t border-line-soft">
                <th scope="row" className="py-2 pr-3 text-left font-semibold">
                  {row.label}
                </th>
                <td className="py-2 pr-3 text-right">
                  <Mono>{formatNumber(row.day)}</Mono>
                </td>
                <td className="py-2 text-right">
                  <Mono>{formatNumber(row.week)}</Mono>
                  {row.weekLost ? (
                    <span className="block text-[12px] text-bad">
                      {row.weekLost === 1
                        ? "1 não chegou"
                        : `${formatNumber(row.weekLost)} não chegaram`}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <Note>Só tipo e situação. Assunto, texto e destinatário ficam fora da lista.</Note>
    </Panel>
  );
}
