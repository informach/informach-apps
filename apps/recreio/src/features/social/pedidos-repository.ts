import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, gt, lte, or } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendCodes as codes,
  recreioFriendships as friends,
  recreioSocialNotices as notices,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { contatoDisponivel, decidirPedidoDeAmizade, PerfilIdSchema } from "@informach/recreio";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { AutorSocial } from "./autoridade-repository";
import { comJogadorSocial } from "./autoridade-repository";
import {
  LIMITE_DE_AMIGOS,
  LIMITE_DE_PEDIDOS_SOCIAIS,
  type NovoPedidoDeAmizade,
  PRAZO_DO_PEDIDO_DE_AMIZADE_MS,
} from "./regras";
import { hashDoCodigoDeAmigo } from "./segredos";

async function repeticao(tx: Transacao, perfilId: string, pedidoId: string, hash: string) {
  const [linha] = await tx
    .select({ id: requests.id, hash: requests.requestHash, estado: requests.state })
    .from(requests)
    .where(and(eq(requests.originProfileId, perfilId), eq(requests.clientKey, pedidoId)));
  if (!linha) return null;
  assertAllowed(
    linha.hash === hash,
    "CONFLITO",
    "Este pedido já foi usado com outro código. Reabra os contatos para conferir.",
  );
  return { pedidoId: linha.id, estado: linha.estado, repetido: true as const };
}

