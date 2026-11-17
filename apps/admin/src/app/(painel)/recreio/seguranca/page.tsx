import { AuditPersistenceError } from "@informach/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { z } from "zod";
import { Empty, PageHeader } from "@/components/blocks";
import { ComandoDeSeguranca } from "@/features/recreio-moderacao/components/comando";
import { consultarFilaDeSeguranca } from "@/features/recreio-moderacao/service";
import { requireStaff } from "@/lib/access";
import { getEnv } from "@/lib/env";
import { needsConfirmation } from "@/lib/fetch-site";
import { cameFromSignInNext } from "@/lib/safe-next";

export const metadata = { title: "Segurança do Recreio" };
const data = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const NOMES: Record<string, string> = {
  contato_indesejado: "Contato indesejado",
  assedio: "Assédio",
  conteudo_inadequado: "Conteúdo inadequado",
  dados_pessoais: "Dados pessoais",
  ameaca: "Ameaça",
  outro: "Outro motivo",
  aberta: "Aberta",
  em_analise: "Em análise",
  resolvida: "Resolvida",
  recurso: "Recurso recebido",
  encerrada: "Encerrada",
  aberto: "Aguardando análise",
  resolvido: "Respondido",
  manter: "Manter a suspensão",
  reativar: "Reativar perfil",
  risco_confirmado: "Risco confirmado",
  medida_preventiva: "Medida preventiva",
  recurso_procedente: "Recurso procedente",
  correcao_operacional: "Correção operacional",
  legado_sem_recibo: "Suspensão anterior sem recibo de imposição",
  sem_elementos: "Sem elementos suficientes",
  medida_aplicada: "Medida aplicada",
  duplicada: "Denúncia duplicada",
  pedido: "Pedido de amizade registrado",
  amizade: "Amizade registrada",
  protecao: "Proteção de contato registrada",
  mundo: "Participação no mesmo mundo registrada",
};

