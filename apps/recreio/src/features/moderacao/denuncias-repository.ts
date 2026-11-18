import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, desc, eq, gte, or, sql } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendships as friends,
  recreioProfiles as profiles,
  recreioSafetyReports as reports,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import type { DenunciaDeContato, DenunciaRecebida } from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { parSocial } from "@/features/social/amizade-repository";
import {
  type AutorSocial,
  type ContextoDeProtecaoSocial,
  comProtecaoSocial,
} from "@/features/social/autoridade-repository";
import { comResponsavelSocialNativo } from "@/features/social/responsavel-contexto-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

type ContextoDaDenuncia = ContextoDeProtecaoSocial & { tipo: "jogador" | "responsavel" };
const PRAZO = 180 * 24 * 60 * 60_000;

async function gravar(
  tx: Transacao,
  atual: ContextoDaDenuncia,
  entrada: DenunciaDeContato,
): Promise<DenunciaRecebida> {
  assertAllowed(
    atual.perfilId !== atual.alvoId && atual.alvoId === entrada.perfilId,
    "CONTATO",
    "Contato não disponível.",
  );
  const resumo = createHash("sha256")
    .update("recreio:contact-report:v1:")
    .update(
      JSON.stringify([atual.perfilId, atual.alvoId, atual.tipo, atual.contaId, entrada.categoria]),
    )
    .digest("hex");
  const [anterior] = await tx
    .select({ id: reports.id, hash: reports.requestHash, expiraEm: reports.expiresAt })
    .from(reports)
    .where(
      and(eq(reports.reporterProfileId, atual.perfilId), eq(reports.clientKey, entrada.denunciaId)),
    );
  const agora = await atual.conferirPrazo();
  if (anterior) {
    assertAllowed(
      anterior.hash === resumo && anterior.expiraEm > agora,
      "CONFLITO",
      "Esta tentativa mudou ou venceu. Confira seu protocolo antes de enviar outra denúncia.",
    );
    return { protocolo: anterior.id, repetida: true };
  }
  const [menor, maior] = parSocial(atual.perfilId, atual.alvoId);
  const [pedido] = await tx
    .select({ id: requests.id })
    .from(requests)
    .where(
      or(
        and(
          eq(requests.originProfileId, atual.perfilId),
          eq(requests.targetProfileId, atual.alvoId),
        ),
        and(
          eq(requests.targetProfileId, atual.perfilId),
          eq(requests.originProfileId, atual.alvoId),
        ),
      ),
    )
    .orderBy(desc(requests.createdAt), desc(requests.id))
    .limit(1);
  const [amizade] = await tx
    .select({ revisao: friends.revision })
    .from(friends)
    .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)));
  const [protecao] = await tx
    .select({ perfilId: blocks.actorProfileId })
    .from(blocks)
    .where(
      and(eq(blocks.actorProfileId, atual.perfilId), eq(blocks.targetProfileId, atual.alvoId)),
    );
  assertAllowed(
    pedido || amizade || protecao || atual.mundoCompartilhado,
    "CONTATO",
    "Contato não disponível.",
  );
  const [quantidade] = await tx
    .select({ valor: sql<number>`count(*)::integer` })
    .from(reports)
    .where(
      and(
        eq(reports.reporterProfileId, atual.perfilId),
        gte(reports.createdAt, new Date(agora.getTime() - 600_000)),
      ),
    );
  assertAllowed(
    quantidade && quantidade.valor < 10,
    "MUITAS_TENTATIVAS",
    "Recebemos muitas denúncias deste perfil em pouco tempo. Aguarde alguns minutos; seus protocolos continuam válidos.",
  );
  const participantes = await tx
    .select({ tipo: profiles.kind })
    .from(profiles)
    .where(or(eq(profiles.id, atual.perfilId), eq(profiles.id, atual.alvoId)));
  const prioridade =
    entrada.categoria === "ameaca" || participantes.some((p) => p.tipo === "minor");
  const criadoEm = await atual.conferirPrazo();
  const [recibo] = await tx
    .insert(reports)
    .values({
      reporterProfileId: atual.perfilId,
      targetProfileId: atual.alvoId,
      actorUserId: atual.contaId,
      actorKind: atual.tipo,
      clientKey: entrada.denunciaId,
      requestHash: resumo,
      category: entrada.categoria,
      priority: prioridade,
      evidenceKind: pedido ? "pedido" : amizade ? "amizade" : protecao ? "protecao" : "mundo",
      evidenceId: pedido?.id ?? (!amizade && !protecao ? atual.mundoCompartilhado : null),
      evidenceRevision: !pedido && amizade ? amizade.revisao : null,
      createdAt: criadoEm,
      updatedAt: criadoEm,
      expiresAt: new Date(criadoEm.getTime() + PRAZO),
    })
    .returning({ id: reports.id });
  assertAllowed(recibo, "CONFLITO", "Não foi possível confirmar a denúncia.");
  await logAuditEventStrict(
    "recreio.safety_reported",
    atual.contaId,
    {
      app: "recreio",
      reportId: recibo.id,
      profileId: atual.perfilId,
      targetProfileId: atual.alvoId,
      category: entrada.categoria,
      priority: prioridade,
      actorKind: atual.tipo,
    },
    { writer: tx },
  );
  await atual.conferirPrazo();
  return { protocolo: recibo.id, repetida: false };
}

export function denunciarContatoNoBanco(autor: AutorSocial, entrada: DenunciaDeContato) {
  return comProtecaoSocial(autor, entrada.perfilId, (tx, atual) =>
    gravar(tx, { ...atual, tipo: "jogador" }, entrada),
  );
}
export function denunciarContatoDoMenorNoBanco(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  entrada: DenunciaDeContato,
) {
  return comResponsavelSocialNativo(
    autor,
    perfilId,
    { origemId: perfilId, destinoId: entrada.perfilId, finalidade: "protecao" },
    (tx, atual) =>
      gravar(
        tx,
        {
          perfilId,
          alvoId: entrada.perfilId,
          contaId: atual.contaId,
          conferirPrazo: atual.conferirPrazo,
          tipo: "responsavel",
          mundoCompartilhado: atual.mundoCompartilhado,
        },
        entrada,
      ),
  );
}
