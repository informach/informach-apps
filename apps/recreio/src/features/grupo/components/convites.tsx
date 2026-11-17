"use client";
import { Input } from "@informach/ui/components/input";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useId, useState } from "react";
import { AVATARES, NOME_DO_AVATAR } from "@/features/perfis/avatares";
import {
  aceitarAdultoAction,
  convidarAdultoAction,
  recusarAdultoAction,
  revogarAdultoAction,
} from "../convites-actions";
import { VERSAO_DA_DECLARACAO_ADULTA } from "../convites-regras";
import type { MinhaParticipacao } from "../participacao-consulta-repository";
import { ErroDaAcao, useAcaoDoGrupo } from "./acao";

const prazo = (data: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(data));

export function NovoConvite({ nomeInicial }: { nomeInicial: string }) {
  const id = useId();
  const hidratado = useHydrated();
  const acao = useAcaoDoGrupo();
  const [ciente, definirCiente] = useState(false);
  return (
    <section aria-labelledby="convidar-adulto" className="painel mt-8 p-5 sm:p-6">
      <h2 id="convidar-adulto" className="font-display text-2xl font-bold">
        Convidar um adulto
      </h2>
      <p className="mt-3 text-sm text-tinta-suave">
        O convite aparecerá na conta com este e-mail por até 72 horas. Combine o convite diretamente
        com a pessoa. Ela entra com o próprio login; vocês não precisam compartilhar códigos de
        acesso.
      </p>
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          if (!ciente) return;
          acao.executar(() =>
            convidarAdultoAction({
              email: dados.get("email"),
              identificacao: dados.get("identificacao"),
              declaroMaioridade: ciente,
              versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
            }),
          );
        }}
      >
        <fieldset disabled={!hidratado || acao.pendente} className="grid gap-4">
          <legend className="sr-only">Destinatário e sua identificação</legend>
          <label htmlFor={`${id}-email`} className="grid gap-2 font-semibold">
            E-mail do adulto
            <Input
              id={`${id}-email`}
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              className="h-12 w-full rounded-controle border-[1.5px] border-linha-forte bg-fundo text-tinta"
            />
          </label>
          <label htmlFor={`${id}-identificacao`} className="grid gap-2 font-semibold">
            Como a pessoa reconhece você
            <Input
              id={`${id}-identificacao`}
              name="identificacao"
              required
              minLength={2}
              maxLength={20}
              defaultValue={nomeInicial}
              autoComplete="off"
              className="h-12 w-full rounded-controle border-[1.5px] border-linha-forte bg-fundo text-tinta"
            />
          </label>
          <p className="text-sm text-tinta-suave">
            Este nome curto será mostrado somente no convite. Use um nome reconhecível, sem e-mail
            ou outros dados privados. Ele é declarado por você.
          </p>
          <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
            <input
              type="checkbox"
              required
              checked={ciente}
              onChange={(e) => definirCiente(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-ceu"
            />
            <span>Declaro ter 18 anos ou mais e autorizo mostrar esse nome no convite.</span>
          </label>
          <button type="submit" className="rb rb-sol justify-self-start" disabled={!ciente}>
            {acao.pendente ? "Preparando…" : "Preparar convite"}
          </button>
        </fieldset>
        <ErroDaAcao erro={acao.erro} recente={acao.recente} />
      </form>
    </section>
  );
}

