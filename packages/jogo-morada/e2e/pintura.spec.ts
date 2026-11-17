import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("pintura atravessa GLTFLoader e instâncias preservando detalhes e RGB independente", async ({
  page,
}) => {
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  await page.goto("/pintura.html");
  await page.getByRole("button", { name: "Conferir pintura na GPU" }).click();
  const resultado = page.getByRole("status");
  await expect(resultado).toHaveAttribute("data-estado", "feito");
  const prova = JSON.parse(await resultado.innerText());
  expect(prova.erros).toEqual([]);
  expect(prova.medidas).toHaveLength(20);
  expect(prova.vidros).toHaveLength(2);
  for (const medida of prova.vidros) expect(medida.desvio, JSON.stringify(medida)).toBe(0);
  for (const medida of prova.medidas)
    expect(medida.desvio, JSON.stringify(medida)).toBeLessThanOrEqual(2);
  expect(erros).toEqual([]);
  const caminho = test.info().outputPath("pintura-sintetica.json");
  writeFileSync(caminho, `${JSON.stringify(prova, null, 2)}\n`);
  await test
    .info()
    .attach("pintura-sintetica.json", { path: caminho, contentType: "application/json" });
});
