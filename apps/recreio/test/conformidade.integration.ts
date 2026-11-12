import type { LimitesDoJogo } from "@informach/config/jogos";
import { and, asc, db, eq, isNull, sql } from "@informach/db";
import {
  recreioGameSessions as gameSessions,
  recreioSpaceJournal as journal,
  recreioSpaceLeases as leases,
  recreioSpaceMembers as members,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import {
  ErroDoRecreio,
  InstanciaIdSchema,
  MembroIdSchema,
  type MundoId,
  type PerfilId,
  PerfilIdSchema,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import { ResumoDoMundoSchema } from "@informach/recreio/contrato";
import { criarClienteDoHost } from "@informach/recreio/host";
import type { EstadoDoMundoFalso } from "@informach/recreio/testing";
import {
  type AmbienteDoHost,
  descreverConformidadeDoHost,
} from "@informach/recreio/testing/conformidade";
import { vi } from "vitest";
import { segredoDoHost } from "@/features/jogos/config";
import { aceitarConvite, criarConvite, criarMundo } from "@/features/mundos/service";
import { abrirMundo } from "@/features/posse/service";
import { encerrarSessaoDeJogo } from "@/features/sessao-de-jogo/repository";
import { emitirIngresso, trocarIngresso } from "@/features/sessao-de-jogo/service";
import { aposentarInstancias, avancarRelogio, type Jogador, novoJogador } from "./apoio";
import { despachar, ORIGEM } from "./rotas";

/**
 * A prova do lote P6: a mesma suíte de conformidade que a plataforma em
 * memória passa, rodando contra o Recreio de verdade. O `ClienteDoHost` é o
 * cliente HTTP real, com um `fetch` que entrega cada pedido à rota do app
 * dentro do processo; o banco é o descartável dos testes de integração.
 *
 * Duas coisas são trocadas para a suíte, sem tocar no manifesto nem no app:
 * os tetos de tamanho do jogo (a suíte pede tetos pequenos) e o endereço
 * público aceito no registro (a suíte registra `wss://a.test` e `wss://b.test`
 * para o mesmo jogo; o app aceita só o endereço configurado, e essa regra tem
 * teste próprio em `posse.integration.ts`).
 */

const troca = vi.hoisted(() => ({ limites: {} as Partial<LimitesDoJogo> }));

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  return {
    ...real,
    jogoPorId(id: string) {
      const manifesto = real.jogoPorId(id);
      return manifesto && { ...manifesto, limites: { ...manifesto.limites, ...troca.limites } };
    },
  };
});

vi.mock("@/features/jogos/config", async (original) => ({
  ...(await original<typeof import("@/features/jogos/config")>()),
  enderecoDaInstanciaAceito: () => true,
}));

const JOGO_PADRAO = "morada";