export async function criarPedidoDeAmizade(referencia: AutorSocial, pedido: NovoPedidoDeAmizade) {
  const codeHash = hashDoCodigoDeAmigo(pedido.codigo);
  const hash = createHash("sha256")
    .update(JSON.stringify({ perfilId: referencia.perfilId, pedidoId: pedido.pedidoId, codeHash }))
    .digest("hex");
  // Descoberta só depois da admissão própria; a segunda transação admite as
  // duas pontas do zero, sem acrescentar mutexes enquanto conserva os anteriores.
  const pista = await comJogadorSocial(referencia, null, async (tx, atual) => {
    const recibo = await repeticao(tx, referencia.perfilId, pedido.pedidoId, hash);
    if (recibo) return { recibo, alvoId: null };
    assertAllowed(
      contatoDisponivel(atual.origem),
      "CONTATO",
      "Os contatos não estão disponíveis para este perfil.",
    );
    const [codigo] = await tx
      .select({ perfilId: codes.profileId })
      .from(codes)
      .where(eq(codes.codeHash, codeHash));
    assertAllowed(
      codigo,
      "CONTATO",
      "Não foi possível usar este código. Confirme com a pessoa e tente novamente.",
    );
    return { recibo: null, alvoId: PerfilIdSchema.parse(codigo.perfilId) };
  });
  if (pista.recibo) return pista.recibo;
  assertAllowed(pista.alvoId, "CONTATO", "Contato não disponível.");
  return comJogadorSocial(referencia, pista.alvoId, async (tx, atual) => {
    const recibo = await repeticao(tx, referencia.perfilId, pedido.pedidoId, hash);
    if (recibo) return recibo;
    const destino = atual.destino;
    assertAllowed(destino, "CONTATO", "Contato não disponível.");
    assertAllowed(
      (atual.origem.tipo === "adulto" && destino.tipo === "adulto") ||
        env.RECREIO_FAMILY_MODE === "play",
      "CONTATO",
      "Novos contatos protegidos ainda não estão disponíveis neste acesso.",
    );
    const [codigo] = await tx
      .select()
      .from(codes)
      .where(and(eq(codes.codeHash, codeHash), eq(codes.profileId, destino.id)))
      .for("update");
    const agora = await atual.conferirPrazo();
    const bloqueios = await tx
      .select({ id: blocks.actorProfileId })
      .from(blocks)
      .where(
        and(
          eq(blocks.blocked, true),
          or(
            and(
              eq(blocks.actorProfileId, referencia.perfilId),
              eq(blocks.targetProfileId, destino.id),
            ),
            and(
              eq(blocks.actorProfileId, destino.id),
              eq(blocks.targetProfileId, referencia.perfilId),
            ),
          ),
        ),
      )
      .limit(1);
    const decisao = decidirPedidoDeAmizade({
      origem: atual.origem,
      destino,
      codigoVigente: Boolean(
        codigo && !codigo.consumedAt && !codigo.revokedAt && codigo.expiresAt > agora,
      ),
      bloqueadoPorUmaDasPartes: bloqueios.length > 0,
    });
    assertAllowed(
      decisao.permitido && codigo,
      "CONTATO",
      "Não foi possível usar este código. Confirme com a pessoa e tente novamente.",
    );
    const par = or(
      and(
        eq(requests.originProfileId, referencia.perfilId),
        eq(requests.targetProfileId, destino.id),
      ),
      and(
        eq(requests.originProfileId, destino.id),
        eq(requests.targetProfileId, referencia.perfilId),
      ),
    );
    const vencidos = await tx
      .update(requests)
      .set({ state: "expired", finishedAt: agora })
      .where(and(par, eq(requests.state, "pending"), lte(requests.expiresAt, agora)))
      .returning({ id: requests.id });
    for (const vencido of vencidos)
      await logAuditEventStrict(
        "recreio.friend_request_expired",
        null,
        { app: "recreio", requestId: vencido.id },
        { writer: tx },
      );
    const [pendente] = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(and(par, eq(requests.state, "pending")))
      .limit(1);
    assertAllowed(
      !pendente,
      "PEDIDO_PENDENTE",
      "Já existe um pedido entre vocês. Confira os pedidos recebidos antes de enviar outro.",
    );
    const [menor, maior] = [referencia.perfilId, destino.id].sort();
    assertAllowed(menor && maior, "CONTATO", "Contato não disponível.");
    const [amizade] = await tx
      .select({ id: friends.requestId })
      .from(friends)
      .where(
        and(
          eq(friends.lowerProfileId, menor),
          eq(friends.higherProfileId, maior),
          eq(friends.state, "active"),
        ),
      )
      .limit(1);
    assertAllowed(
      !amizade,
      "CONTATO_EXISTENTE",
      "Vocês já têm um contato cadastrado. Confira sua lista de amigos.",
    );
    const enviados = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.originProfileId, referencia.perfilId),
          eq(requests.state, "pending"),
          gt(requests.expiresAt, agora),
        ),
      )
      .limit(LIMITE_DE_PEDIDOS_SOCIAIS);
    const recebidos = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.targetProfileId, destino.id),
          eq(requests.state, "pending"),
          gt(requests.expiresAt, agora),
        ),
      )
      .limit(LIMITE_DE_PEDIDOS_SOCIAIS);
    assertAllowed(
      enviados.length < LIMITE_DE_PEDIDOS_SOCIAIS && recebidos.length < LIMITE_DE_PEDIDOS_SOCIAIS,
      "LIMITE_DE_CONTATOS",
      "Não foi possível preparar outro pedido agora. Aguarde ou encerre pedidos pendentes.",
    );
    for (const perfilId of [referencia.perfilId, destino.id]) {
      const amigos = await tx
        .select({ id: friends.lowerProfileId })
        .from(friends)
        .where(
          and(
            eq(friends.state, "active"),
            or(eq(friends.lowerProfileId, perfilId), eq(friends.higherProfileId, perfilId)),
          ),
        )
        .limit(LIMITE_DE_AMIGOS);
      assertAllowed(
        amigos.length < LIMITE_DE_AMIGOS,
        "LIMITE_DE_CONTATOS",
        "Não há espaço para outro contato agora. Confira os contatos existentes.",
      );
    }
    const criadoEm = await atual.conferirPrazo();
    assertAllowed(
      codigo.expiresAt > criadoEm,
      "CONTATO",
      "O código venceu. Peça outro código à pessoa.",
    );
    const [criado] = await tx
      .insert(requests)
      .values({
        originProfileId: referencia.perfilId,
        targetProfileId: destino.id,
        codeId: codigo.id,
        clientKey: pedido.pedidoId,
        requestHash: hash,
        createdAt: criadoEm,
        expiresAt: new Date(criadoEm.getTime() + PRAZO_DO_PEDIDO_DE_AMIZADE_MS),
      })
      .returning({ id: requests.id });
    assertAllowed(criado, "CONTATO", "Não foi possível preparar o pedido.");
    await tx.update(codes).set({ consumedAt: criadoEm }).where(eq(codes.id, codigo.id));
    for (const perfil of [atual.origem, destino])
      if (perfil.tipo === "protegido")
        await tx
          .insert(notices)
          .values({
            guardianUserId: perfil.responsabilidade.contaId,
            profileId: perfil.id,
            requestId: criado.id,
            requestOriginProfileId: atual.origem.id,
            requestTargetProfileId: destino.id,
          })
          .onConflictDoNothing();
    await logAuditEventStrict(
      "recreio.friend_request_created",
      atual.contaId,
      {
        app: "recreio",
        requestId: criado.id,
        profileId: referencia.perfilId,
        targetProfileId: destino.id,
      },
      { writer: tx },
    );
    assertAllowed(
      codigo.expiresAt > (await atual.conferirPrazo()),
      "CONTATO",
      "O código venceu. Peça outro código à pessoa.",
    );
    return { pedidoId: criado.id, estado: "pending" as const, repetido: false as const };
  });
}
