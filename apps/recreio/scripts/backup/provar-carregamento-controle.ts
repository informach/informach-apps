import { abandonarCapturaSemArquivo, liberarReservasSemArquivo } from "./abandono-repository";
import { capturarEPublicarBackup } from "./capturar-e-publicar";
import { exigir } from "./provas-arquivos";
import {
  assumirPublicacao,
  confirmarPublicacao,
  prepararPublicacao,
} from "./publicacao-repository";
import { reconciliarPublicacaoDoBackup } from "./reconciliar-publicacao";
import {
  assumirRetirada,
  confirmarAusenciaDoBackup,
  listarRetiradasDevidas,
} from "./retirada-repository";

/** Qualification of the real native control modules without a login/provider
 * composition. Importing them must not instantiate a default database client;
 * no capture, publication, retirement or personal erasure is invoked here. */
export function provarCarregamentoDoControle() {
  exigir(
    !process.env.DATABASE_URL &&
      !process.env.BETTER_AUTH_SECRET &&
      !process.env.SENDGRID_API_KEY &&
      !process.env.STRIPE_SECRET_KEY,
    "CONTROLE_BACKUP_EXIGE_CREDENCIAL_DE_APP",
  );
  exigir(
    [
      reconciliarPublicacaoDoBackup,
      capturarEPublicarBackup,
      abandonarCapturaSemArquivo,
      liberarReservasSemArquivo,
      prepararPublicacao,
      assumirPublicacao,
      confirmarPublicacao,
      listarRetiradasDevidas,
      assumirRetirada,
      confirmarAusenciaDoBackup,
    ].every((fn) => typeof fn === "function"),
    "CONTROLE_BACKUP_AUSENTE",
  );
  return { nativeBackupControlLoadedWithoutAppCredentials: true as const };
}
