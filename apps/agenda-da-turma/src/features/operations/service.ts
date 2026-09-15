import "server-only";
import { schemaReady } from "./repository";

/**
 * Este processo pode receber tráfego?
 *
 * Só o schema, deliberadamente. O portão de deploy existe para barrar uma
 * instância quebrada **por esta release** — o caso real é o app subir antes do
 * migrator e servir erro em toda tela que leia a coluna nova. Dependência de
 * infraestrutura fora do ar não é release-específica, e recusar o deploy não a
 * conserta: derrubaria a publicação de uma correção justamente durante um
 * incidente.
 */
export function checkReadiness() {
  return schemaReady();
}
