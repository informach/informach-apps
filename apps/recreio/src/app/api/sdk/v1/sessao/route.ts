import { TrocaDeIngressoSchema } from "@informach/recreio/contrato";
import { trocarIngresso } from "@/features/sessao-de-jogo/service";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Troca o ingresso pela sessão de jogo. Quem autentica é o ingresso, que vale uma vez. */
export function POST(request: Request) {
  return responder(async () =>
    json(await trocarIngresso(await corpoJson(request, TrocaDeIngressoSchema, 8192))),
  );
}
