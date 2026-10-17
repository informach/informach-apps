import { ArrowLeft, ExternalLink, Eye, EyeOff } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Empty, Mono, Note, Panel, SectionTitle } from "@/components/blocks";
import { ProductMark } from "@/components/product-mark";
import { StatusPill } from "@/components/status";
import { firstName, type Staff } from "@/lib/access";
import {
  formatDate,
  formatDateTime,
  formatDay,
  formatNumber,
  formatRelative,
  formatTime,
} from "@/lib/format";
import { stripeLinks } from "@/lib/links";
import { PRODUCTS } from "@/lib/products";
import { isStaffRole } from "@/lib/roles";
import type { Ficha } from "../loaders";
import { CopyId } from "./copy-id";
import { EdiComputers } from "./edi-computers";
import { PersonActions } from "./person-actions";

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || email.slice(0, 2)).toUpperCase();
}

function credits(balance: NonNullable<Ficha["products"][number]["credits"]>) {
  const parts = [
    `${formatNumber(balance.available)} ${balance.available === 1 ? "crédito disponível" : "créditos disponíveis"}`,
  ];
  if (balance.reserved > 0) parts.push(`${formatNumber(balance.reserved)} reservados agora`);
  if (balance.expiringSoon.amount > 0 && balance.expiringSoon.firstExpiresAt)
    parts.push(
      `${formatNumber(balance.expiringSoon.amount)} vencem em ${formatDay(balance.expiringSoon.firstExpiresAt)}`,
    );
  return parts.join(" · ");
}

