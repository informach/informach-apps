import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * "Zero conteúdo das famílias na tela, garantido por teste."
 *
 * Varre o código do Bastidores e falha se alguma consulta tocar coluna que
 * guarda segredo, contato fora da conta ou conteúdo criado dentro dos produtos.
 * Quem precisar de uma coluna nova de tabela de produto acrescenta ao
 * allow-list abaixo, com o motivo, e isso passa por revisão.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA_DIR = fileURLToPath(new URL("../../../../packages/db/src/schema/", import.meta.url));

/** Arquivos de schema cujas tabelas guardam o que as famílias criam. */
const CONTENT_SCHEMA_FILES = ["cozya.ts", "agenda.ts", "agenda-family.ts", "missao-saber.ts"];
/** Schemas SQL desses arquivos, para pegar SQL escrito à mão. */
const CONTENT_SQL_SCHEMAS = ["cozya", "agenda", "missao_saber"];

/** Nome de coluna que nunca sai do banco, em qualquer tabela. */
const FORBIDDEN_ANYWHERE = new Set([
  "token",
  "tokenHash",
  "accessToken",
  "refreshToken",
  "idToken",
  "password",
  "secret",
  "backupCodes",
  "clientSecret",
  "codeHash",
  "ipAddress",
]);

/** Colunas proibidas de tabelas compartilhadas. */
const FORBIDDEN_BY_TABLE: Record<string, Set<string>> = {
  // Assunto e corpo levam códigos de acesso e texto para as famílias.
  emailDeliveries: new Set(["subject", "html", "text"]),
  // O valor da verificação é o próprio código.
  verifications: new Set(["value"]),
};

/** Tabelas compartilhadas que pedem projeção explícita (nunca `select()` vazio). */
const SENSITIVE_SHARED_TABLES = [
  "emailDeliveries",
  "sessions",
  "accounts",
  "twoFactors",
  "verifications",
];

/**
 * Colunas de tabela de produto que o Bastidores pode ler: identificadores,
 * dono, datas e estado de fluxo. Servem para contar e para dizer quando, nunca
 * para mostrar o que foi escrito.
 */
const STRUCTURAL_COLUMNS = new Set([
  "id",
  "userId",
  "ownerUserId",
  "createdByUserId",
  "profileId",
  "studentProfileId",
  "turmaId",
  "memberId",
  "deviceId",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "completedAt",
  "interruptedAt",
  "revokedAt",
  "expiresAt",
  "connectedAt",
  "trialStartedAt",
  "startedAt",
  "finishedAt",
  "status",
  "mode",
  "accessEnabled",
]);

/** Exceções por tabela, cada uma com o motivo. */
const TABLE_ALLOW_LIST: Record<string, Set<string>> = {
  // A data da refeição planejada conta semanas planejadas; o prato não é lido.
  cozyaMeals: new Set(["day"]),
  // A semana da lista de compras só serve para contar listas por semana.
  cozyaShoppingLists: new Set(["week"]),
  // Eventos de instrumentação de produto: nome fixo do evento e horário, sem texto
  // da família. Usados no funil de Produtos.
  cozyaProductEvents: new Set(["name", "occurredAt"]),
  // Idem na Agenda; `landingContext` (contexto de página) continua fora.
  agendaProductEvents: new Set(["event", "source"]),
};

