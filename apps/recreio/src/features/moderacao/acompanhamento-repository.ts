import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, desc, eq, gt } from "@informach/db";
import { recreioSafetyReports as reports } from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import type { RecursoRecebido, RevisaoDeDenuncia } from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { type AutorSocial, comJogadorSocial } from "@/features/social/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { comGestorDaRestricao } from "./restricao-contexto-repository";

export type AutorDoProtocolo =
  | { tipo: "jogador"; jogador: AutorSocial }
  | { tipo: "gestor"; nativo: AutorNativoRecente; perfilId: PerfilId };
type Contexto = {
  perfilId: PerfilId;
  contaId: string | null;
  tipo: "jogador" | "responsavel";
  conferirPrazo: () => Promise<Date>;
};
const JANELA = 30 * 86_400_000;
function comAutor<T>(
  autor: AutorDoProtocolo,
  leitura: boolean,
  executar: (tx: Transacao, contexto: Contexto) => Promise<T>,
) {
  if (autor.tipo === "jogador")
    return comJogadorSocial(autor.jogador, null, (tx, atual) =>
      executar(tx, {
        perfilId: atual.origem.id,
        contaId: atual.contaId,
        tipo: "jogador",
        conferirPrazo: atual.conferirPrazo,
      }),
    );
  return comGestorDaRestricao(autor.nativo, autor.perfilId, leitura, (tx, atual) =>
    executar(tx, {
      perfilId: autor.perfilId,
      contaId: atual.contaId,
      tipo: atual.tipo === "titular" ? "jogador" : "responsavel",
      conferirPrazo: atual.conferirPrazo,
    }),
  );
}

export function lerDenunciasDoProprioPerfil(autor: AutorDoProtocolo, protocolo?: string) {
  return comAutor(autor, true, async (tx, atual) => {
    const agora = await atual.conferirPrazo();
    const linhas = await tx
      .select({
        protocolo: reports.id,
        categoria: reports.category,
        situacao: reports.state,
        revisao: reports.revision,
        decisao: reports.decision,
        criadaEm: reports.createdAt,
        atualizadaEm: reports.updatedAt,
        recursoEm: reports.reviewRequestedAt,
        expiraEm: reports.expiresAt,
      })
      .from(reports)
      .where(
        and(
          eq(reports.reporterProfileId, atual.perfilId),
          gt(reports.expiresAt, agora),
          protocolo ? eq(reports.id, protocolo) : undefined,
        ),
      )
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(10);
    return {
      perfilId: atual.perfilId,
      denuncias: linhas.map((r) => {
        const prazo = new Date(Math.min(r.atualizadaEm.getTime() + JANELA, r.expiraEm.getTime()));
        const podePedirRevisao =
          r.situacao === "resolvida" && r.recursoEm === null && prazo > agora;
        return {
          protocolo: r.protocolo,
          categoria: r.categoria,
          situacao: r.situacao,
          revisao: r.revisao,
          decisao: r.decisao,
          recebidaEm: r.criadaEm.toISOString(),
          atualizadaEm: r.atualizadaEm.toISOString(),
          recursoEm: r.recursoEm?.toISOString() ?? null,
          podePedirRevisao,
          prazoParaRevisao: podePedirRevisao ? prazo.toISOString() : null,
        };
      }),
    };
  });
}

export function pedirRevisaoDaDenunciaNoBanco(
  autor: AutorDoProtocolo,
  entrada: RevisaoDeDenuncia,
): Promise<RecursoRecebido> {
  return comAutor(autor, false, async (tx, atual) => {
    const [caso] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.id, entrada.protocolo), eq(reports.reporterProfileId, atual.perfilId)))
      .for("update");
    const agora = await atual.conferirPrazo();
    assertAllowed(
      caso && caso.expiresAt > agora,
      "PROTOCOLO",
      "Protocolo indisponível para este perfil.",
    );
    const hash = createHash("sha256")
      .update("recreio:safety-review:v1:")
      .update(
        JSON.stringify([caso.id, entrada.versaoDoCaso, atual.perfilId, atual.contaId, atual.tipo]),
      )
      .digest("hex");
    if (caso.reviewClientKey === entrada.recursoId) {
      assertAllowed(
        caso.reviewRequestHash === hash &&
          caso.reviewActorUserId === atual.contaId &&
          caso.reviewActorKind === atual.tipo &&
          caso.reviewRevision === entrada.versaoDoCaso + 1,
        "CONFLITO",
        "Esta tentativa mudou ou não tem prova de repetição. Confira o protocolo atual.",
      );
      return { protocolo: caso.id, repetido: true };
    }
    assertAllowed(
      caso.state === "resolvida" &&
        caso.revision === entrada.versaoDoCaso &&
        caso.reviewRequestedAt === null &&
        caso.updatedAt.getTime() + JANELA > agora.getTime(),
      "CONFLITO",
      "O caso mudou, já recebeu revisão ou passou do prazo. Confira a resposta atual.",
    );
    const revisao = caso.revision + 1;
    await tx
      .update(reports)
      .set({
        state: "recurso",
        revision: revisao,
        updatedAt: agora,
        reviewRequestedAt: agora,
        reviewClientKey: entrada.recursoId,
        reviewRevision: revisao,
        reviewActorUserId: atual.contaId,
        reviewActorKind: atual.tipo,
        reviewRequestHash: hash,
      })
      .where(eq(reports.id, caso.id));
    await logAuditEventStrict(
      "recreio.safety_review_requested",
      atual.contaId,
      {
        app: "recreio",
        reportId: caso.id,
        profileId: atual.perfilId,
        revision: revisao,
        actorKind: atual.tipo,
      },
      { writer: tx },
    );
    const fim = await atual.conferirPrazo();
    assertAllowed(
      caso.expiresAt > fim && caso.updatedAt.getTime() + JANELA > fim.getTime(),
      "CONFLITO",
      "O prazo da revisão terminou durante o pedido. Confira o protocolo.",
    );
    return { protocolo: caso.id, repetido: false };
  });
}
