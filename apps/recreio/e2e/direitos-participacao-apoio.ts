import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

/** Apenas estado anterior da interface, em banco descartável e conta sintética
 * sem jogadores. Não é prova de consentimento, execução ou liquidação. */
export async function prepararParticipacaoParaTela(email: string, estado: "closing" | "closed") {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (
    !url ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname) ||
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !/^recreio-[a-f0-9-]+@example\.test$/.test(email)
  )
    throw new Error("Fixture de participação exige conta e banco descartáveis");
  const client = postgres(url.toString(), { max: 1 });
  try {
    await client.begin(async (tx) => {
      const [conta] = await tx<{ id: string }[]>`select u.id from core.users u
        where u.email=${email} and u.email_verified=true
        and not exists(select 1 from recreio.profiles p where p.user_id=u.id)
        for update`;
      if (!conta) throw new Error("Conta sintética sem jogador ausente");
      const [login] = await tx<{ criada: Date }[]>`select created_at as criada from core.sessions
        where user_id=${conta.id} and expires_at>clock_timestamp() order by created_at desc limit 1`;
      if (!login) throw new Error("Login sintético ausente");
      const agora = new Date(),
        id = randomUUID();
      const plano = {
        formato: "recreio-previa-direitos-v1",
        tipo: "encerrar_conta",
        contaId: conta.id,
        perfis: [],
        mundos: [],
        identidadeGlobalPreservada: true,
        financeiroSeparado: true,
      };
      const sha = createHash("sha256").update(JSON.stringify(plano)).digest("hex");
      const bytes = Buffer.from("fixture-estrutural-interface-sem-consentimento");
      await tx`insert into recreio.rights_preparations
        (id,requester_user_id,kind,plan,plan_sha256,created_at,expires_at)
        values(${id},${conta.id},'encerrar_conta',${tx.json(plano)},${sha},${agora},${new Date(agora.getTime() + 30 * 60_000)})`;
      await tx`insert into recreio.rights_operations
        (id,preparation_id,requester_user_id,plan_sha256,kind,ledger_id,ledger_epoch,signing_key_id,
         source,signed_intent,intent_sha256,authenticated_at,consented_at,state,admitted_head_sha256,
         admitted_at,completed_at,next_attempt_at,created_at,updated_at)
        values(${id},${id},${conta.id},${sha},'encerrar_conta',${randomUUID()},0,'fixture',
         ${"a".repeat(40)},${bytes},${createHash("sha256").update(bytes).digest("hex")},${login.criada},${agora},
         ${estado === "closed" ? "completed" : "publishing"},${estado === "closed" ? "a".repeat(64) : null},
         ${estado === "closed" ? agora : null},${estado === "closed" ? agora : null},${agora},${agora},${agora})`;
      await tx`insert into recreio.account_participations
        (user_id,state,revision,operation_id,closing_at,closed_at,updated_at)
        values(${conta.id},${estado},${estado === "closed" ? 3 : 2},${id},${agora},${estado === "closed" ? agora : null},${agora})`;
    });
  } finally {
    await client.end();
  }
}