function tablesIn(file: string): string[] {
  const source = readFileSync(join(SCHEMA_DIR, file), "utf8");
  return [...source.matchAll(/export const (\w+) = \w+\.table\(/g)].map(
    (match) => match[1] as string,
  );
}

const CONTENT_TABLES = new Set(CONTENT_SCHEMA_FILES.flatMap(tablesIn));

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

type Violation = { file: string; reason: string };

function findViolations(file: string, rawSource: string): Violation[] {
  const source = stripComments(rawSource);
  const violations: Violation[] = [];
  const references = [...source.matchAll(/\b([a-z][A-Za-z0-9]*)\.([a-zA-Z][A-Za-z0-9]*)\b/g)];
  for (const [, table, column] of references) {
    if (!table || !column) continue;
    const knownTable =
      CONTENT_TABLES.has(table) ||
      table in FORBIDDEN_BY_TABLE ||
      SENSITIVE_SHARED_TABLES.includes(table);
    if (!knownTable) continue;
    if (FORBIDDEN_ANYWHERE.has(column))
      violations.push({ file, reason: `${table}.${column} é segredo` });
    if (FORBIDDEN_BY_TABLE[table]?.has(column))
      violations.push({ file, reason: `${table}.${column} é proibida` });
    if (
      CONTENT_TABLES.has(table) &&
      !STRUCTURAL_COLUMNS.has(column) &&
      !TABLE_ALLOW_LIST[table]?.has(column) &&
      // Métodos do Drizzle sobre a tabela (ex.: `$inferSelect`) não são colunas.
      !column.startsWith("$")
    )
      violations.push({ file, reason: `${table}.${column} é conteúdo de produto` });
  }

  const touchesSensitive = [...CONTENT_TABLES, ...SENSITIVE_SHARED_TABLES].some((table) =>
    new RegExp(`\\b${table}\\b`).test(source),
  );
  if (touchesSensitive && /\.select(Distinct)?\(\s*\)/.test(source))
    violations.push({ file, reason: "select() vazio num arquivo que lê tabela sensível" });

  // `cozya.profiles` dentro de texto é consulta crua que o teste não enxerga coluna por coluna.
  const strings = source.match(/`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g) ?? [];
  const rawSqlTable = new RegExp(`\\b(${CONTENT_SQL_SCHEMAS.join("|")})\\.[a-z_]+\\b`);
  for (const literal of strings) {
    const match = literal.match(rawSqlTable);
    if (match) violations.push({ file, reason: `SQL escrito à mão em ${match[0]}` });
  }
  return violations;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "test" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Arquivos que importam o schema: repositórios e o que mais ler o banco. */
function schemaReaders(): string[] {
  return walk(SRC).filter((path) =>
    /from "@informach\/db\/schema"/.test(readFileSync(path, "utf8")),
  );
}

describe("privacidade das consultas do Bastidores", () => {
  it("reconhece as tabelas de conteúdo dos produtos", () => {
    expect(CONTENT_TABLES.has("cozyaRecipes")).toBe(true);
    expect(CONTENT_TABLES.has("agendaActivities")).toBe(true);
    expect(CONTENT_TABLES.has("agendaNotices")).toBe(true);
    expect(CONTENT_TABLES.has("missaoAttempts")).toBe(true);
    expect(CONTENT_TABLES.size).toBeGreaterThan(30);
  });

  it("acusa coluna proibida, conteúdo, select vazio e SQL cru", () => {
    expect(findViolations("a.ts", "db.select({ s: emailDeliveries.subject })")).toHaveLength(1);
    expect(
      findViolations("b.ts", "db.select({ ip: sessions.ipAddress, t: sessions.token })"),
    ).toHaveLength(2);
    expect(findViolations("c.ts", "db.select({ n: cozyaRecipes.name })")[0]?.reason).toMatch(
      /conteúdo/,
    );
    expect(findViolations("d.ts", "db.select({ n: missaoProfiles.nickname })")).toHaveLength(1);
    expect(findViolations("e.ts", "readDb().select().from(agendaActivities)")).toHaveLength(1);
    expect(findViolations("f.ts", "sql`select title from agenda.activities`")).toHaveLength(1);
  });

  it("aceita contagem, dono e datas, e ignora comentários", () => {
    expect(
      findViolations(
        "ok.ts",
        `// cozyaRecipes.name aparece só no comentário
        /* missao_saber.profiles também */
        readDb().select({ value: count() }).from(cozyaRecipes).where(eq(cozyaRecipes.userId, id));
        readDb().select({ day: cozyaMeals.day }).from(cozyaMeals);
        readDb().select({ c: emailDeliveries.category, s: emailDeliveries.status }).from(emailDeliveries);`,
      ),
    ).toEqual([]);
  });

  it("nenhum arquivo do Bastidores lê coluna proibida", () => {
    const files = schemaReaders();
    const relativeFiles = files.map((path) => relative(SRC, path).replaceAll("\\", "/"));
    expect(relativeFiles).toContain("features/people/repository.ts");
    const violations = files.flatMap((path) =>
      findViolations(relative(SRC, path).replaceAll("\\", "/"), readFileSync(path, "utf8")),
    );
    expect(violations).toEqual([]);
  });
});
