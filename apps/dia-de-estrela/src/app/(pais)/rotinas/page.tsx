import { Bell, Mic, Plus } from "lucide-react";
import Link from "next/link";
import { Estrela } from "@/components/desenhos";
import { Icone } from "@/components/icone";
import { MODELOS } from "@/domain/modelos";
import { relogioDa } from "@/domain/relogio";
import { PERIODOS, type Periodo, periodoDe, rotuloDosDias } from "@/domain/rotina";
import { parentPage } from "@/features/familia/view";
import { AplicarModelo } from "@/features/rotina/components/aplicar-modelo";
import { listTasks } from "@/features/rotina/repository";

export const metadata = { title: "Rotinas" };

const corDoPeriodo: Record<Periodo, string> = {
  manha: "bg-estrela-clara text-estrela-texto",
  tarde: "bg-ceu-claro text-ceu-escuro",
  noite: "bg-uva-clara text-uva-escura",
};

export default async function Rotinas({
  searchParams,
}: {
  searchParams: Promise<{ crianca?: string; periodo?: string }>;
}) {
  const ctx = await parentPage();
  const sp = await searchParams;
  const criancas = ctx.children;
  const crianca = criancas.find((c) => c.id === sp.crianca) ?? criancas[0];
  if (!crianca)
    return (
      <p className="cartao p-5 font-bold">
        Cadastre uma criança em{" "}
        <Link className="text-ceu-escuro underline" href="/ajustes">
          Ajustes
        </Link>{" "}
        para montar a rotina.
      </p>
    );
  const agora = relogioDa(Date.now(), ctx.family?.timezone);
  const hhmm = `${String(Math.floor(agora.minutos / 60)).padStart(2, "0")}:00`;
  const periodo: Periodo =
    sp.periodo === "manha" || sp.periodo === "tarde" || sp.periodo === "noite"
      ? sp.periodo
      : periodoDe(hhmm);
  const todas = await listTasks(ctx.ownerId, [crianca.id]);
  const tarefas = todas.filter((t) => periodoDe(t.time) === periodo);
  const contagem = (p: Periodo) => todas.filter((t) => periodoDe(t.time) === p).length;
  const link = (mudar: { crianca?: string; periodo?: string }) =>
    `/rotinas?crianca=${mudar.crianca ?? crianca.id}&periodo=${mudar.periodo ?? periodo}`;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">ROTINAS</p>
          <h1 className="font-display text-3xl font-extrabold leading-tight">
            {PERIODOS[periodo]} de {crianca.name}
          </h1>
        </div>
        {criancas.length > 1 && (
          <div className="flex gap-1.5">
            {criancas.map((c) => (
              <Link
                key={c.id}
                href={link({ crianca: c.id })}
                aria-label={c.name}
                aria-current={c.id === crianca.id ? "true" : undefined}
                className="grid size-11 place-items-center rounded-full border-[3px] font-display text-lg font-extrabold"
                style={
                  c.id === crianca.id
                    ? { background: c.color, borderColor: c.color, color: "#fff" }
                    : { borderColor: "var(--de-linha-forte)", color: c.color, background: "#fff" }
                }
              >
                {c.name.charAt(0).toUpperCase()}
              </Link>
            ))}
          </div>
        )}
      </header>

      <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-linha p-1" aria-label="Período do dia">
        {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
          <Link
            key={p}
            href={link({ periodo: p })}
            aria-current={p === periodo ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl font-extrabold ${
              p === periodo ? "bg-white shadow-[0_2px_0_var(--de-linha-forte)]" : "text-tinta-suave"
            }`}
          >
            {PERIODOS[p]}
            <span className="text-xs font-bold text-tinta-suave">{contagem(p)}</span>
          </Link>
        ))}
      </nav>

      <ul className="cartao divide-y-2 divide-linha overflow-hidden">
        {tarefas.map((t) => (
          <li key={t.id}>
            <Link href={`/rotinas/tarefa?id=${t.id}`} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-xl ${corDoPeriodo[periodo]}`}
              >
                <Icone nome={t.icon} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">{t.title}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-sm font-bold text-tinta-suave">
                  {t.time}
                  {t.steps.length > 0 && <span>· {t.steps.length} passos</span>}
                  {t.durationMin && <span>· {t.durationMin} min</span>}
                  <span>· {rotuloDosDias(t.days)}</span>
                  {t.remind && <Bell className="size-3.5" aria-label="com lembrete" />}
                  {t.hasVoice && <Mic className="size-3.5" aria-label="com voz gravada" />}
                  {t.requiresApproval && <span>· precisa do ok</span>}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-estrela-clara px-2.5 py-1 text-sm font-extrabold text-estrela-texto">
                <Estrela tamanho={14} />+{t.stars}
              </span>
            </Link>
          </li>
        ))}
        {!tarefas.length && (
          <li className="px-4 py-6 text-center font-bold text-tinta-suave">
            Nenhuma tarefa de {PERIODOS[periodo].toLowerCase()}.
          </li>
        )}
      </ul>

      <Link
        href={`/rotinas/tarefa?crianca=${crianca.id}&periodo=${periodo}`}
        className="b3 b3-ceu w-full normal-case tracking-normal"
      >
        <Plus className="size-5" aria-hidden="true" /> Adicionar tarefa
      </Link>

      <section className="mt-2">
        <h2 className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">
          MODELOS PRONTOS
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {MODELOS.map((m) => (
            <AplicarModelo
              key={m.id}
              childId={crianca.id}
              childName={crianca.name}
              templateId={m.id}
              nome={m.name}
              quantas={m.tasks.length}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
