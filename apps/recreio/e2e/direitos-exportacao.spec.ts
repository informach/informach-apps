import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import { hidratado, novaPessoa, tela } from "./apoio";

test("cópia pessoal real em 390 px: prepara, baixa e revoga sem URL pública", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Perfil da cópia"),
    b = await novaPessoa(browser, "Outro adulto");
  try {
    const page = a.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/conta/dados");
    const regiao = page.getByRole("region", { name: "Uma cópia dos dados do perfil", exact: true });
    const preparar = regiao.getByRole("button", { name: "Preparar cópia do perfil", exact: true });
    await hidratado(preparar);
    await regiao
      .getByLabel("Perfil da cópia", { exact: true })
      .selectOption({ label: "Perfil da cópia — meu perfil" });
    await preparar.click();
    await expect(regiao.getByText("Cópia preparada", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await tela(page, "direitos-copia-pessoal-390", { paginaInteira: true });
    const pedidoPromise = page.waitForRequest(
      (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/conta/dados/copia",
    );
    const downloadPromise = page.waitForEvent("download");
    await regiao.getByRole("button", { name: "Baixar cópia do perfil", exact: true }).click();
    const download = await downloadPromise,
      pedido = z
        .strictObject({ copiaId: z.uuid() })
        .parse(JSON.parse((await pedidoPromise).postData() ?? "null"));
    expect(download.suggestedFilename()).toBe("recreio-perfil.jsonl");
    const caminho = await download.path();
    if (!caminho) throw new Error("Download absent");
    const conteudo = await readFile(caminho, "utf8");
    expect(conteudo).toContain("Perfil da cópia");
    expect(conteudo).not.toContain(a.email);
    expect(conteudo).not.toContain(b.email);
    expect(conteudo).not.toContain("Outro adulto");
    expect(conteudo).not.toContain("authSessionId");
    await b.page.goto("/conta/dados");
    const alheia = await b.page.evaluate(async (p) => {
      const r = await fetch("/api/conta/dados/copia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      return { status: r.status, texto: await r.text() };
    }, pedido);
    expect(alheia.status).toBe(400);
    expect(alheia.texto).toContain("COPIA_INDISPONIVEL");
    await regiao.getByRole("button", { name: "Revogar cópia", exact: true }).click();
    await expect(
      regiao.getByText("Cópia revogada. O arquivo temporário foi retirado do servidor.", {
        exact: true,
      }),
    ).toBeVisible();
    const revogada = await page.evaluate(async (p) => {
      const r = await fetch("/api/conta/dados/copia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      return { status: r.status, texto: await r.text() };
    }, pedido);
    expect(revogada.status).toBe(400);
    expect(revogada.texto).toContain("COPIA_INDISPONIVEL");
  } finally {
    await a.contexto.close();
    await b.contexto.close();
  }
});
