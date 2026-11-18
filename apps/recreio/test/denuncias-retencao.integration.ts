import { AuditPersistenceError } from "@informach/auth";
import { db, eq, inArray, sql } from "@informach/db";
import { recreioSafetyReports as reports } from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  exigirFilaDeSegurancaEmDia,
  LOTE_DE_DENUNCIAS,
  limparDenuncias,
} from "@/features/moderacao/retencao-repository";
import { CHECAGEM, codigoDoBanco, novoJogador, sinal } from "./apoio";

const DIA = 86_400_000;
async function preparar(quantidade = 1) {
  const a = await novoJogador({ comAcesso: false }),
    b = await novoJogador({ comAcesso: false });
  const criado = new Date(Date.now() - 181 * DIA);
  return db
    .insert(reports)
    .values(
      Array.from({ length: quantidade }, () => ({
        reporterProfileId: a.perfil.id,
        targetProfileId: b.perfil.id,
        actorUserId: a.conta.id,
        actorKind: "jogador" as const,
        clientKey: crypto.randomUUID(),
        requestHash: "a".repeat(64),
        category: "outro" as const,
        priority: false,
        evidenceKind: "protecao" as const,
        createdAt: criado,
        updatedAt: criado,
        expiresAt: new Date(criado.getTime() + 180 * DIA),
      })),
    )
    .returning();
}

describe("denúncias têm retenção limitada, auditoria e falha por atendimento atrasado", () => {
  it("expurgo não chama pendência vencida de resolução; repetição não duplica efeito", async () => {
    const linhas = await preparar();
    const resultado = await limparDenuncias();
    expect(resultado.denunciasApagadas).toBeGreaterThanOrEqual(1);
    expect(resultado.denunciasVencidasSemSolucao).toBeGreaterThanOrEqual(1);
    expect(() => exigirFilaDeSegurancaEmDia(resultado)).toThrow(
      "moderacao.fila_de_seguranca_atrasada",
    );
    expect(
      await db
        .select()
        .from(reports)
        .where(
          inArray(
            reports.id,
            linhas.map((l) => l.id),
          ),
        ),
    ).toHaveLength(0);
    expect((await limparDenuncias()).denunciasApagadas).toBe(0);
  });
  it("prioridade com 24 horas e demais com 72 horas mantêm a operação em falha até atendimento", async () => {
    const linhas = await preparar(2),
      primeira = linhas[0],
      segunda = linhas[1];
    if (!primeira || !segunda) throw new Error("Denúncias ausentes");
    const agora = Date.now();
    for (const [linha, horas, prioridade] of [
      [primeira, 25, true],
      [segunda, 73, false],
    ] as const) {
      const criado = new Date(agora - horas * 3_600_000);
      await db
        .update(reports)
        .set({
          createdAt: criado,
          updatedAt: criado,
          expiresAt: new Date(agora + DIA),
          priority: prioridade,
        })
        .where(eq(reports.id, linha.id));
    }
    try {
      const primeiraLeitura = await limparDenuncias();
      expect(primeiraLeitura.denunciasPrioritariasAtrasadas).toBeGreaterThanOrEqual(1);
      expect(primeiraLeitura.denunciasAtrasadas).toBeGreaterThanOrEqual(1);
      expect(() => exigirFilaDeSegurancaEmDia(primeiraLeitura)).toThrow();
      // Outra execução conserva o aviso enquanto a fila não for atendida.
      const segundaLeitura = await limparDenuncias();
      expect(() => exigirFilaDeSegurancaEmDia(segundaLeitura)).toThrow();
      await db
        .update(reports)
        .set({ state: "resolvida" })
        .where(
          inArray(
            reports.id,
            linhas.map((l) => l.id),
          ),
        );
      const atendida = await limparDenuncias();
      expect(() => exigirFilaDeSegurancaEmDia(atendida)).not.toThrow();
    } finally {
      await db.delete(reports).where(
        inArray(
          reports.id,
          linhas.map((l) => l.id),
        ),
      );
    }
  });
  it("lote deixa linha disputada para próxima execução sem esperar a trava", async () => {
    while ((await limparDenuncias()).denunciasApagadas > 0) {
      /* esvazia somente recibos vencidos da fixture isolada */
    }
    const linhas = await preparar(LOTE_DE_DENUNCIAS + 1),
      primeira = linhas[0];
    if (!primeira) throw new Error("Denúncia ausente");
    const travada = sinal<void>(),
      soltar = sinal<void>();
    const bloqueio = db.transaction(async (tx) => {
      await tx.select().from(reports).where(eq(reports.id, primeira.id)).for("update");
      travada.concluir();
      await soltar.promessa;
    });
    await travada.promessa;
    try {
      expect((await limparDenuncias()).denunciasApagadas).toBe(LOTE_DE_DENUNCIAS);
    } finally {
      soltar.concluir();
      await bloqueio;
    }
    expect((await limparDenuncias()).denunciasApagadas).toBe(1);
  });
  it("falha de auditoria impede o expurgo", async () => {
    const linhas = await preparar(),
      primeira = linhas[0];
    if (!primeira) throw new Error("Denúncia ausente");
    await db.execute(
      sql`create function audit.falhar_expurgo_denuncia_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.safety_reports_purged' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_expurgo_denuncia_teste before insert on audit.events for each row execute function audit.falhar_expurgo_denuncia_teste()`,
    );
    try {
      await expect(limparDenuncias()).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await db.select().from(reports).where(eq(reports.id, primeira.id))).toHaveLength(1);
    } finally {
      await db.execute(sql`drop trigger falhar_expurgo_denuncia_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_expurgo_denuncia_teste()`);
      await limparDenuncias();
    }
  });
  it("banco recusa prova incompleta, prazo acima do teto e encerramento sem recibo", async () => {
    const linhas = await preparar(),
      primeira = linhas[0];
    if (!primeira) throw new Error("Denúncia ausente");
    expect(
      await codigoDoBanco(
        db
          .update(reports)
          .set({ evidenceKind: "amizade", evidenceRevision: null })
          .where(eq(reports.id, primeira.id)),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db
          .update(reports)
          .set({ expiresAt: new Date(primeira.createdAt.getTime() + 181 * DIA) })
          .where(eq(reports.id, primeira.id)),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.update(reports).set({ state: "encerrada" }).where(eq(reports.id, primeira.id)),
      ),
    ).toBe(CHECAGEM);
  });
});
