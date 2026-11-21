import "server-only";
import type { configuracaoDaMigracaoDeFotografias } from "@/lib/object-migration-environment";
import {
  ConfiguracaoPublicaDoLeitorSchema,
  configuracaoPublicaDoLeitor,
} from "@/lib/object-reader-configuration";

/** Fixed route, no redirects/auth, bounded body and duration. This attests the
 * deployed reader composition only; upload verification still reads the object. */
export async function conferirLeitorPublicado(
  config: NonNullable<ReturnType<typeof configuracaoDaMigracaoDeFotografias>>,
  signal?: AbortSignal,
) {
  let resposta: Response | undefined;
  const partes: Buffer[] = [];
  try {
    resposta = await fetch(`${config.readerOrigin}/api/objetos/configuracao`, {
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
    });
    if (
      resposta.status !== 200 ||
      !/^application\/json(?:\s*;|$)/i.test(resposta.headers.get("content-type") ?? "") ||
      !resposta.body ||
      Number(resposta.headers.get("content-length")) > 2048
    )
      throw new Error();
    let tamanho = 0;
    const leitor = resposta.body.getReader();
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        tamanho += value.byteLength;
        if (tamanho > 2048) throw new Error();
        partes.push(Buffer.from(value));
      }
    } finally {
      await leitor.cancel().catch(() => {});
      leitor.releaseLock();
    }

    const atual = ConfiguracaoPublicaDoLeitorSchema.parse(
      JSON.parse(Buffer.concat(partes).toString("utf8")),
    );
    const esperado = configuracaoPublicaDoLeitor(config.objetos, config.readerSource);
    if (
      atual.source !== esperado.source ||
      atual.reader.scope !== esperado.reader.scope ||
      atual.reader.bucketId !== esperado.reader.bucketId ||
      atual.reader.activeKey !== esperado.reader.activeKey ||
      JSON.stringify(atual.reader.keys) !== JSON.stringify(esperado.reader.keys)
    )
      throw new Error();
  } catch {
    throw new Error("Published snapshot reader not confirmed");
  } finally {
    for (const parte of partes) parte.fill(0);
    if (resposta?.body) await resposta.body.cancel().catch(() => {});
  }
}
