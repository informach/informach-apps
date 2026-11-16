import { writeFile } from "node:fs/promises";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { entrar } from "./apoio";

async function registrar(page: Page, info: TestInfo, nome: string) {
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
  const arquivo = info.outputPath(`${nome}.json`);
  await writeFile(arquivo, JSON.stringify(dados, null, 2));
  await info.attach(nome, { path: arquivo, contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`${nome}.png`) });
  return dados;
}

test("nomes na cena com editor compacto após pintar e reabrir, no computador e celular", async ({
  page,
}, info) => {
  const arte = process.env.MORADA_E2E_ARTE === "1";
  const apelido = "Rótulos da casa";
  await page.setViewportSize({ width: 1365, height: 900 });
  await entrar(page, apelido, undefined, arte);
  const pausa = await page.evaluate(() =>
    window.__morada?.comandar(null, { t: "votar_velocidade", velocidade: 0 }),
  );
  expect(pausa?.ok).toBe(true);
  await page.getByRole("button", { name: "Decorar", exact: true }).click();
  const painel = page.getByRole("region", { name: "Decoração da casa" });
  await painel.getByRole("button", { name: /Mesa lateral.*M\$/ }).click();
  await painel.getByLabel("Largura (m)", { exact: true }).fill("3.5");
  await expect(painel.getByLabel("Posição da prévia", { exact: true })).toContainText("3,5 ×");
  await painel.getByLabel("Profundidade (m)", { exact: true }).fill("5");
  await expect(painel.getByLabel("Posição da prévia", { exact: true })).toHaveText(
    "3,5 × 5 m · 0°",
  );
  await painel.getByRole("button", { name: /Girar 90°/ }).click();
  await painel.getByRole("button", { name: /Comprar por M\$/ }).click();
  await expect(painel.getByText("Edição confirmada.", { exact: true })).toBeVisible();
  await painel.getByRole("button", { name: /Na casa/ }).click();
  await painel
    .getByRole("button", { name: /Mesa lateral redonda Peça \d+$/ })
    .last()
    .click();
  if (arte) {
    await painel.getByRole("button", { name: "Pintar", exact: true }).click();
    await painel.getByLabel("Cor do móvel").fill("#000000");
    await painel.getByRole("button", { name: "Aplicar pintura", exact: true }).click();
    await expect(painel.getByText("Edição confirmada.", { exact: true })).toBeVisible();
  } else {
    // O preset público não oferece pintura sem o catálogo privado homologado.
    await expect(painel.getByRole("button", { name: "Pintar", exact: true })).toBeDisabled();
  }
  // Remonta renderer, HUD e ativos; o servidor conserva o mundo em memória.
  // Restauração durável do processo continua na jornada do portal com PostgreSQL.
  await entrar(page, apelido, undefined, arte);
  for (const formato of [
    { nome: "computador", width: 1365, height: 900 },
    { nome: "celular", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: formato.width, height: formato.height });
    await page.getByRole("button", { name: "Decorar", exact: true }).click();
    await painel.getByRole("button", { name: /Na casa/ }).click();
    await painel
      .getByRole("button", { name: /Mesa lateral redonda Peça \d+$/ })
      .last()
      .click();
    await painel.getByRole("button", { name: arte ? "Pintar" : "Mover", exact: true }).click();
    if (arte) await expect(painel.getByLabel("Cor do móvel")).toHaveValue("#000000");
    await page.getByRole("button", { name: "Vista superior", exact: true }).click();
    await painel.getByRole("button", { name: "Ver prévia na casa" }).click();
    try {
      if (arte)
        await expect
          .poll(() => page.evaluate(() => window.__morada?.medidas().rotulos.comArte ?? 0))
          .toBeGreaterThanOrEqual(4);
      const antes = await page.evaluate(() => window.__morada?.medidas().quadros ?? 0);
      await expect
        .poll(() => page.evaluate(() => window.__morada?.medidas().quadros ?? 0))
        .toBeGreaterThan(antes + 1);
    } finally {
      // Preservar projeção e captura inclusive quando a arte ou o desenho falham.
      await registrar(page, info, `rotulos-restaurados-${formato.nome}`);
    }
    const rotulos = await page.evaluate(() => window.__morada?.medidas().rotulos);
    expect(rotulos?.moradores).toBeGreaterThan(0);
    expect(rotulos?.exibidos).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Decorar", exact: true }).click();
    await expect(painel).toBeHidden();
    await expect(page.getByRole("button", { name: "Vista superior", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }
});
