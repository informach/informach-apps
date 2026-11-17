import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, isNull } from "@informach/db";
import { recreioFriendCodes as codes } from "@informach/db/schema";
import { contatoDisponivel } from "@informach/recreio";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { comJogadorSocial } from "./autoridade-repository";
import { PRAZO_DO_CODIGO_DE_AMIGO_MS } from "./regras";

export async function gravarCodigoDeAmigo(referencia: ReferenciaDeJogador, codeHash: string) {
  return comJogadorSocial(referencia, null, async (tx, atual) => {
    assertAllowed(
      contatoDisponivel(atual.origem),
      "CONTATO",
      "Os contatos não estão disponíveis para este perfil.",
    );
    assertAllowed(
      atual.origem.tipo === "adulto" || env.RECREIO_FAMILY_MODE === "play",
      "CONTATO",
      "Novos contatos protegidos ainda não estão disponíveis neste acesso.",
    );
    const agora = await atual.conferirPrazo();
    const anteriores = await tx
      .update(codes)
      .set({ revokedAt: agora })
      .where(
        and(
          eq(codes.profileId, referencia.perfilId),
          isNull(codes.revokedAt),
          isNull(codes.consumedAt),
        ),
      )
      .returning({ id: codes.id });
    for (const anterior of anteriores)
      await logAuditEventStrict(
        "recreio.friend_code_revoked",
        atual.contaId,
        { app: "recreio", profileId: referencia.perfilId, codeId: anterior.id },
        { writer: tx },
      );
    const [criado] = await tx
      .insert(codes)
      .values({
        profileId: referencia.perfilId,
        codeHash,
        createdAt: agora,
        expiresAt: new Date(agora.getTime() + PRAZO_DO_CODIGO_DE_AMIGO_MS),
      })
      .returning({ id: codes.id, expiraEm: codes.expiresAt });
    assertAllowed(criado, "CONTATO", "Não foi possível preparar o código.");
    await logAuditEventStrict(
      "recreio.friend_code_created",
      atual.contaId,
      { app: "recreio", profileId: referencia.perfilId, codeId: criado.id },
      { writer: tx },
    );
    assertAllowed(
      criado.expiraEm > (await atual.conferirPrazo()),
      "CONTATO",
      "O código venceu. Gere outro para continuar.",
    );
    return { codigoId: criado.id, expiraEm: criado.expiraEm.toISOString() };
  });
}
