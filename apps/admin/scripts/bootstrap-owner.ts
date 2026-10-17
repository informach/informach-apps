/**
 * Cria o primeiro owner do Bastidores: dá o papel owner a uma conta que já
 * existe, pelo e-mail. Só funciona enquanto não houver nenhum owner. Depois
 * disso, todo papel é dado ou tirado dentro do Bastidores, por um owner com
 * duas etapas, e fica na auditoria em nome de quem mudou.
 *
 *   DATABASE_URL=... pnpm --filter @informach/admin bootstrap-owner pessoa@informach.com.br
 *
 * Não cria conta nem senha: a pessoa entra em algum produto antes, e a senha do
 * Bastidores é criada por ela mesma, pelo código no e-mail.
 *
 * `--emergencia` aceita rodar mesmo com owners existentes, para o caso raro em
 * que todos perderam o acesso (celular e códigos de recuperação). Fica gravado
 * na auditoria como tal. Em produção, rode só com a titular de acordo.
 */
import { logAuditEvent } from "@informach/auth";
import { count, db, eq } from "@informach/db";
import { users } from "@informach/db/schema";

async function main() {
  const args = process.argv.slice(2);
  const emergency = args.includes("--emergencia");
  const email = args
    .find((arg) => !arg.startsWith("--"))
    ?.trim()
    .toLowerCase();
  if (!email) {
    console.error("Uso: bootstrap-owner <email> [--emergencia]");
    process.exit(2);
  }

  const [owners] = await db.select({ total: count() }).from(users).where(eq(users.role, "owner"));
  const existing = owners?.total ?? 0;
  if (existing > 0 && !emergency) {
    console.error(
      `Já existe ${existing === 1 ? "1 owner" : `${existing} owners`}. Novos papéis são dados dentro do Bastidores, na ficha da pessoa. Só use --emergencia se nenhum owner consegue mais entrar.`,
    );
    process.exit(1);
  }

  const [account] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!account) {
    console.error(
      "Nenhuma conta com esse e-mail. A pessoa precisa ter entrado em algum produto antes.",
    );
    process.exit(1);
  }
  if (account.role === "owner") {
    console.log("A conta já é owner. Nada mudou.");
    process.exit(0);
  }

  await db
    .update(users)
    .set({ role: "owner", updatedAt: new Date() })
    .where(eq(users.id, account.id));
  await logAuditEvent("user.role_changed", null, {
    targetId: account.id,
    previousRole: account.role,
    newRole: "owner",
    source: emergency ? "bootstrap-owner:emergencia" : "bootstrap-owner",
  });
  console.log(`Conta ${account.id} agora é owner.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
