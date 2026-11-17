"use server";
import { PerfilIdSchema } from "@informach/recreio";
import { jogadorDoAparelho } from "@/features/autoridade-de-jogo/http";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import { pedirRevisaoDaDenuncia } from "./acompanhamento-service";

export async function reverDenunciaAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () => {
    const esperado = PerfilIdSchema.parse(perfilId),
      atual = await jogadorDoAparelho();
    assertAllowed(
      atual.perfil.id === esperado,
      "CONFLITO",
      "Quem está jogando mudou. Reabra esta página antes de continuar.",
    );
    return pedirRevisaoDaDenuncia(
      {
        tipo: "jogador",
        jogador: {
          perfilId: atual.perfil.id,
          sessaoDeAparelhoId: atual.sessaoDeAparelhoId,
        },
      },
      entrada,
    );
  });
}
export async function reverDenunciaComoGestorAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () =>
    pedirRevisaoDaDenuncia(
      { tipo: "gestor", nativo: await autorDaFamilia(), perfilId: PerfilIdSchema.parse(perfilId) },
      entrada,
    ),
  );
}
