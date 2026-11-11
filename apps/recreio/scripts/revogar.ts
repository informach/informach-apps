/**
 * Revoga a concessão vigente de uma conta. O direito de jogar para na hora.
 *
 *   DATABASE_URL=... pnpm --filter @informach/recreio-app revogar \
 *     --email pessoa@exemplo.com --motivo fim_do_alfa
 *
 * A linha da concessão não é apagada: fica com a data e o código do motivo da
 * revogação, e o evento `recreio.entitlement_revoked` entra junto no banco.
 *
 * A saída mostra só ids e datas. O e-mail não é repetido.
 */
import { parseArgs } from "node:util";
import { revogar } from "./concessoes";
import { encerrarComErro } from "./saida";

const USO = "Uso: revogar --email <e-mail> --motivo <codigo_curto>";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, motivo: { type: "string" } },
  });
  const feita = await revogar({ email: values.email, motivo: values.motivo });
  console.log("Conta encontrada. Concessão revogada junto com o evento de auditoria.");
  for (const id of feita.concessaoIds) console.log(`  concessão: ${id}`);
  console.log(`  grupo:     ${feita.grupoId}`);
  console.log(`  conta:     ${feita.contaId}`);
  console.log(`  revogada:  ${feita.revogadaEm.toISOString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => encerrarComErro(error, USO));