export function ConviteRecebido({
  convite: c,
  participacao,
  disponivel,
}: {
  convite: { conviteId: string; identificacao: string; expiraEm: string };
  participacao: MinhaParticipacao | null;
  disponivel: boolean;
}) {
  const hidratado = useHydrated();
  const acao = useAcaoDoGrupo();
  return (
    <section aria-label={`Convite de ${c.identificacao}`} className="painel mt-4 p-5 sm:p-6">
      <h3 className="font-display text-xl font-bold">Convite de {c.identificacao}</h3>
      <p className="mt-2 text-sm text-tinta-suave">
        Nome declarado pelo emissor. Confirme diretamente com quem convidou. Vence em{" "}
        {prazo(c.expiraEm)}, horário de Brasília.
      </p>
      <p className="mt-3 text-sm text-tinta-suave">
        Seu perfil, progresso e mundos continuam seus. Entrar não compartilha mundos nem dá
        administração do grupo. Se você já tem uma assinatura própria, a cobrança continua até você
        cancelá-la na sua conta.
      </p>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          acao.executar(() =>
            aceitarAdultoAction({
              conviteId: c.conviteId,
              declaroMaioridade: dados.get("adulto") === "on",
              entendoCobrancaPropria: dados.get("cobranca") === "on",
              versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
              cobrir: dados.get("cobrir") === "on",
              perfil: participacao
                ? { tipo: "existente", versao: participacao.versao }
                : {
                    tipo: "novo",
                    dados: { apelido: dados.get("apelido"), avatar: dados.get("avatar") },
                  },
            }),
          );
        }}
      >
        <fieldset disabled={!hidratado || acao.pendente || !disponivel} className="grid gap-3">
          <legend className="sr-only">Confirmar entrada no grupo</legend>
          {participacao ? (
            <p className="font-semibold">Continuar com o perfil {participacao.apelido}</p>
          ) : (
            <>
              <label htmlFor={`${c.conviteId}-apelido`} className="grid gap-2 font-semibold">
                Seu apelido no jogo
                <Input
                  id={`${c.conviteId}-apelido`}
                  name="apelido"
                  required
                  minLength={2}
                  maxLength={20}
                  className="h-12 w-full rounded-controle border-[1.5px] border-linha-forte bg-fundo text-tinta"
                  autoComplete="off"
                />
              </label>
              <label className="grid gap-2 font-semibold">
                Seu avatar
                <select
                  name="avatar"
                  className="h-12 w-full rounded-controle border-[1.5px] border-linha-forte bg-fundo px-3 text-tinta"
                  defaultValue="padrao"
                >
                  {AVATARES.map((a) => (
                    <option key={a} value={a}>
                      {NOME_DO_AVATAR[a]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
            <input
              name="cobrir"
              type="checkbox"
              defaultChecked
              className="mt-0.5 h-5 w-5 shrink-0 accent-ceu"
            />
            <span>
              Entrar com cobertura para jogar. A vaga precisa estar disponível ao confirmar.
              Desmarcar permite participar sem jogar por enquanto.
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
            <input
              name="adulto"
              type="checkbox"
              required
              className="mt-0.5 h-5 w-5 shrink-0 accent-ceu"
            />
            <span>Declaro ter 18 anos ou mais.</span>
          </label>
          <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
            <input
              name="cobranca"
              type="checkbox"
              required
              className="mt-0.5 h-5 w-5 shrink-0 accent-ceu"
            />
            <span>
              Entendo que minha cobrança própria continua e que minhas partidas atuais serão
              encerradas ao entrar.
            </span>
          </label>
          <button className="rb rb-sol justify-self-start" type="submit">
            Aceitar convite
          </button>
        </fieldset>
      </form>
      <button
        className="rb rb-vazado mt-4"
        type="button"
        disabled={!hidratado || acao.pendente}
        onClick={() => acao.executar(() => recusarAdultoAction(c.conviteId))}
      >
        Recusar convite
      </button>
      <ErroDaAcao erro={acao.erro} recente={acao.recente} />
    </section>
  );
}

export function ConviteEnviado({
  convite: c,
}: {
  convite: { conviteId: string; email: string; expiraEm: string };
}) {
  const hidratado = useHydrated();
  const acao = useAcaoDoGrupo();
  return (
    <section aria-label={`Convite para ${c.email}`} className="painel mt-3 p-4">
      <p className="font-semibold [overflow-wrap:anywhere]">{c.email}</p>
      <p className="mt-1 text-sm text-tinta-suave">
        Vence em {prazo(c.expiraEm)}, horário de Brasília.
      </p>
      <button
        type="button"
        className="rb rb-vazado mt-3"
        disabled={!hidratado || acao.pendente}
        onClick={() => acao.executar(() => revogarAdultoAction(c.conviteId))}
      >
        Revogar convite
      </button>
      <ErroDaAcao erro={acao.erro} recente={acao.recente} />
    </section>
  );
}
