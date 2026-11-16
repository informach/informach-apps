import { expect, test } from "@playwright/test";
import { entrar } from "./apoio";

for (const formato of [
  { nome: "computador", width: 1365, height: 900 },
  { nome: "celular", width: 390, height: 844 },
]) {
  test(`nomes na cena com editor compacto no ${formato.nome}`, async ({ page }, info) => {
    await page.setViewportSize({ width: formato.width, height: formato.height });
    await entrar(page, `Rótulos ${formato.nome}`);
    const pausa = await page.evaluate(() =>
      window.__morada?.comandar(null, { t: "votar_velocidade", velocidade: 0 }),
    );
    expect(pausa?.ok).toBe(true);
    await page.getByRole("button", { name: "Decorar", exact: true }).click();
    const painel = page.getByRole("region", { name: "Decoração da casa" });
    await painel.getByRole("button", { name: /Mesa lateral.*M\$/ }).click();
    await page.getByRole("button", { name: "Vista superior", exact: true }).click();
    await painel.getByRole("button", { name: "Ver prévia na casa" }).click();
    const antes = await page.evaluate(() => window.__morada?.medidas().quadros ?? 0);
    await expect
      .poll(() => page.evaluate(() => window.__morada?.medidas().quadros ?? 0))
      .toBeGreaterThan(antes + 1);
    const dados = await page.evaluate(() => ({
      medidas: window.__morada?.medidas(),
      areas: [
        ...document.querySelectorAll(
          ".morada-painel, .morada-presenca, .morada-menu, .morada-aviso, .morada-faixa",
        ),
      ].map((elemento) => {
        const r = elemento.getBoundingClientRect();
        return { classe: elemento.className, x: r.x, y: r.y, largura: r.width, altura: r.height };
      }),
      ancoras: (window.__morada?.espelho()?.moradores.ordem ?? []).map((id) =>
        window.__morada?.telaDoMorador(id),
      ),
    }));
    await info.attach("projecao-e-hud", {
      body: JSON.stringify(dados, null, 2),
      contentType: "application/json",
    });
    await page.screenshot({ path: info.outputPath(`rotulos-${formato.nome}.png`) });
    expect(dados.medidas?.rotulos.moradores).toBeGreaterThan(0);
    expect(dados.medidas?.rotulos.exibidos).toBeGreaterThan(0);
  });
}
