// Quadros da aula como a exportação desenha (get_frame composto): ctx.state.quadros = [segundos...].
// Salva <telas>/quadro-<t>.jpg e devolve os caminhos.
import { writeFileSync } from "node:fs";
import { chamar } from "./ia.mjs";

export default async function quadro(ctx) {
  const out = [];
  for (const t of ctx.state.quadros ?? []) {
    const r = await chamar(ctx, "get_frame", {
      time: t,
      composited: true,
      max_width: ctx.state.largura ?? 960,
    });
    const img = r?.images?.[0];
    const b64 = typeof img === "string" ? img : (img?.data ?? img?.base64);
    if (!b64) {
      out.push(`${t}: sem imagem (${String(r?.text ?? "").slice(0, 160)})`);
      continue;
    }
    const f = `${ctx.shots}/quadro-${t}.jpg`;
    writeFileSync(f, Buffer.from(b64.replace(/^data:[^,]+,/, ""), "base64"));
    out.push(f);
  }
  return out;
}