export default async function SegurancaDoRecreio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff(),
    busca = await searchParams,
    env = getEnv();
  if (env.ADMIN_RECREIO_ENABLED !== "1")
    return (
      <>
        <PageHeader title="Segurança do Recreio" />
        <Empty>O Recreio ainda não foi habilitado neste console.</Empty>
      </>
    );
  const protocolo = z.uuid().optional().safeParse(busca.protocolo);
  if (!protocolo.success)
    return (
      <>
        <PageHeader title="Confira o protocolo" />
        <Empty>Use o protocolo completo recebido no Recreio.</Empty>
        <Link href="/recreio/seguranca" prefetch={false}>
          Voltar à fila
        </Link>
      </>
    );
  const destino = protocolo.data
    ? (`/recreio/seguranca?protocolo=${protocolo.data}` as const)
    : "/recreio/seguranca";
  if (cameFromSignInNext(busca) || needsConfirmation((await headers()).get("sec-fetch-site")))
    return (
      <>
        <PageHeader
          title="Abrir a fila de segurança?"
          description="A consulta fica registrada na auditoria em seu nome."
        />
        <Link
          href={destino}
          prefetch={false}
          className="inline-flex min-h-11 w-fit items-center rounded-xl bg-night px-4 font-bold text-white"
        >
          Confirmar abertura da fila
        </Link>
      </>
    );
  let fila: Awaited<ReturnType<typeof consultarFilaDeSeguranca>>;
  try {
    fila = await consultarFilaDeSeguranca(staff, protocolo.data);
  } catch (erro) {
    if (!(erro instanceof AuditPersistenceError)) throw erro;
    return (
      <>
        <PageHeader title="A fila não abriu" />
        <Empty>
          A auditoria não confirmou a consulta. Sem registro, os casos não aparecem. Tente novamente
          em instantes.
        </Empty>
      </>
    );
  }
  const habilitado = !!env.RECREIO_MODERATION_SECRET;
  return (
    <>
      <PageHeader
        title="Segurança do Recreio"
        description="Denúncias e pedidos de revisão. Somente protocolos, categorias e estado operacional; cada consulta e ação deixa rastro."
      />
      <form action="/recreio/seguranca" className="flex max-w-2xl flex-wrap items-end gap-3">
        <label htmlFor="protocolo-seguranca" className="min-w-0 flex-1 text-sm font-bold">
          Buscar protocolo completo
          <input
            id="protocolo-seguranca"
            name="protocolo"
            required
            maxLength={36}
            defaultValue={protocolo.data ?? ""}
            className="mt-1 min-h-11 w-full rounded-xl border border-line-warm bg-surface px-3 font-mono text-sm"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-night px-4 font-bold text-white">
          Consultar
        </button>
        <a
          href="/recreio/seguranca"
          className="inline-flex min-h-11 items-center font-bold text-sphere-strong underline"
        >
          Fila atual
        </a>
      </form>
      <p className="max-w-3xl text-sm text-ink-muted">
        Denunciar não suspende ninguém automaticamente. Prioridade tem prazo de 24 horas; os demais
        casos, 72 horas. Recursos de suspensão têm 24 horas. Não use nomes ou conteúdo de mundos
        para avaliar por esta tela.
      </p>
      {!habilitado && (
        <Empty>
          A leitura está disponível. A credencial exclusiva de comandos ainda não foi configurada;
          nenhuma medida pode ser enviada.
        </Empty>
      )}
      <section className="grid max-w-4xl gap-4" aria-labelledby="recursos-proprios">
        <h2 id="recursos-proprios" className="text-2xl font-extrabold">
          Recursos de suspensão
        </h2>
        {fila.recursos.length === 0 && <Empty>Nenhum recurso disponível nesta consulta.</Empty>}
        {fila.recursos.map((r) => (
          <article
            key={`${r.protocolo}:${r.revisao}`}
            className="min-w-0 rounded-2xl border border-line-warm bg-surface p-5"
          >
            <h3 className="text-lg font-bold">{NOMES[r.situacao]}</h3>
            <p className="mt-2 break-all font-mono text-sm">{r.protocolo}</p>
            <p className="mt-2 text-sm text-ink-muted">
              Recebido em {data.format(r.criadoEm)} (Brasília), revisão {r.revisao}.
            </p>
            <p className="mt-2 break-all text-sm">
              Referência do perfil: <span className="font-mono">{r.perfilId}</span>
            </p>
            <p className="mt-2 text-sm">
              Restrição registrada:{" "}
              {r.motivoDaRestricao ? NOMES[r.motivoDaRestricao] : "referência não disponível"}.
            </p>
            {r.decisao && <p className="mt-2 font-semibold">Decisão: {NOMES[r.decisao]}.</p>}
            <ComandoDeSeguranca
              habilitado={habilitado}
              caso={{
                tipo: "recurso",
                protocolo: r.protocolo,
                revisao: r.revisao,
                situacao: r.situacao,
                perfilId: r.perfilId,
                estadoDoPerfil: r.estadoDoPerfil,
                versaoDoPerfil: r.versaoDoPerfil,
                ...(r.restricaoAtual === r.versaoDaRestricao
                  ? { versaoDaRestricao: r.versaoDaRestricao }
                  : {}),
              }}
            />
          </article>
        ))}
        {fila.maisRecursos && (
          <p className="text-sm text-ink-muted">
            Mostrando os vinte recursos mais antigos. Conclua os atendimentos e atualize a fila, ou
            consulte um protocolo completo.
          </p>
        )}
      </section>
      <section className="grid max-w-4xl gap-4" aria-labelledby="denuncias-seguranca">
        <h2 id="denuncias-seguranca" className="text-2xl font-extrabold">
          Denúncias
        </h2>
        {fila.denuncias.length === 0 && <Empty>Nenhuma denúncia disponível nesta consulta.</Empty>}
        {fila.denuncias.map((r) => (
          <article
            key={`${r.protocolo}:${r.revisao}`}
            className="min-w-0 rounded-2xl border border-line-warm bg-surface p-5"
          >
            <h3 className="text-lg font-bold">
              {NOMES[r.categoria]} · {r.prioridade ? "Prioritária" : "Regular"}
            </h3>
            <p className="mt-2 break-all font-mono text-sm">{r.protocolo}</p>
            <p className="mt-2 text-sm text-ink-muted">
              {NOMES[r.situacao]}, revisão {r.revisao}. Recebida em {data.format(r.criadoEm)}{" "}
              (Brasília).
            </p>
            {r.recursoEm && (
              <p className="mt-1 text-sm text-ink-muted">
                Recurso recebido em {data.format(r.recursoEm)} (Brasília).
              </p>
            )}
            <p className="mt-2 text-sm">
              Fato do servidor: {NOMES[r.evidencia]}. A referência não comprova a conduta relatada.
            </p>
            {r.perfilAlvoId && (
              <p className="mt-2 break-all text-sm">
                Referência do perfil alvo: <span className="font-mono">{r.perfilAlvoId}</span>
              </p>
            )}
            {r.decisao && <p className="mt-2 font-semibold">Decisão: {NOMES[r.decisao]}.</p>}
            <ComandoDeSeguranca
              habilitado={habilitado}
              caso={{
                tipo: "denuncia",
                protocolo: r.protocolo,
                revisao: r.revisao,
                situacao: r.situacao,
                perfilId: r.perfilAlvoId,
                estadoDoPerfil: r.estadoDoPerfil,
                versaoDoPerfil: r.versaoDoPerfil,
                ...(r.amizadeAtual === "active" && r.revisaoAtualDaAmizade
                  ? { revisaoDaAmizade: r.revisaoAtualDaAmizade }
                  : {}),
              }}
            />
          </article>
        ))}
        {fila.maisDenuncias && (
          <p className="text-sm text-ink-muted">
            Mostrando vinte casos, com prioridade e os mais antigos primeiro. Conclua os
            atendimentos e atualize a fila, ou consulte um protocolo completo.
          </p>
        )}
      </section>
    </>
  );
}
