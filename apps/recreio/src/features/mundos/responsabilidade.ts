import "server-only";
import { MembroIdSchema, MundoIdSchema } from "@informach/recreio";
import { z } from "zod";
import { lerPainelDeResponsabilidade } from "./responsabilidade-painel-repository";
import {
  type AutorDaResponsabilidade,
  proporResponsabilidade,
  responderResponsabilidade,
} from "./responsabilidade-repository";
import type { AutorDaSaida } from "./saida-repository";

export function painelDaResponsabilidade(autor: AutorDaSaida, mundoId: unknown) {
  return lerPainelDeResponsabilidade(autor, MundoIdSchema.parse(mundoId));
}

export function proporTransferencia(
  autor: AutorDaResponsabilidade,
  mundoId: unknown,
  membroId: unknown,
) {
  return proporResponsabilidade(
    autor,
    MundoIdSchema.parse(mundoId),
    MembroIdSchema.parse(membroId),
  );
}

export function responderTransferencia(
  autor: AutorDaResponsabilidade,
  mundoId: unknown,
  pedidoId: unknown,
  resposta: unknown,
) {
  return responderResponsabilidade(
    autor,
    MundoIdSchema.parse(mundoId),
    z.uuid().parse(pedidoId),
    z.enum(["accepted", "declined", "revoked"]).parse(resposta),
  );
}
