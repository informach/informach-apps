import "server-only";
import { and, eq, ne } from "@informach/db";
import { recreioSpaceMembers as members, recreioProfiles as profiles } from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import { convitesAguardandoOMundo } from "./convites-dirigidos-gestao-repository";
import type { AutorDaGestaoDeMundo } from "./gestao-nativa-autor";
import { comGestaoNativaDoMundo } from "./gestao-nativa-repository";

export async function painelDeGestaoComConvites(
  autor: AutorDaGestaoDeMundo,
  mundoId: unknown,
  consulta: unknown,
) {
  const painel = await painelDeAdministracaoDoMundo(autor, mundoId);
  const filaDeConvites = await convitesAguardandoOMundo(autor, mundoId, consulta);
  return { ...painel, filaDeConvites };
}

export function painelDeAdministracaoDoMundo(autor: AutorDaGestaoDeMundo, mundoId: unknown) {
  const id = MundoIdSchema.parse(mundoId);
  return comGestaoNativaDoMundo(
    autor,
    id,
    undefined,
    async (tx, ctx) => {
      const participacoes = await tx
        .select({
          id: members.id,
          apelido: profiles.nickname,
          papel: members.role,
          estado: members.state,
          tipo: profiles.kind,
          estadoDoPerfil: profiles.status,
        })
        .from(members)
        .leftJoin(profiles, eq(profiles.id, members.profileId))
        .where(and(eq(members.spaceId, id), ne(members.state, "former")))
        .orderBy(members.joinedAt, members.id)
        .limit(20);
      return {
        mundo: { id, nome: ctx.mundo.name, estado: ctx.mundo.status },
        revisao: ctx.mundo.managementRevision,
        membrosConvidam: ctx.mundo.membersInvite,
        podeAlterar: ctx.responsavel,
        perfilGeridoId: ctx.porResponsavel ? autor.perfilId : null,
        participacoes: participacoes.map((p) => ({
          id: p.id,
          apelido: p.apelido ?? "Participante sem perfil",
          papel: p.papel,
          podeCoadministrar:
            p.id !== ctx.proprio.id &&
            p.papel !== "steward" &&
            p.tipo === "adult" &&
            p.estadoDoPerfil === "active",
        })),
      };
    },
    true,
  );
}
