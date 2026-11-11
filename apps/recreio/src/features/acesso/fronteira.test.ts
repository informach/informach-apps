import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O direito de jogar tem uma porta só: `features/acesso`. Este teste varre o
 * código do app e falha se outro arquivo ler assinatura ou concessão por conta
 * própria. Os scripts de concessão ficam em `apps/recreio/scripts`, fora de
 * `src`: eles gravam concessões, não decidem acesso.
 */
const src = path.resolve(__dirname, "../..");
const PERMITIDOS = new Set(["features/acesso/repository.ts", "features/acesso/service.ts"]);
/** Este arquivo cita os nomes para testar o próprio varredor. */
const ESTE_TESTE = "features/acesso/fronteira.test.ts";

/** Nomes que só a porta do acesso pode usar. */
const RESTRITOS = /\b(getProSubscription|hasProSubscription|PRO_STATUSES|recreioEntitlements)\b/;
/** A tabela de assinaturas, importada do schema do banco. */
const ASSINATURAS_DO_SCHEMA =
  /import\s*(?:type\s*)?\{[^}]*\bsubscriptions\b[^}]*\}\s*from\s*["']@informach\/db\/schema["']/;

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(item.name) ? [caminho] : [];
  });
}

function leituras(codigo: string): string[] {
  const achados: string[] = [];
  const restrito = RESTRITOS.exec(codigo);
  if (restrito?.[1]) achados.push(restrito[1]);
  if (ASSINATURAS_DO_SCHEMA.test(codigo)) achados.push("subscriptions");
  return achados;
}

describe("fronteira do direito de jogar", () => {
  const todos = arquivos(src).map((caminho) => ({
    relativo: path.relative(src, caminho).replaceAll("\\", "/"),
    codigo: readFileSync(caminho, "utf8"),
  }));

  it("o varredor enxerga o código do app e reconhece uma leitura", () => {
    expect(todos.length).toBeGreaterThan(20);
    expect(leituras('import { getProSubscription } from "@informach/billing";')).toEqual([
      "getProSubscription",
    ]);
    expect(
      leituras('import {\n  recreioEntitlements as e,\n} from "@informach/db/schema";'),
    ).toEqual(["recreioEntitlements"]);
    expect(leituras('import { subscriptions, users } from "@informach/db/schema";')).toEqual([
      "subscriptions",
    ]);
    expect(leituras('import { users } from "@informach/db/schema";')).toEqual([]);
  });

  it("a porta do acesso é quem lê assinatura e concessão", () => {
    const repositorio = todos.find((item) => item.relativo === "features/acesso/repository.ts");
    expect(repositorio && leituras(repositorio.codigo)).toEqual(
      expect.arrayContaining(["getProSubscription", "subscriptions"]),
    );
    expect(repositorio?.codigo).toMatch(/\brecreioEntitlements\b/);
  });

  it("nenhum outro arquivo de src lê assinatura ou concessão", () => {
    const fora = todos
      .filter((item) => !PERMITIDOS.has(item.relativo) && item.relativo !== ESTE_TESTE)
      .flatMap((item) => leituras(item.codigo).map((nome) => `${item.relativo}: ${nome}`));
    expect(fora).toEqual([]);
  });
});
