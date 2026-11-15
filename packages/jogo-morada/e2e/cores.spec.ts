import { expect, test } from "@playwright/test";

test("cores V3 atravessam GLTFLoader e WebGL preservando máscaras, HDR e programas", async ({
  page,
}) => {
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  await page.goto("/cores.html");
  await page.getByRole("button", { name: "Conferir cores na GPU" }).click();
  const resultado = page.getByRole("status");
  await expect(resultado).toHaveAttribute("data-estado", "feito");
  const prova = JSON.parse(await resultado.innerText());
  expect(prova.erros).toEqual([]);
  expect(prova.medidas).toHaveLength(16);
  for (const medida of prova.medidas)
    expect(medida.desvio, JSON.stringify(medida)).toBeLessThanOrEqual(2);
  expect(erros).toEqual([]);
  await test.info().attach("cores-parametricas.json", {
    body: JSON.stringify(prova, null, 2),
    contentType: "application/json",
  });
});
