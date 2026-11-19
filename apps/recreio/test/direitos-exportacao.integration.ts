import { randomBytes, randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioPersonalExports as exports,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { capturarDadosPessoaisDoPerfil } from "@/features/direitos/captura-perfil-repository";
import {
  admitirDownloadPessoalNoBanco,
  carregarCopiaPessoalNoBanco,
  expurgarCopiasPessoaisVencidas,
  publicarCopiaPessoalNoBanco,
} from "@/features/direitos/exportacao-repository";
import {
  abrirArquivoPessoal,
  prepararArquivoPessoal,
  revogarArquivoPessoal,
} from "@/features/direitos/exportacao-service";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { loginReal, novaConta } from "./apoio";

async function adulto() {
  const conta = await novaConta(),
    login = await loginReal(conta),
    contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native session absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const { perfil } = await criarPerfilProprio(autor, {
    apelido: "Apelido pessoal para exportar",
    avatar: "padrao",
  });
  return { conta, autor, perfil };
}
async function cenario(
  executar: (
    f: Awaited<ReturnType<typeof adulto>> & { cifrador: ReturnType<typeof criarCifradorDeObjetos> },
  ) => Promise<void>,
) {
  const key = randomBytes(32),
    cifrador = criarCifradorDeObjetos({
      chaveAtiva: "fixture",
      chaves: new Map([["fixture", key]]),
      limiteBytes: 32 * 1024 * 1024,
    });
  key.fill(0);
  try {
    await executar({ ...(await adulto()), cifrador });
  } finally {
    cifrador.encerrar();
  }
}

describe("direitos: artefato temporário pessoal", () => {
  it("guarda somente envelope cifrado e repete o mesmo arquivo; UUID não concede acesso a outro adulto", async () =>
    cenario(async (f) => {
      const pedido = { copiaId: randomUUID(), perfilId: f.perfil.id },
        outra = await adulto();
      const recibo = await prepararArquivoPessoal(f.autor, pedido, f.cifrador);
      const [linha] = await db.select().from(exports).where(eq(exports.id, pedido.copiaId));
      expect(linha?.encryptedBytes?.includes(Buffer.from("Apelido pessoal para exportar"))).toBe(
        false,
      );
      expect(await prepararArquivoPessoal(f.autor, pedido, f.cifrador)).toEqual(recibo);
      expect(
        (await db.select().from(exports).where(eq(exports.id, pedido.copiaId)))[0]?.encryptedBytes,
      ).toEqual(linha?.encryptedBytes);
      const bytes = await abrirArquivoPessoal(f.autor, { copiaId: pedido.copiaId }, f.cifrador);
      try {
        expect(bytes.toString("utf8")).toContain("Apelido pessoal para exportar");
        expect(bytes.toString("utf8")).not.toContain(f.autor.login.authSessionId);
      } finally {
        bytes.fill(0);
      }
      await expect(
        abrirArquivoPessoal(outra.autor, { copiaId: pedido.copiaId }, f.cifrador),
      ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
      await expect(
        prepararArquivoPessoal(f.autor, { ...pedido, perfilId: outra.perfil.id }, f.cifrador),
      ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
    }));
  it("revogar durante a abertura impede admitir a resposta e apaga o envelope", async () =>
    cenario(async (f) => {
      const pedido = { copiaId: randomUUID(), perfilId: f.perfil.id };
      await prepararArquivoPessoal(f.autor, pedido, f.cifrador);
      const envelope = await carregarCopiaPessoalNoBanco(f.autor, pedido.copiaId),
        bytes = f.cifrador.abrir(envelope.referencia, envelope.bytes);
      try {
        await revogarArquivoPessoal(f.autor, { copiaId: pedido.copiaId });
        await expect(
          admitirDownloadPessoalNoBanco(f.autor, pedido.copiaId, envelope.referencia),
        ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
        expect(
          (await db.select().from(exports).where(eq(exports.id, pedido.copiaId)))[0],
        ).toMatchObject({ state: "revoked", encryptedBytes: null, reference: null });
      } finally {
        envelope.bytes.fill(0);
        bytes.fill(0);
      }
    }));
  it("mudança de política após a captura recusa a publicação sem armazenar bytes", async () =>
    cenario(async (f) => {
      const captura = await capturarDadosPessoaisDoPerfil(f.autor, f.perfil.id),
        copiaId = randomUUID(),
        cifrada = f.cifrador.cifrar({ tipo: "exportacao", id: copiaId }, captura.bytes);
      try {
        await db
          .update(profiles)
          .set({ policyVersion: sql`${profiles.policyVersion}+1` })
          .where(eq(profiles.id, f.perfil.id));
        await expect(
          publicarCopiaPessoalNoBanco(f.autor, copiaId, captura, cifrada),
        ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
        expect(await db.select().from(exports).where(eq(exports.id, copiaId))).toHaveLength(0);
      } finally {
        captura.bytes.fill(0);
        cifrada.bytes.fill(0);
      }
    }));
  it("contexto infantil e prazo vencido impedem download; manutenção retira os bytes", async () =>
    cenario(async (f) => {
      const pedido = { copiaId: randomUUID(), perfilId: f.perfil.id };
      await prepararArquivoPessoal(f.autor, pedido, f.cifrador);
      await db
        .update(devices)
        .set({ minorContextGeneration: randomUUID() })
        .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
      await expect(
        abrirArquivoPessoal(f.autor, { copiaId: pedido.copiaId }, f.cifrador),
      ).rejects.toMatchObject({ code: "AUTH" });
      await db
        .update(devices)
        .set({ minorContextGeneration: null })
        .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
      await db
        .update(exports)
        .set({
          capturedAt: sql`${exports.capturedAt}-interval '11 minutes'`,
          expiresAt: sql`${exports.expiresAt}-interval '11 minutes'`,
          createdAt: sql`${exports.createdAt}-interval '11 minutes'`,
        })
        .where(eq(exports.id, pedido.copiaId));
      await expect(
        abrirArquivoPessoal(f.autor, { copiaId: pedido.copiaId }, f.cifrador),
      ).rejects.toMatchObject({ code: "COPIA_INDISPONIVEL" });
      expect((await expurgarCopiasPessoaisVencidas()).expiradas).toBeGreaterThanOrEqual(1);
      expect(
        (await db.select().from(exports).where(eq(exports.id, pedido.copiaId)))[0],
      ).toMatchObject({ state: "expired", encryptedBytes: null, reference: null });
    }));
  it("falha de auditoria ao substituir mantém o arquivo anterior e não publica o novo", async () =>
    cenario(async (f) => {
      const primeiro = { copiaId: randomUUID(), perfilId: f.perfil.id },
        segundo = { copiaId: randomUUID(), perfilId: f.perfil.id };
      await prepararArquivoPessoal(f.autor, primeiro, f.cifrador);
      await db.execute(
        sql`create function audit.recusar_exportacao_fixture() returns trigger language plpgsql as $$ begin if new.event_type='recreio.personal_export_published' then raise exception 'fixture'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_exportacao_fixture before insert on audit.events for each row execute function audit.recusar_exportacao_fixture()`,
      );
      try {
        await expect(prepararArquivoPessoal(f.autor, segundo, f.cifrador)).rejects.toBeInstanceOf(
          AuditPersistenceError,
        );
      } finally {
        await db.execute(sql`drop trigger recusar_exportacao_fixture on audit.events`);
        await db.execute(sql`drop function audit.recusar_exportacao_fixture()`);
      }
      expect(
        (await db.select().from(exports).where(eq(exports.id, primeiro.copiaId)))[0]?.state,
      ).toBe("ready");
      expect(await db.select().from(exports).where(eq(exports.id, segundo.copiaId))).toHaveLength(
        0,
      );
    }));
});
