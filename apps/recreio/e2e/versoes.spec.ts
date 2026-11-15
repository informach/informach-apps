import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, hidratado, medida, novaPessoa, vigia } from "./apoio";
import { iniciarVersao, pararVersao } from "./versoes-apoio";

test.describe("troca de versão do portal", () => {
  test.skip(
    process.env.RECREIO_E2E_VERSOES !== "1",
    "exige dois standalone do executor de versões",
  );
  test("a aba da primeira build confirma um único mundo depois de subir a segunda", async ({
    browser,
  }) => {
    const anterior = process.env.RECREIO_E2E_PREVIOUS_STANDALONE;
    const versaoA = process.env.RECREIO_E2E_VERSAO_A;
    const versaoB = process.env.RECREIO_E2E_VERSAO_B;
    const runId = process.env.RECREIO_E2E_RUN_ID;
    if (!anterior || !versaoA || !versaoB || !runId) throw new Error("Builds de versões ausentes");
    const atual = path.resolve(`.next-isolated-${runId}`, "standalone/apps/recreio");
    let servidor: ChildProcess | null = null;
    comecarVigia();
    try {
      servidor = await iniciarVersao(anterior, versaoA);
      const pessoa = await novaPessoa(browser, "Ana");
      const documentoA = await pessoa.page.reload();
      if (!documentoA) throw new Error("Documento da primeira versão ausente");
      expect(await documentoA.text()).toContain(`data-dpl-id="${versaoA}"`);
      const secao = pessoa.page.getByRole("region", { name: "Seus mundos no Morada" });
      const campo = secao.getByLabel("Nome do mundo");
      await hidratado(campo);
      await campo.fill("Casa entre versões");
      await pararVersao(servidor);
      servidor = null;
      servidor = await iniciarVersao(atual, versaoB);
      // A mesma aba e o mesmo formulário continuam com os JS e IDs da build A.
      const [acao, documentoB] = await Promise.all([
        pessoa.page.waitForRequest(
          (pedido) => pedido.method() === "POST" && Boolean(pedido.headers()["next-action"]),
        ),
        pessoa.page.waitForResponse(
          (resposta) =>
            resposta.request().isNavigationRequest() &&
            /\/mundos\/[0-9a-f-]{36}$/.test(new URL(resposta.url()).pathname),
        ),
        secao.getByRole("button", { name: "Criar mundo", exact: true }).click(),
      ]);
      expect(acao.headers()["x-deployment-id"]).toBe(versaoA);
      await expect(pessoa.page).toHaveURL(/\/mundos\/[0-9a-f-]{36}$/);
      expect(await documentoB.text()).toContain(`data-dpl-id="${versaoB}"`);
      const mundo = new URL(pessoa.page.url()).pathname.split("/").pop();
      expect(mundo).toBeTruthy();
      await pessoa.page.goto("/estante");
      await expect(
        pessoa.page.getByRole("link", { name: "Jogar em Casa entre versões" }),
      ).toHaveCount(1);
      await medida("troca-de-versao", {
        mesmaAba: true,
        criacaoConfirmadaUmaVez: true,
        versoesDistintas: versaoA !== versaoB,
      });
    } finally {
      await fecharAparelhos();
      await pararVersao(servidor);
    }
    expect(vigia()).toEqual({ violacoes: [], errosDePagina: [], errosDeConsole: [] });
  });
});
