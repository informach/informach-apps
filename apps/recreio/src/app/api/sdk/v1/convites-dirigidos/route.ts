import {
  ConsultaDeConvitesDirigidosSchema,
  MutacaoDeConviteDirigidoSchema,
} from "@informach/recreio/contrato";
import {
  consultarCaixaPeloSdk,
  executarConvitePeloSdk,
} from "@/features/mundos/convites-dirigidos-http";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return responder(async () => {
    const autor = await sessaoDeJogo(request);
    const consulta = ConsultaDeConvitesDirigidosSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return json(await consultarCaixaPeloSdk(autor, consulta));
  });
}
export function POST(request: Request) {
  return responder(async () => {
    const autor = await sessaoDeJogo(request);
    return json(
      await executarConvitePeloSdk(
        autor,
        await corpoJson(request, MutacaoDeConviteDirigidoSchema, 4096),
      ),
    );
  });
}
