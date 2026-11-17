import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, isNull, sql } from "@informach/db";
import {
  recreioFriendConsents as consents,
  recreioFriendships as friends,
  recreioSocialNotices as notices,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import {
  aprovacaoSocialAtual,
  ContaIdSchema,
  contatoDisponivel,
  type PerfilId,
} from "@informach/recreio";
import type { ContatoSocial } from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { parSocial } from "./amizade-repository";
import { consultarContatoParaResponsavel, idsSociaisSobTrava } from "./consulta-repository";
import { gravarProtecaoSobTrava, removerContatoSobTrava } from "./protecao-repository";
import type { ProtecaoDeContato } from "./regras";
import { comResponsavelSocialNativo } from "./responsavel-contexto-repository";

export type ContatoSupervisionado = ContatoSocial & {
  pedidoDeAprovacaoId: string | null;
  revisaoDaAmizade: number | null;
  podeAprovar: boolean;
  podeReaprovar: boolean;
  avisoId: string | null;
};
export type SupervisaoSocial = {
  perfilId: PerfilId;
  apelido: string;
  avatar: string;
  versao: number;
  avisosNaoLidos: number;
  contatos: ContatoSupervisionado[];
  proximo: PerfilId | null;
};

export async function lerSupervisaoSocial(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  apos: PerfilId | null,
): Promise<SupervisaoSocial> {
  const pagina = await comResponsavelSocialNativo(
    autor,
    perfilId,
    { origemId: perfilId, destinoId: null, finalidade: "contato", operacao: "leitura" },
    (tx) => idsSociaisSobTrava(tx, perfilId, apos),
  );
  const contatos: ContatoSupervisionado[] = [];
  for (const alvo of pagina.slice(0, 10)) {
    const linha = await comResponsavelSocialNativo(
      autor,
      perfilId,
      { origemId: perfilId, destinoId: alvo, finalidade: "contato", operacao: "leitura" },
      async (tx, atual) => {
        const contato = await consultarContatoParaResponsavel(tx, atual, alvo);
        if (!contato) return null;
        const [menor, maior] = parSocial(perfilId, alvo);
        const [amizade] = await tx
          .select()
          .from(friends)
          .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)));
        const pedidoId =
          contato.pedido?.id ?? (amizade?.state === "active" ? amizade.requestId : null);
        const [aprovacao] = pedidoId
          ? await tx
              .select()
              .from(consents)
              .where(and(eq(consents.requestId, pedidoId), eq(consents.profileId, perfilId)))
          : [];
        const aprovada = aprovacaoSocialAtual(
          atual.menor,
          aprovacao?.approvedByUserId
            ? {
                perfilId,
                contaId: ContaIdSchema.parse(aprovacao.approvedByUserId),
                vinculoId: aprovacao.guardianLinkId,
                geracao: aprovacao.accessGeneration,
              }
            : null,
        );
        const [aviso] = pedidoId
          ? await tx
              .select({ id: notices.id })
              .from(notices)
              .where(
                and(
                  eq(notices.requestId, pedidoId),
                  eq(notices.profileId, perfilId),
                  eq(notices.guardianUserId, autor.contaId),
                  isNull(notices.readAt),
                ),
              )
          : [];
        const podeAutorizar =
          contatoDisponivel(atual.menor) &&
          atual.destino &&
          contatoDisponivel(atual.destino) &&
          !aprovada;
        return {
          ...contato,
          pedidoDeAprovacaoId: pedidoId,
          revisaoDaAmizade: amizade?.state === "active" ? amizade.revision : null,
          podeAprovar: Boolean(podeAutorizar && contato.pedido),
          podeReaprovar: Boolean(podeAutorizar && amizade?.state === "active"),
          avisoId: aviso?.id ?? null,
        };
      },
    );
    if (linha) contatos.push(linha);
  }
  const dados = await comResponsavelSocialNativo(
    autor,
    perfilId,
    { origemId: perfilId, destinoId: null, finalidade: "contato", operacao: "leitura" },
    async (tx, atual) => {
      const [perfil] = await tx
        .select({ apelido: profiles.nickname, avatar: profiles.avatar })
        .from(profiles)
        .where(eq(profiles.id, perfilId));
      const [avisos] = await tx
        .select({ quantidade: sql<number>`count(*)::integer` })
        .from(notices)
        .where(
          and(
            eq(notices.profileId, perfilId),
            eq(notices.guardianUserId, autor.contaId),
            isNull(notices.readAt),
          ),
        );
      assertAllowed(perfil && avisos, "PEDIDO", "Perfil não disponível.");
      return { ...perfil, versao: atual.versaoDoMenor, avisosNaoLidos: avisos.quantidade };
    },
  );
  return { ...dados, perfilId, contatos, proximo: pagina.length > 10 ? (pagina[9] ?? null) : null };
}

export async function protegerContatoSupervisionado(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  entrada: ProtecaoDeContato,
) {
  return comResponsavelSocialNativo(
    autor,
    perfilId,
    { origemId: perfilId, destinoId: entrada.perfilId, finalidade: "protecao" },
    (tx, atual) =>
      gravarProtecaoSobTrava(
        tx,
        {
          perfilId,
          alvoId: entrada.perfilId,
          contaId: atual.contaId,
          conferirPrazo: atual.conferirPrazo,
        },
        entrada,
      ),
  );
}
export async function removerContatoSupervisionado(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  alvo: PerfilId,
) {
  return comResponsavelSocialNativo(
    autor,
    perfilId,
    { origemId: perfilId, destinoId: alvo, finalidade: "protecao" },
    (tx, atual) =>
      removerContatoSobTrava(tx, {
        perfilId,
        alvoId: alvo,
        contaId: atual.contaId,
        conferirPrazo: atual.conferirPrazo,
      }),
  );
}
export async function marcarAvisoSocial(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  avisoId: string,
) {
  return comResponsavelSocialNativo(
    autor,
    perfilId,
    { origemId: perfilId, destinoId: null, finalidade: "protecao" },
    async (tx, atual) => {
      const [aviso] = await tx
        .select()
        .from(notices)
        .where(
          and(
            eq(notices.id, avisoId),
            eq(notices.profileId, perfilId),
            eq(notices.guardianUserId, autor.contaId),
          ),
        )
        .for("update");
      assertAllowed(aviso, "PEDIDO", "Aviso não disponível.");
      if (!aviso.readAt) {
        await tx
          .update(notices)
          .set({ readAt: await atual.conferirPrazo() })
          .where(eq(notices.id, aviso.id));
        await logAuditEventStrict(
          "recreio.social_notice_read",
          atual.contaId,
          { app: "recreio", profileId, noticeId: aviso.id, requestId: aviso.requestId },
          { writer: tx },
        );
      }
      return { lido: true };
    },
  );
}
