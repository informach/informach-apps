import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Rede de segurança do `share_target`.
 *
 * Quem recebe o POST do sistema é o service worker, que guarda o conteúdo no
 * aparelho e segue para a revisão. Esta rota existe para a primeira vez — antes
 * de o worker assumir o controle — e para quando ele está desligado: em vez do
 * erro do navegador, a pessoa cai na tela de importação com o texto já colado.
 *
 * O arquivo não sobrevive a este caminho, e a tela diz isso. Guardá-lo aqui
 * significaria subir para o servidor um anexo que ninguém conferiu ainda, que é
 * exatamente o que o fluxo de revisão existe para evitar.
 */
export async function POST(request: Request) {
  let text = "";
  try {
    const form = await request.formData();
    text = [form.get("title"), form.get("text"), form.get("url")]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean)
      .filter((part, index, all) => all.indexOf(part) === index)
      .join("\n")
      .slice(0, 4000);
  } catch {
    // Sem corpo legível, a importação abre vazia.
  }
  const target = new URL("/recados/novo", request.url);
  target.searchParams.set("modo", "colar");
  if (text) target.searchParams.set("texto", text);
  return NextResponse.redirect(target, 303);
}
