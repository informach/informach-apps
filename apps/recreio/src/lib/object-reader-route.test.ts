import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/objetos/configuracao/route";
import { fixtureDeMigracao } from "../../test/object-migration-apoio";

describe("rota de configuração, sem ler banco ou objeto", () => {
  it("mantém off opaco e só publica metadados técnicos da composição válida", async () => {
    const fixture = { ...fixtureDeMigracao(), NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA: "a".repeat(40) };
    const antes = new Map(Object.keys(fixture).map((k) => [k, process.env[k]]));
    try {
      Object.assign(process.env, fixture);
      const r = await GET();
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      const body = await r.json();
      expect(body.source).toBe(fixture.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA);
      expect(body.reader.keys).toEqual(["v1"]);
      for (const privado of [
        fixture.RECREIO_OBJECTS_ACCESS_KEY,
        fixture.RECREIO_OBJECTS_SECRET_KEY,
        fixture.RECREIO_OBJECTS_KEYS,
        fixture.RECREIO_OBJECTS_ENDPOINT,
      ])
        expect(JSON.stringify(body)).not.toContain(privado);
      process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA = "private-invalid";
      const falha = await GET();
      expect(falha.status).toBe(503);
      expect(await falha.json()).toEqual({ status: "unavailable" });
      process.env.RECREIO_OBJECTS_MODE = "off";
      process.env.RECREIO_OBJECTS_KEYS = "private-invalid";
      const off = await GET();
      expect(off.status).toBe(404);
      expect(await off.text()).toBe("");
    } finally {
      for (const [k, v] of antes) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
