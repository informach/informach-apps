"use client";
import type { ParticipanteDoMundo } from "@informach/recreio/contrato";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { protegerContatoAction, protegerContatoDoMenorAction } from "@/features/social/actions";
import { ErroSocial, useAcaoSocial } from "@/features/social/components/acao";
import { DenunciarContato } from "@/features/social/components/denuncia";

export function CuidadosDeParticipante({
  perfilId,
  participante: p,
  destino,
  responsavel = false,
}: {
  perfilId: string;
  participante: ParticipanteDoMundo;
  destino: string;
  responsavel?: boolean;
}) {
  const hidratado = useHydrated(),
    acao = useAcaoSocial(destino);
  const proteger = (bloqueado: boolean, silenciado: boolean) =>
    acao.executar(() =>
      (responsavel ? protegerContatoDoMenorAction : protegerContatoAction)(perfilId, {
        perfilId: p.perfilId,
        bloqueado,
        silenciado,
        anterior: { bloqueado: p.bloqueado, silenciado: p.silenciado },
      }),
    );
  const nome = p.apelido ?? "Participante com identificação reservada";
  return (
    <article className="painel p-5">
      <div className="flex items-start gap-3">
        <AvatarDoPerfil avatar={p.avatar ?? "padrao"} apelido={nome} />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold [overflow-wrap:anywhere]">{nome}</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            {p.bloqueado ? "Bloqueado por você" : "Participante deste mundo"}
            {p.silenciado ? " · Silenciado" : ""}
          </p>
        </div>
      </div>
      <fieldset disabled={!hidratado || acao.pendente} className="mt-4 flex flex-wrap gap-3">
        <legend className="sr-only">Cuidados sobre {nome}</legend>
        <button
          type="button"
          className="rb rb-vazado"
          onClick={() => proteger(!p.bloqueado, p.silenciado)}
        >
          {p.bloqueado ? "Desbloquear" : "Bloquear"}
        </button>
        <button
          type="button"
          className="rb rb-vazado"
          onClick={() => proteger(p.bloqueado, !p.silenciado)}
        >
          {p.silenciado ? "Retirar silêncio" : "Silenciar"}
        </button>
      </fieldset>
      <ErroSocial {...acao} destino={destino} acesso={destino} />
      <DenunciarContato
        perfilId={perfilId}
        alvoId={p.perfilId}
        responsavel={responsavel}
        destino={destino}
        acesso={destino}
      />
    </article>
  );
}
