// Sobe o app em desenvolvimento para o playground (/dev/playground), que não
// usa conta, assinatura nem banco. Sem `.env.local`, preenche as variáveis
// obrigatórias com valores de mentira, que só servem para o app abrir: o
// banco aponta para uma porta fechada e o resto do app (login, conta, treinos
// salvos) não funciona assim. Com `.env.local`, ele vale e nada é inventado.
//
// Com `--https`, serve em HTTPS com um certificado autoassinado para localhost e
// os IPs da rede: é o que o celular exige para ligar a câmera. O navegador avisa
// uma vez que a conexão não é particular; depois de aceitar, tudo funciona. Nada
// é instalado no sistema.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect, createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = "3007";
const https = process.argv.includes("--https");
const scheme = https ? "https" : "http";
const origin = `${scheme}://localhost:${port}`;

const env = { ...process.env };
if (!existsSync(join(app, ".env.local"))) {
  const placeholders = {
    DATABASE_URL: "postgres://playground:playground@127.0.0.1:1/playground",
    BETTER_AUTH_SECRET: "playground-local-only-not-a-secret-000000",
    BETTER_AUTH_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
    SENDGRID_API_KEY: "SG.playground",
    SENDGRID_FROM: "Bora Treinar <nao-responda@informach.com.br>",
    EMAIL_SANDBOX_MODE: "memory",
    STRIPE_SECRET_KEY: "sk_test_playground",
    STRIPE_WEBHOOK_SECRET: "whsec_playground",
    STRIPE_MODE: "dev",
    CRON_SECRET: "playground-local-only-not-a-secret-000000",
  };
  for (const [key, value] of Object.entries(placeholders)) env[key] ??= value;
}

const assets = spawnSync(process.execPath, [join(app, "scripts/fetch-assets.mjs")], {
  cwd: app,
  stdio: "inherit",
});
if (assets.status !== 0) process.exit(assets.status ?? 1);

// Para abrir no celular na mesma rede: o Next só serve o modo de desenvolvimento a origens
// liberadas. Sem HTTPS, a câmera não liga no celular; o resto (manual, som, música) funciona.
const lan = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  .map((net) => net.address);
env.BORA_DEV_ORIGINS = lan.join(",");

// Em HTTPS o Next fica numa porta interna e a porta pública aceita os dois protocolos: quem
// chega por http:// (o histórico do celular costuma completar assim) é mandado para https://.
const interna = "3017";
const devArgs = https
  ? ["dev", "-p", interna, "-H", "127.0.0.1", "--experimental-https", ...certificado(lan)]
  : ["dev", "-p", port];
// o Next só sobe com a porta pública garantida, para não ficar um servidor órfão
if (https) portaDupla(Number(port), Number(interna)).once("listening", iniciar);
else iniciar();

function iniciar() {
  console.log(`\n[bora] Playground: ${origin}/dev/playground`);
  for (const ip of lan)
    console.log(`[bora] No celular (mesma rede): ${scheme}://${ip}:${port}/dev/playground`);
  if (!https) console.log("[bora] Para a câmera no celular, rode com --https.");
  console.log("");
  const next = createRequire(join(app, "package.json")).resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [next, ...devArgs], {
    cwd: app,
    env,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => process.exit(code ?? 0));
}

/**
 * Escuta na porta pública: conexão TLS (primeiro byte 0x16) vai para o Next na porta interna;
 * texto puro (http://) recebe um redirecionamento temporário para o mesmo endereço em https://.
 */
function portaDupla(publica, destino) {
  return createServer((socket) => {
    socket.on("error", () => socket.destroy());
    socket.once("data", (inicio) => {
      if (inicio[0] === 0x16) {
        socket.pause();
        const next = connect(destino, "127.0.0.1", () => {
          next.write(inicio);
          socket.pipe(next).pipe(socket);
        });
        next.on("error", () => socket.destroy());
        socket.on("close", () => next.destroy());
        return;
      }
      const pedido = inicio.toString("latin1");
      const host = /\r\nhost: *([^\r\n]+)/i.exec(pedido)?.[1] ?? `localhost:${publica}`;
      const caminho = /^[A-Z]+ (\/\S*)/.exec(pedido)?.[1] ?? "/";
      socket.end(
        `HTTP/1.1 307 Temporary Redirect\r\nLocation: https://${host}${caminho}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
      );
    });
  })
    .on("error", (erro) => {
      console.error(
        `[bora] A porta ${publica} não está livre (${erro.message}). Feche o outro servidor e rode de novo.`,
      );
      process.exit(1);
    })
    .listen(publica);
}

/** Certificado autoassinado para localhost e os IPs da rede, refeito quando os IPs mudam ou ele envelhece. */
function certificado(ips) {
  const pasta = join(app, "../../.cache/bora-playground-https");
  const chave = join(pasta, "key.pem");
  const cert = join(pasta, "cert.pem");
  const marca = join(pasta, "hosts.txt");
  const nomes = ["DNS:localhost", "IP:127.0.0.1", ...ips.map((ip) => `IP:${ip}`)].join(",");
  // vale 30 dias; refeito com folga antes de vencer
  const recente = (arquivo) =>
    existsSync(arquivo) && Date.now() - statSync(arquivo).mtimeMs < 25 * 24 * 3600 * 1000;
  const atual = existsSync(marca) && readFileSync(marca, "utf8") === nomes;
  if (!atual || !existsSync(chave) || !recente(cert)) {
    mkdirSync(pasta, { recursive: true });
    const openssl = [
      "openssl",
      "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe",
      "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
    ].find((bin) => spawnSync(bin, ["version"], { stdio: "ignore" }).status === 0);
    if (!openssl) {
      console.error("[bora] --https precisa do OpenSSL (vem com o Git para Windows).");
      process.exit(1);
    }
    const gerou = spawnSync(
      openssl,
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "30",
        "-keyout",
        chave,
        "-out",
        cert,
        "-subj",
        "/CN=Bora Treinar playground",
        "-addext",
        `subjectAltName=${nomes}`,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    if (gerou.status !== 0) process.exit(gerou.status ?? 1);
    writeFileSync(marca, nomes);
  }
  return ["--experimental-https-key", chave, "--experimental-https-cert", cert];
}