async function criarAmbiente(
  opcoes: { limites?: Partial<LimitesDoJogo> } = {},
): Promise<AmbienteDoHost> {
  troca.limites = opcoes.limites ?? {};
  await aposentarInstancias();
  const jogadores = new Map<PerfilId, Jogador>();
  const jogoDoMundo = new Map<MundoId, string>();

  function jogador(perfilId: PerfilId): Jogador {
    const achado = jogadores.get(perfilId);
    if (!achado) throw new ErroDoRecreio("SEM_PERFIL");
    return achado;
  }

  return {
    avancar: avancarRelogio,

    async criarPerfil(dados = {}) {
      const novo = await novoJogador({
        apelido: dados.apelido ?? `Perfil ${jogadores.size + 1}`,
        avatar: dados.avatar,
      });
      jogadores.set(novo.perfil.id, novo);
      return novo.perfil.id;
    },

    async criarMundo({ criador, jogo = JOGO_PADRAO, nome = "Mundo de teste" }) {
      const mundo = await criarMundo({ perfilId: jogador(criador).perfil.id, jogo }, { nome });
      jogoDoMundo.set(mundo.id, jogo);
      return mundo.id;
    },

    // Um membro entra como no produto: o responsável convida e o perfil aceita.
    async adicionarMembro(mundoId, perfilId, dados = {}) {
      const [mundo] = await db
        .select({ steward: spaces.stewardProfileId })
        .from(spaces)
        .where(eq(spaces.id, mundoId));
      if (!mundo?.steward) throw new ErroDoRecreio("NAO_ENCONTRADO");
      const convite = await criarConvite(
        { perfilId: PerfilIdSchema.parse(mundo.steward), jogo: null },
        mundoId,
        {
          forma: "member",
          ...(dados.participacao ? { participacao: dados.participacao } : {}),
        },
      );
      await aceitarConvite({ perfilId: jogador(perfilId).perfil.id }, { codigo: convite.codigo });
      const [membro] = await db
        .update(members)
        .set({ role: dados.papel ?? "member" })
        .where(and(eq(members.spaceId, mundoId), eq(members.profileId, perfilId)))
        .returning({ id: members.id });
      if (!membro) throw new ErroDoRecreio("NAO_MEMBRO");
      return MembroIdSchema.parse(membro.id);
    },

    async mudarEstadoDoMembro(mundoId, perfilId, estado) {
      const mudados = await db
        .update(members)
        .set({ state: estado })
        .where(and(eq(members.spaceId, mundoId), eq(members.profileId, perfilId)))
        .returning({ id: members.id });
      if (mudados.length === 0) throw new ErroDoRecreio("NAO_MEMBRO");
    },

    // A sessão de jogo nasce como no produto: ingresso e troca.
    async abrirSessao(perfilId, jogo = JOGO_PADRAO) {
      const { ingresso } = await emitirIngresso(jogador(perfilId).ator, { jogo });
      await trocarIngresso({ ingresso, continuarAqui: true });
      const [sessao] = await db
        .select({ id: gameSessions.id })
        .from(gameSessions)
        .where(and(eq(gameSessions.profileId, perfilId), isNull(gameSessions.endedAt)));
      return SessaoDeJogoIdSchema.parse(sessao?.id);
    },

    async encerrarSessao(sid, motivo = "left") {
      await encerrarSessaoDeJogo({ sid, motivo, porQuem: "recreio" });
    },

    async abrirMundo(mundoId, perfilId) {
      const aberto = await abrirMundo(
        { perfilId, jogo: jogoDoMundo.get(mundoId) ?? JOGO_PADRAO },
        mundoId,
      );
      return { endereco: aberto.endereco, cerca: aberto.cerca };
    },

    cliente(jogo = JOGO_PADRAO) {
      return criarClienteDoHost({
        baseUrl: ORIGEM,
        jogo,
        segredo: segredoDoHost(jogo) ?? "",
        fetch: despachar,
      });
    },

    async mundo(mundoId): Promise<EstadoDoMundoFalso> {
      const [mundo] = await db.select().from(spaces).where(eq(spaces.id, mundoId));
      if (!mundo) throw new ErroDoRecreio("NAO_ENCONTRADO");
      const [posse] = await db
        .select({
          fence: leases.fence,
          instanceId: leases.instanceId,
          state: leases.state,
          expiresAt: leases.expiresAt,
          vigente: sql<boolean>`${leases.expiresAt} > clock_timestamp()`,
        })
        .from(leases)
        .where(and(eq(leases.spaceId, mundoId), isNull(leases.releasedAt)));
      const fotografias = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.spaceId, mundoId))
        .orderBy(asc(snapshots.revision));
      const diario = await db
        .select()
        .from(journal)
        .where(eq(journal.spaceId, mundoId))
        .orderBy(asc(journal.seq));
      const membros = await db
        .select()
        .from(members)
        .where(eq(members.spaceId, mundoId))
        .orderBy(asc(members.joinedAt), asc(members.id));
      const resumo = ResumoDoMundoSchema.safeParse(mundo.summary);
      return {
        estado: mundo.status,
        revisao: mundo.revision,
        diarioSeq: mundo.journalSeq,
        posse:
          posse && posse.state !== "released"
            ? {
                cerca: posse.fence,
                instanciaId: InstanciaIdSchema.parse(posse.instanceId),
                estado: posse.state,
                expiraEm: posse.expiresAt.getTime(),
                vigente: posse.vigente,
              }
            : null,
        fotografias: fotografias.map((foto) => ({
          revisao: foto.revision,
          diarioSeq: foto.journalSeq,
          tick: foto.tick,
          schemaVersion: foto.schemaVersion,
          tipo: foto.kind,
          bytes: foto.byteSize,
          sha256: foto.sha256,
        })),
        diario: diario.map((entrada) => ({
          seq: entrada.seq,
          tick: entrada.tick,
          fatoId: entrada.factId,
          bytes: new Uint8Array(entrada.payload),
        })),
        membros: membros.map((membro) => ({
          membroId: MembroIdSchema.parse(membro.id),
          perfilId: PerfilIdSchema.parse(membro.profileId),
          papel: membro.role,
          estado: membro.state,
          participacao: membro.participation,
        })),
        resumo: resumo.success ? resumo.data : null,
      };
    },
  };
}

descreverConformidadeDoHost("Recreio", criarAmbiente);