export function FichaView({ ficha, staff }: { ficha: Ficha; staff: Staff }) {
  const { person } = ficha;
  const now = new Date();
  const name = person.name.trim() || "Sem nome";
  const personFirst = firstName({ name: person.name, email: person.email });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/pessoas"
          className="inline-flex min-h-11 items-center gap-2 font-bold text-ink no-underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Pessoas
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full bg-info-wash px-3 py-1.5 text-[13px] font-semibold text-info">
          <Eye aria-hidden="true" className="size-4" />
          Esta consulta entrou na auditoria às {formatTime(ficha.viewRecordedAt)}, em nome de{" "}
          {firstName(staff)}
        </span>
      </div>

      <Panel labelledBy="pessoa" className="gap-5">
        <div className="flex flex-wrap items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-full bg-night text-lg font-extrabold text-white"
          >
            {initials(person.name, person.email)}
          </span>
          <div className="grid min-w-0 flex-1 gap-2">
            <h1
              id="pessoa"
              className="m-0 text-[clamp(26px,3vw,34px)] leading-tight font-extrabold tracking-[-0.02em]"
            >
              {name}
            </h1>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-soft">
              <span className="break-all">{person.email}</span>
              <span className="inline-flex items-center gap-0.5">
                <Mono className="text-ink-muted">ID {person.id}</Mono>
                <CopyId id={person.id} />
              </span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              <StatusPill tone={person.emailVerified ? "ok" : "warn"}>
                {person.emailVerified ? "E-mail confirmado" : "E-mail não confirmado"}
              </StatusPill>
              {person.banActive ? (
                <StatusPill tone="bad">
                  {person.banExpiresAt
                    ? `Banida até ${formatDay(person.banExpiresAt)}`
                    : "Banida, sem data"}
                </StatusPill>
              ) : null}
              <StatusPill tone={person.twoFactorEnabled ? "ok" : "muted"}>
                {person.twoFactorEnabled ? "Duas etapas ligadas" : "Duas etapas desligadas"}
              </StatusPill>
              <StatusPill tone={isStaffRole(person.role) ? "info" : "muted"}>
                Papel: {person.role}
              </StatusPill>
            </span>
            <span className="text-sm text-ink-muted">
              Conta desde {formatDate(person.createdAt)} · última entrada{" "}
              {person.lastSignInAt ? formatRelative(person.lastSignInAt, now) : "sem registro"}
            </span>
            {person.banActive && person.banReason ? (
              <span className="text-sm text-ink-soft">Motivo do banimento: {person.banReason}</span>
            ) : null}
          </div>
        </div>
        <PersonActions
          person={{
            id: person.id,
            firstName: personFirst,
            emailVerified: person.emailVerified,
            banActive: person.banActive,
            role: person.role,
            isSelf: person.id === staff.id,
            isStaffTarget: isStaffRole(person.role),
          }}
          staff={{ role: staff.role, firstName: firstName(staff) }}
          verificationProducts={ficha.verificationProducts.map((key) => ({
            key,
            name: PRODUCTS[key].name,
          }))}
          verificationProductsDetected={ficha.verificationProductsDetected}
          hasEdiComputer={ficha.edi.some((computer) => computer.connected)}
          activeSubscriptionNames={ficha.activeSubscriptionProducts.map(
            (key) => PRODUCTS[key].name,
          )}
        />
      </Panel>

      <section aria-labelledby="nos-produtos" className="grid gap-3">
        <SectionTitle id="nos-produtos">Nos produtos</SectionTitle>
        {ficha.products.length ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
            {ficha.products.map((entry) => (
              <article
                key={entry.product}
                aria-labelledby={`produto-${entry.product}`}
                className="grid content-start gap-2.5 rounded-2xl border border-line-warm bg-surface p-4"
              >
                <span className="flex items-center gap-2.5">
                  <ProductMark product={entry.product} size={26} />
                  <strong id={`produto-${entry.product}`} className="text-[17px]">
                    {PRODUCTS[entry.product].name}
                  </strong>
                </span>
                <StatusPill tone={entry.tone}>{entry.planLabel}</StatusPill>
                {entry.line ? <span className="text-sm text-ink-soft">{entry.line}</span> : null}
                {entry.credits ? (
                  <span className="text-sm text-ink-soft">{credits(entry.credits)}</span>
                ) : null}
                {entry.facts.map((fact) => (
                  <span key={fact} className="text-sm text-ink-soft">
                    {fact}
                  </span>
                ))}
                {entry.notes.map((note) => (
                  <span key={note} className="text-[13px] text-ink-muted">
                    {note}
                  </span>
                ))}
                {entry.stripeCustomerId ? (
                  <a
                    href={stripeLinks.customer(entry.stripeCustomerId)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold"
                  >
                    Abrir no Stripe
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">(abre em outra aba)</span>
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <Empty>A conta existe, mas ainda não usou nenhum produto.</Empty>
        )}
      </section>

      {ficha.edi.length ? (
        <Panel labelledBy="edi">
          <SectionTitle id="edi" aside="cada conta conecta até 2 computadores">
            Computadores da Suíte Edi
          </SectionTitle>
          <EdiComputers
            userId={person.id}
            firstName={personFirst}
            staffFirstName={firstName(staff)}
            computers={ficha.edi.map((computer) => ({
              id: computer.id,
              name: computer.name,
              lastSeenLabel: formatRelative(computer.lastSeenAt, now),
              connected: computer.connected,
            }))}
          />
        </Panel>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel labelledBy="linha">
          <SectionTitle
            id="linha"
            aside={
              <Link href={`/auditoria?pessoa=${person.id}` as Route} className="font-bold text-ink">
                Ver na auditoria
              </Link>
            }
          >
            Linha do tempo
          </SectionTitle>
          {ficha.timeline.length ? (
            <ol className="m-0 grid list-none gap-0 p-0">
              {ficha.timeline.map((entry) => (
                <li
                  key={entry.id}
                  className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-t border-line-soft py-2.5 first:border-t-0"
                >
                  <time
                    dateTime={entry.at.toISOString()}
                    className="tabular pt-0.5 font-mono text-[13px] text-ink-muted"
                  >
                    {formatDateTime(entry.at)}
                  </time>
                  <span className="grid gap-0.5">
                    <strong className="text-[15px] font-semibold">{entry.title}</strong>
                    {entry.detail ? (
                      <span className="text-sm text-ink-muted">{entry.detail}</span>
                    ) : null}
                    {entry.otherPersonId ? (
                      <Link
                        prefetch={false}
                        href={`/pessoas/${entry.otherPersonId}` as Route}
                        className="text-sm font-bold"
                      >
                        Abrir a ficha da outra conta
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Nada registrado para esta conta ainda.</Empty>
          )}
          <Note>
            Os 50 registros mais recentes. Consultas da equipe aparecem em "Quem consultou".
          </Note>
        </Panel>

        <div className="grid gap-5">
          <Panel labelledBy="sessoes">
            <SectionTitle id="sessoes">Sessões abertas</SectionTitle>
            {ficha.sessions.length ? (
              <ul className="m-0 grid list-none p-0">
                {ficha.sessions.map((session) => (
                  <li
                    key={`${session.product}-${session.device}-${session.lastActiveAt?.toISOString() ?? "sem-data"}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line-soft py-2.5 text-[15px] first:border-t-0"
                  >
                    <span>
                      {session.product} · {session.device}
                    </span>
                    <span className="text-sm text-ink-muted">
                      {session.lastActiveAt
                        ? formatRelative(session.lastActiveAt, now)
                        : "sem data"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhuma sessão aberta agora.</Empty>
            )}
            {ficha.unreachableSessionApps.length ? (
              <p className="m-0 rounded-xl bg-warn-wash px-3.5 py-2.5 text-sm font-semibold text-warn">
                Não deu para ler as sessões de {ficha.unreachableSessionApps.join(", ")}: o Redis
                não respondeu ou não está configurado.
              </p>
            ) : null}
            <Note>O endereço IP não aparece. Ele fica no banco para segurança.</Note>
          </Panel>

          <Panel labelledBy="emails">
            <SectionTitle id="emails">E-mails enviados</SectionTitle>
            {ficha.emails.length ? (
              <ul className="m-0 grid list-none p-0">
                {ficha.emails.map((email) => (
                  <li
                    key={email.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2.5 text-[15px] first:border-t-0"
                  >
                    <span className="grid">
                      <span>{email.label}</span>
                      <span className="text-[13px] text-ink-muted">{formatDateTime(email.at)}</span>
                    </span>
                    <StatusPill tone={email.status.tone}>{email.status.label}</StatusPill>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhum e-mail enviado para esta conta.</Empty>
            )}
            <Note>Assunto e texto não aparecem: os e-mails levam códigos de acesso.</Note>
          </Panel>

          <Panel labelledBy="consultas">
            <SectionTitle id="consultas">Quem consultou esta ficha</SectionTitle>
            {ficha.viewers.length ? (
              <ul className="m-0 grid list-none p-0">
                {ficha.viewers.map((viewer) => (
                  <li
                    key={`${viewer.at.toISOString()}-${viewer.name}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line-soft py-2 text-[15px] first:border-t-0"
                  >
                    <span>{viewer.isMe ? `${viewer.name} (você)` : viewer.name}</span>
                    <span className="tabular font-mono text-[13px] text-ink-muted">
                      {formatDateTime(viewer.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Ninguém consultou ainda.</Empty>
            )}
          </Panel>
        </div>
      </div>

      <p className="m-0 flex items-start gap-2.5 rounded-[14px] bg-sand px-4 py-3 text-sm text-ink-soft">
        <EyeOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="text-ink">O que nunca aparece nesta ficha:</strong> receitas, recados,
          atividades, respostas e anotações, nome ou apelido das crianças, o que foi enviado à IA e
          o texto dos e-mails.
        </span>
      </p>
    </>
  );
}
