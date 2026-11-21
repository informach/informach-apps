import { z } from "zod";

export const EtapaDaProvaDeSchema = z.enum([
  "INICIO",
  "DUMP",
  "COPIA",
  "CORRUPCAO",
  "CANCELAMENTO",
  "ROLLBACK",
  "IMPORTACAO",
  "CONTEUDO",
  "REPETICAO",
  "LIMPEZA",
  "EXPIRACAO",
]);
const Progresso = z.strictObject({
  formato: z.literal("recreio-prova-schema-etapa-v1"),
  etapa: EtapaDaProvaDeSchema,
  decorridoMs: z.number().int().min(0).max(900000),
});
export type EtapaDaProvaDeSchema = z.infer<typeof EtapaDaProvaDeSchema>;
export function informarEtapaDaProvaDeSchema(etapa: EtapaDaProvaDeSchema, inicio: number) {
  const frame = Progresso.parse({
    formato: "recreio-prova-schema-etapa-v1",
    etapa,
    decorridoMs: Math.floor(performance.now() - inicio),
  });
  process.stdout.write(`${JSON.stringify(frame)}\n`);
}
/** Only fixed technical frames may precede the one final receipt. A timeout
 * may end after a frame; no raw diagnostic/provider/row text is exposed. */
export function separarProgressoDaProvaDeSchema(saida: string) {
  try {
    if (saida.length > 32768) throw new Error();
    const linhas = saida
      .trim()
      .split("\n")
      .filter((l) => l.trim().length);
    let ultima: z.infer<typeof Progresso> | undefined, final: string | undefined;
    let quantidade = 0;
    const vistas = new Set<string>();
    for (const linha of linhas) {
      const body = JSON.parse(linha);
      if (body && typeof body === "object" && body.formato === "recreio-prova-schema-etapa-v1") {
        const frame = Progresso.parse(body);
        if (
          final !== undefined ||
          ++quantidade > 15 ||
          vistas.has(frame.etapa) ||
          (ultima && frame.decorridoMs < ultima.decorridoMs)
        )
          throw new Error();
        vistas.add(frame.etapa);
        ultima = frame;
      } else {
        if (final !== undefined) throw new Error();
        final = linha;
      }
    }
    return { ultima, final };
  } catch {
    throw new Error("Invalid private schema progress protocol");
  }
}
