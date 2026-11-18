"use server";
import { PerfilIdSchema } from "@informach/recreio";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { administrarMundo } from "./administracao";
import { autorDaResponsabilidade } from "./responsabilidade-autor";

export async function administrarMundoAction(entrada: unknown) {
  return runAction(async () => administrarMundo(await autorDaResponsabilidade(), entrada));
}

export async function administrarMundoDoMenorAction(perfilId: unknown, entrada: unknown) {
  return runAction(async () =>
    administrarMundo(
      {
        responsavel: await autorDaFamilia(),
        perfilId: PerfilIdSchema.parse(perfilId),
      },
      entrada,
    ),
  );
}
