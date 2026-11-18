"use client";
import type { ContatoSocial } from "@informach/recreio/contrato";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useId, useState } from "react";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import {
  aceitarAmizadeAction,
  aprovarAmizadeAction,
  encerrarAmizadeAction,
  lerAvisoDoMenorAction,
  protegerContatoAction,
  protegerContatoDoMenorAction,
  removerAmizadeAction,
  removerContatoDoMenorAction,
  renovarAmizadeAction,
} from "../actions";
import type { ContatoSupervisionado } from "../supervisao-repository";
import { ErroSocial, useAcaoSocial } from "./acao";
import { DenunciarContato } from "./denuncia";

type Props = { perfilId: string; acesso: string; destino: string } & (
  | { tipo: "jogador"; contato: ContatoSocial; novosContatos: boolean }
  | { tipo: "responsavel"; contato: ContatoSupervisionado; versao: number }
);
export function CartaoDeContato(p: Props) {
  const c = p.contato,
    pedido = c.pedido,
    id = useId(),
    hidratado = useHydrated();
  const acao = useAcaoSocial(p.destino),
    [ciente, definirCiente] = useState(false);
  const responsavel = p.tipo === "responsavel" ? p : null;
  const aprovacao = responsavel?.contato.aprovacao ?? null,
    avisoId = responsavel?.contato.avisoId ?? null;
  const nome = c.apelido ?? `Pedido ${c.perfilId.slice(-6).toUpperCase()}`;
  const proteger = (bloqueado: boolean, silenciado: boolean) => {
    const entrada = {
      perfilId: c.perfilId,
      bloqueado,
      silenciado,
      anterior: { bloqueado: c.bloqueado, silenciado: c.silenciado },
    };
    return p.tipo === "responsavel"
      ? protegerContatoDoMenorAction(p.perfilId, entrada)
      : protegerContatoAction(p.perfilId, entrada);
  };
  return (
    <article aria-labelledby={`${id}-nome`} className="painel p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <AvatarDoPerfil avatar={c.avatar ?? "padrao"} apelido={c.apelido ?? "Contato"} />
        <div className="min-w-0 flex-1">
          <h3 id={`${id}-nome`} className="font-display text-xl font-bold [overflow-wrap:anywhere]">
            {nome}
          </h3>
          <p className="mt-1 text-sm text-tinta-suave">
            {c.bloqueado
              ? "Bloqueado por você"
              : c.amizade
                ? "Amizade confirmada"
                : c.pedido
                  ? c.pedido.aguardaAprovacao
                    ? "Aguardando aprovação do responsável"
                    : "Pedido de amizade"
                  : "Contato indisponível"}
          </p>
          {c.amizade && !c.bloqueado && (
            <p
              className={`mt-1 text-xs font-semibold ${c.online ? "text-ceu" : "text-tinta-suave"}`}
            >
              {c.online ? "Online" : "Presença não informada"}
            </p>
          )}
          {c.silenciado && (
            <p className="mt-1 text-xs font-semibold text-tinta-suave">Silenciado</p>
          )}
        </div>
      </div>
      {!c.apelido && (
        <p className="mt-3 text-sm text-tinta-suave">
          A identificação fica reservada enquanto faltam as permissões necessárias.
        </p>
      )}
      {p.tipo === "jogador" && p.novosContatos && c.amizade && !c.bloqueado && (
        <Link
          href={`/amigos/${c.perfilId}/convidar`}
          className="mt-4 inline-flex min-h-11 items-center font-bold text-ceu underline"
        >
          Convidar para um mundo
        </Link>
      )}
      <fieldset className="mt-4" disabled={!hidratado || acao.pendente}>
        <legend className="sr-only">Cuidados e decisões sobre {nome}</legend>
        {p.tipo === "jogador" && pedido && (
          <div className="mb-4 flex flex-wrap gap-2">
            {pedido.direcao === "recebido" && !pedido.aceito && (
              <button
                type="button"
                className="rb rb-sol"
                disabled={!p.novosContatos}
                onClick={() => acao.executar(() => aceitarAmizadeAction(p.perfilId, pedido.id))}
              >
                Aceitar pedido
              </button>
            )}
            {pedido.direcao === "recebido" && pedido.aceito && (
              <p className="w-full text-sm text-tinta-suave">
                Você já aceitou. A amizade ainda aguarda as aprovações necessárias.
              </p>
            )}
            <button
              type="button"
              className="rb rb-vazado"
              onClick={() =>
                acao.executar(() =>
                  encerrarAmizadeAction(p.perfilId, {
                    pedidoId: pedido.id,
                    acao: pedido.direcao === "recebido" ? "recusar" : "revogar",
                  }),
                )
              }
            >
              {pedido.direcao === "recebido" ? "Recusar pedido" : "Cancelar pedido"}
            </button>
          </div>
        )}
        {responsavel && aprovacao && (
          <div className="mb-5 rounded-controle border border-linha bg-painel-2 p-4">
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={ciente}
                onChange={(e) => definirCiente(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-ceu"
              />
              <span>
                Conheço este contato e autorizo esta amizade para o perfil sob minha
                responsabilidade.
              </span>
            </label>
            <button
              type="button"
              className="rb rb-sol mt-3"
              disabled={!ciente}
              onClick={() => {
                const entrada = {
                  pedidoId: aprovacao.pedidoId,
                  perfilId: responsavel.perfilId,
                  versao: responsavel.versao,
                };
                if (aprovacao.tipo === "renovar") {
                  acao.executar(() =>
                    renovarAmizadeAction({
                      ...entrada,
                      revisaoDaAmizade: aprovacao.revisao,
                      confirmoAmizade: true,
                    }),
                  );
                } else acao.executar(() => aprovarAmizadeAction(entrada));
              }}
            >
              {aprovacao.tipo === "renovar" ? "Autorizar novamente" : "Aprovar amizade"}
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {c.podeRemover && (
            <button
              type="button"
              className="rb rb-vazado"
              onClick={() =>
                acao.executar(() =>
                  p.tipo === "responsavel"
                    ? removerContatoDoMenorAction(p.perfilId, c.perfilId)
                    : removerAmizadeAction(p.perfilId, c.perfilId),
                )
              }
            >
              Remover amizade
            </button>
          )}
          <button
            type="button"
            className="rb rb-vazado"
            onClick={() => acao.executar(() => proteger(!c.bloqueado, c.silenciado))}
          >
            {c.bloqueado ? "Desbloquear" : "Bloquear"}
          </button>
          <button
            type="button"
            className="rb rb-vazado"
            onClick={() => acao.executar(() => proteger(c.bloqueado, !c.silenciado))}
          >
            {c.silenciado ? "Retirar silêncio" : "Silenciar"}
          </button>
          {responsavel && avisoId && (
            <button
              type="button"
              className="rb rb-vazado"
              onClick={() =>
                acao.executar(() => lerAvisoDoMenorAction(responsavel.perfilId, avisoId))
              }
            >
              Marcar aviso como lido
            </button>
          )}
        </div>
      </fieldset>
      {c.bloqueado && (
        <p className="mt-3 text-xs text-tinta-suave">
          Desbloquear não refaz a amizade nem reabre pedidos antigos.
        </p>
      )}
      <ErroSocial {...acao} destino={p.destino} acesso={p.acesso} />
      <DenunciarContato
        perfilId={p.perfilId}
        alvoId={c.perfilId}
        responsavel={p.tipo === "responsavel"}
        destino={p.destino}
        acesso={p.acesso}
      />
    </article>
  );
}
