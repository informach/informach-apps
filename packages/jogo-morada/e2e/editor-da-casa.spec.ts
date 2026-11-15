import { conferirColocacaoNoChao, listar, type Objeto, obter } from "@informach/morada-sim";
import { expect, test } from "@playwright/test";
import { estadoDoEspelho } from "../src/espelho/estado";
import { entrar } from "./apoio";

for (const formato of [
  { nome: "computador", width: 1280, height: 720 },
  { nome: "celular", width: 390, height: 844 },
]) {
  test(`decorar no ${formato.nome}: prévia, compra, reconexão e venda confirmada`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: formato.width, height: formato.height });
    await entrar(page, `Decoração ${formato.nome}`);
    const pausa = await page.evaluate(() =>
      window.__morada?.comandar(null, { t: "votar_velocidade", velocidade: 0 }),
    );
    expect(pausa?.ok).toBe(true);
    const visao = await page.evaluate(() => window.__morada?.espelho());
    if (!visao) throw new Error("Fotografia ausente");
    const estado = estadoDoEspelho(visao, visao.tick);
    const familia = listar(estado.familias)[0],
      lote = familia?.loteId ? obter(estado.lotes, familia.loteId) : null;
    if (!familia || !lote) throw new Error("Casa ausente");
    const quantidade = listar(estado.objetos).filter((o) => o.loteId === lote.id).length;
    let posicao: [number, number] | null = null;
    for (let y = 500; y < lote.tamanho[1] && !posicao; y += 500)
      for (let x = 500; x < lote.tamanho[0]; x += 500) {
        const candidato: Objeto = {
          id: "obj_previa_editor",
          loteId: lote.id,
          catalogo: "mesa_lateral_redonda_prateleira_verde",
          versao: 1,
          revisao: 1,
          pos: [x, y, 0],
          andar: 0,
          giro: 0,
          cor: 0xffffff,
          pintura: null,
          ocupacao: {},
        };
        if (!conferirColocacaoNoChao(estado, candidato.id, candidato)) {
          posicao = [x, y];
          break;
        }
      }
    if (!posicao) throw new Error("Não há espaço para a mesa de teste");
    await page.getByRole("button", { name: "Decorar", exact: true }).click();
    const painel = page.getByRole("region", { name: "Decoração da casa" });
    await expect(painel).toBeVisible();
    await painel.getByRole("button", { name: /Mesa lateral.*M\$/ }).click();
    await painel.getByLabel("Largura (m)", { exact: true }).fill(String(posicao[0] / 1000));
    await painel.getByLabel("Profundidade (m)", { exact: true }).fill(String(posicao[1] / 1000));
    await expect(painel.getByRole("button", { name: /Comprar por M\$/ })).toBeEnabled();
    await expect
      .poll(() => page.evaluate(() => window.__morada?.espelho()?.objetos.ordem.length))
      .toBe(estado.objetos.ordem.length);
    await page.screenshot({ path: test.info().outputPath("editor-da-casa.png") });
    await painel.getByRole("button", { name: /Comprar por M\$/ }).click();
    await expect(painel.getByText("Edição confirmada.", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate((id) => window.__morada?.espelho()?.familias.porId[id]?.fundo, familia.id),
      )
      .toBe(familia.fundo - 9_500);
    await expect
      .poll(() => page.evaluate(() => window.__morada?.espelho()?.objetos.ordem.length))
      .toBe(estado.objetos.ordem.length + 1);
    await page.evaluate(() => window.__morada?.derrubarConexao());
    await page.waitForFunction(() => window.__morada?.conexao() === "pronto");
    await painel.getByRole("button", { name: /Na casa/ }).click();
    await painel.getByRole("button", { name: new RegExp(`Peça ${quantidade + 1}$`) }).click();
    await painel.getByRole("button", { name: "Vender", exact: true }).click();
    const vender = painel.getByRole("button", { name: /Vender por M\$/ });
    await expect(vender).toBeDisabled();
    await page.locator("canvas.morada-tela").focus();
    await page.keyboard.press("Enter");
    await expect(
      painel.getByText("Confirme a retirada do móvel e o valor antes de vender."),
    ).toBeVisible();
    expect(await page.evaluate(() => window.__morada?.espelho()?.objetos.ordem.length)).toBe(
      estado.objetos.ordem.length + 1,
    );
    await painel
      .getByRole("checkbox", { name: "Retirar este móvel da casa e receber o valor de revenda." })
      .check();
    await vender.click();
    await expect
      .poll(() => page.evaluate(() => window.__morada?.espelho()?.objetos.ordem.length))
      .toBe(estado.objetos.ordem.length);
    await expect
      .poll(() =>
        page.evaluate((id) => window.__morada?.espelho()?.familias.porId[id]?.fundo, familia.id),
      )
      .toBe(familia.fundo - 4_750);
    await painel.getByRole("button", { name: "Fechar decoração" }).click();
    await expect(painel).toBeHidden();
  });
}
