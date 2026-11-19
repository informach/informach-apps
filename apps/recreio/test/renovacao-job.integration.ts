import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { despachar, ORIGEM, pedir } from "./rotas";

describe("fronteira operacional do cancelamento de renovação", () => {
  it("recusa chamadas sem o segredo do agendador", async () => {
    for (const headers of [undefined, { authorization: "Bearer incorreto" }])
      expect(
        await despachar(`${ORIGEM}/api/jobs/renovacoes`, { method: "POST", headers }),
      ).toMatchObject({ status: 401 });
  });
  it("modo desligado é explícito e não compõe Stripe", async () => {
    expect(env.RECREIO_RENEWAL_JOBS_MODE).toBe("off");
    expect(
      await pedir("POST", "/api/jobs/renovacoes", {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }),
    ).toMatchObject({
      status: 200,
      corpo: {
        habilitada: false,
        reservadas: 0,
        confirmadas: 0,
        emConferencia: 0,
        falhasTecnicas: 0,
      },
    });
  });
});
