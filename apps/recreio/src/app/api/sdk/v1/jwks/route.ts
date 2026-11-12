import { respostaDeErro } from "@/lib/http";
import { chavesDoRecreio } from "@/lib/tokens";

// As chaves vêm do ambiente de quem está servindo, nunca do build.
export const dynamic = "force-dynamic";

/** As chaves públicas dos tokens do Recreio: a atual e as anteriores, para o servidor de um jogo conferir a sessão. */
export async function GET() {
  try {
    const { jwks } = await chavesDoRecreio();
    return Response.json(jwks, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
