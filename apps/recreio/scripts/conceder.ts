/**
 * Concede o direito de jogar a uma conta, por cortesia da equipe.
 *
 *   DATABASE_URL=... pnpm --filter @informach/recreio-app conceder \
 *     --email pessoa@exemplo.com --tier individual --dias 30 --motivo alfa_equipe
 *
 * A conta precisa existir e ter o e-mail confirmado. O grupo dela é criado se
 * faltar. Se já houver concessão vigente, o script recusa: revogue antes. O
 * motivo é um código curto (letras minúsculas, números e `_`), não um texto. A
 * concessão e o evento `recreio.entitlement_granted` entram juntos no banco.
 *
 * A saída mostra só ids e datas. O e-mail não é repetido.
 */
import { parseArgs } from "node:util";
import { conceder } from "./concessoes";
import { encerrarComErro } from "./saida";

const USO =
  "Uso: conceder --email <e-mail> --tier individual|family --dias <1 a 366> --motivo <codigo_curto>";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      tier: { type: "string" },
      dias: { type: "string" },
      motivo: { type: "string" },
    },
  });
  const feita = await conceder({
    email: values.email,
    tier: values.tier,
    dias: Number(values.dias),
    motivo: values.motivo,
  });
  console.log("Conta encontrada. Concessão gravada junto com o evento de auditoria.");
  console.log(`  concessão: ${feita.concessaoId}`);
  console.log(`  grupo:     ${feita.grupoId}`);
  console.log(`  conta:     ${feita.contaId}`);
  console.log(`  começa:    ${feita.inicio.toISOString()}`);
  console.log(`  termina:   ${feita.fim.toISOString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => encerrarComErro(error, USO));
