import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioGuardianLinks as guardians,
  recreioNativePins as pins,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
} from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import {
  type IdentidadeNativa,
  lerContaNativa,
  validarIdentidadeDaSessaoNativa,
} from "@/features/account/autoridade-repository";
import { exigirParticipacaoAtivaLocked } from "@/features/account/participacao-repository";
import { exigirCadastroProtegidoDisponivel } from "@/features/familia/disponibilidade";
import { paraPerfil } from "@/features/perfis/repository";
import { invalidarIngressosDoAparelho } from "@/features/sessao-de-jogo/ingressos-repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/repository";
import { assertAllowed } from "@/lib/errors";
import { conferirPin } from "./segredos";

export type DestinoDoAparelho = { tipo: "gestao" } | { tipo: "perfil"; perfilId: PerfilId };

/** A identidade nativa sozinha não destrava o contexto; o PIN do destino é obrigatório. */
export async function trocarContextoComPin(
  autor: IdentidadeNativa,
  destino: DestinoDoAparelho,
  pin: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const conta = await lerContaNativa(tx, autor.contaId);
    if (destino.tipo === "perfil") await exigirParticipacaoAtivaLocked(tx, autor.contaId);
    const [perfil] =
      destino.tipo === "perfil"
        ? await tx.select().from(profiles).where(eq(profiles.id, destino.perfilId)).for("share")
        : [];
    assertAllowed(
      destino.tipo === "gestao" || perfil?.status === "active",
      "PERFIL",
      "Perfil não encontrado.",
    );
    const [vinculo] =
      perfil?.kind === "minor"
        ? await tx
            .select()
            .from(guardians)
            .where(
              and(eq(guardians.profileId, perfil.id), eq(guardians.guardianUserId, autor.contaId)),
            )
            .for("share")
        : [];
    const [protecao] =
      perfil?.kind === "minor"
        ? await tx.select().from(protection).where(eq(protection.profileId, perfil.id)).for("share")
        : [];
    const [nativo] = await tx
      .select()
      .from(pins)
      .where(eq(pins.userId, autor.contaId))
      .for("share");
    if (perfil?.kind === "minor") {
      exigirCadastroProtegidoDisponivel();
      assertAllowed(
        vinculo && protecao?.guardianLinkId === vinculo.id,
        "PERFIL",
        "Perfil não encontrado.",
      );
      assertAllowed(
        nativo,
        "PIN_NATIVO",
        "Configure o PIN da sua conta antes de compartilhar este aparelho.",
      );
    } else if (perfil) {
      assertAllowed(
        perfil.kind === "adult" && perfil.userId === autor.contaId,
        "PERFIL",
        "Perfil não encontrado.",
      );
    }
    const [aparelho] = await tx
      .select()
      .from(devices)
      .where(eq(devices.id, autor.sessaoDeAparelhoId))
      .for("update");
    assertAllowed(aparelho, "AUTH", "Entre novamente para continuar.");
    await validarIdentidadeDaSessaoNativa(tx, autor, conta, aparelho);
    const hash = perfil?.kind === "minor" ? protecao?.pinHash : nativo?.hash;
    assertAllowed(
      hash && (await conferirPin(pin, hash)),
      "PIN",
      "PIN incorreto ou não configurado para este destino.",
    );
    const agora = await validarIdentidadeDaSessaoNativa(tx, autor, conta, aparelho);
    const novaGeracao = perfil?.kind === "minor" ? (protecao?.accessGeneration ?? null) : null;
    assertAllowed(perfil?.kind !== "minor" || novaGeracao, "PERFIL", "Perfil não encontrado.");
    const novoPerfil = perfil?.id ?? null;
    const mudou =
      aparelho.activeProfileId !== novoPerfil || aparelho.minorContextGeneration !== novaGeracao;
    if (mudou) {
      const [aberta] = await tx
        .select({ id: games.id })
        .from(games)
        .where(
          and(
            eq(games.deviceSessionId, aparelho.id),
            isNull(games.endedAt),
            sql`${games.expiresAt} > clock_timestamp()`,
          ),
        )
        .limit(1);
      assertAllowed(!aberta, "JOGO_ABERTO", "Saia do jogo antes de trocar de perfil.");
      await tx
        .update(devices)
        .set({
          activeProfileId: novoPerfil,
          minorContextGeneration: novaGeracao,
          profileSelectedAt: perfil ? agora : null,
        })
        .where(eq(devices.id, aparelho.id));
      await invalidarIngressosDoAparelho(tx, autor.sessaoDeAparelhoId);
      await encerrarSessoesAbertas(tx, sql`${games.deviceSessionId}=${aparelho.id}`, "signed_out", {
        porQuem: "conta",
      });
      await logAuditEventStrict(
        "recreio.device_context_changed",
        perfil?.kind === "minor" && aparelho.minorContextGeneration ? null : autor.contaId,
        {
          app: "recreio",
          deviceSessionId: aparelho.id,
          ...(perfil ? { profileId: perfil.id } : {}),
          scope: perfil?.kind ?? "management",
        },
        { writer: tx },
      );
    }
    return { perfil: perfil ? paraPerfil(perfil) : null, tipo: perfil?.kind ?? "management" };
  });
}
