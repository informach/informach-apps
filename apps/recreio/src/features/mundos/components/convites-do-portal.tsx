"use client";
import type {
  CaixaDeConvitesDirigidos,
  ConvitesDirigidosDoPerfil,
} from "@informach/recreio/contrato";
import { useId, useMemo, useState } from "react";
import type { ActionResult } from "@/lib/action";
import {
  conferirConviteDirigidoAction,
  consultarConviteDirigidoAction,
  emitirConviteDirigidoAction,
  listarConvitesDoJogadorAction,
  responderConviteDirigidoAction,
} from "../convites-dirigidos-actions";
import { RecusaDeConviteNaInterface } from "../convites-interface";
import { EmitirConviteNaPartida, PainelDeConvites } from "./convites-na-partida";

async function resultado<T>(acao: Promise<ActionResult<T>>): Promise<T> {
  const r = await acao;
  if (!r.ok) throw new RecusaDeConviteNaInterface(r.error);
  return r.data;
}
function apiNativa(perfilId: string): ConvitesDirigidosDoPerfil {
  return {
    listar: (apos) =>
      resultado(
        listarConvitesDoJogadorAction(perfilId, apos ? { aposEm: apos.em, aposId: apos.id } : {}),
      ),
    consultar: (id) => resultado(consultarConviteDirigidoAction(perfilId, id)),
    conferir: (id) => resultado(conferirConviteDirigidoAction(perfilId, id)),
    emitir: (pedido) => resultado(emitirConviteDirigidoAction(perfilId, pedido)),
    responder: (conviteId, acao) =>
      resultado(responderConviteDirigidoAction(perfilId, { conviteId, acao })),
  };
}
export function ConvitesDoPortal({
  perfilId,
  inicial,
}: {
  perfilId: string;
  inicial: CaixaDeConvitesDirigidos;
}) {
  const api = useMemo(() => apiNativa(perfilId), [perfilId]);
  return <PainelDeConvites api={api} inicial={inicial} />;
}
export function EmitirConviteDoPortal({
  perfilId,
  destinatarioId,
  mundos,
}: {
  perfilId: string;
  destinatarioId: string;
  mundos: readonly { id: string; nome: string; jogo: string }[];
}) {
  const id = useId(),
    api = useMemo(() => apiNativa(perfilId), [perfilId]);
  const [mundo, escolherMundo] = useState(mundos[0]?.id ?? ""),
    [enviado, marcarEnviado] = useState(false);
  return (
    <section
      className="painel mt-7 grid max-w-2xl gap-4 p-5 sm:p-6"
      aria-label="Escolher mundo para convidar"
    >
      <label htmlFor={id} className="font-semibold">
        Escolha um mundo
      </label>
      <select
        id={id}
        value={mundo}
        disabled={enviado || mundos.length === 0}
        onChange={(e) => escolherMundo(e.target.value)}
        className="min-h-11 w-full min-w-0 rounded-controle border border-linha bg-fundo px-3 text-tinta"
      >
        {mundos.length === 0 ? (
          <option value="">Nenhum mundo disponível nesta página</option>
        ) : (
          mundos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} · {m.jogo}
            </option>
          ))
        )}
      </select>
      <p className="text-sm text-tinta-suave">
        O acesso, os cuidados do perfil e as permissões atuais do mundo serão conferidos ao enviar.
        Cada responsável confirma a participação do menor sob seus cuidados.
      </p>
      {mundo && (
        <EmitirConviteNaPartida
          key={mundo}
          api={api}
          mundoId={mundo}
          perfilId={destinatarioId}
          aoIniciar={() => marcarEnviado(true)}
        />
      )}
      <a
        href="/convites"
        className="inline-flex min-h-11 items-center font-bold text-ceu underline"
      >
        Conferir meus convites
      </a>
    </section>
  );
}
