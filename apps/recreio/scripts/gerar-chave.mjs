/**
 * Gera um par de chaves Ed25519 para os tokens do Recreio (ingresso e sessão
 * de jogo) e mostra o que vai em cada variável.
 *
 *   pnpm --filter @informach/recreio-app gerar-chave
 *
 * A chave privada sai em PKCS8 PEM numa linha só, com `\n` escapado, pronta
 * para `RECREIO_TOKEN_PRIVATE_KEY`. Guarde-a no provedor (Railway), nunca em
 * arquivo do repositório. A pública (SPKI PEM) serve só na rotação: quando
 * esta chave for trocada, ela entra em `RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS`
 * com o seu id, até as sessões assinadas por ela vencerem.
 *
 * Com `--github-env`, imprime só as linhas `NOME=valor` de uma chave
 * descartável, para o passo de build do CI acrescentar a `$GITHUB_ENV`.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const emUmaLinha = (pem) => pem.trim().split(/\r?\n/).join(String.raw`\n`);
const privada = emUmaLinha(privateKey.export({ type: "pkcs8", format: "pem" }));
const publica = emUmaLinha(publicKey.export({ type: "spki", format: "pem" }));
const hoje = new Date().toISOString().slice(0, 10);
const kid = `recreio-${hoje}-${randomBytes(3).toString("hex")}`;

if (process.argv.includes("--github-env")) {
  console.log(`RECREIO_TOKEN_PRIVATE_KEY=${privada}`);
  console.log(`RECREIO_TOKEN_KEY_ID=ci-${randomBytes(3).toString("hex")}`);
} else {
  console.log("Chave nova. Copie para o provedor e não guarde em arquivo do repositório.\n");
  console.log(`RECREIO_TOKEN_KEY_ID=${kid}`);
  console.log(`RECREIO_TOKEN_PRIVATE_KEY=${privada}\n`);
  console.log("Para a rotação futura (entra em RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS):");
  console.log(JSON.stringify({ [kid]: publica }));
}
