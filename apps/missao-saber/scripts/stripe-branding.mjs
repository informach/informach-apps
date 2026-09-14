import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parse } from "dotenv";

const root = resolve(import.meta.dirname, "../../..");
const Stripe = createRequire(resolve(root, "packages/billing/package.json"))("stripe");
const local = parse(readFileSync(resolve(root, "apps/cozya/.env.local")));
const mode = process.argv[2];
if (!["dev", "prod"].includes(mode)) throw new Error("Choose dev or prod");
const key = mode === "prod" ? local.STRIPE_PROD_SECRET_KEY : local.STRIPE_SECRET_KEY;
if (!key || !(mode === "prod" ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/).test(key))
  throw new Error("Stripe key mode mismatch");
const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia", timeout: 30000 });
try {
  const data = readFileSync(resolve(root, "apps/missao-saber/public/app-icon.png"));
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  const form = new FormData();
  form.set("purpose", "business_icon");
  form.set("file", new Blob([data], { type: "image/png" }), "missao-saber.png");
  form.set("file_link_data[create]", "true");
  form.set("file_link_data[metadata][app]", "missao-saber");
  const uploaded = await fetch("https://files.stripe.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": "2026-04-22.dahlia",
      "Idempotency-Key": `missao-icon-form-${mode}-${hash}`,
    },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const file = await uploaded.json();
  if (!uploaded.ok)
    throw new Error(`Stripe file upload ${uploaded.status}: ${file.error?.message}`);
  const url = file.links?.data[0]?.url;
  if (!url) throw new Error("Stripe did not return a public image URL");
  const image = await fetch(url);
  if (!image.ok || !image.headers.get("content-type")?.startsWith("image/"))
    throw new Error("Uploaded icon is not publicly available");
  for (const [tier, label, description] of [
    [
      "individual",
      "Individual",
      "Um espaço para aprender e se preparar para as olimpíadas escolares. Inclui um perfil de estudante, com desafios autorais, explicações passo a passo, revisões e acompanhamento pela família.",
    ],
    [
      "family",
      "Família",
      "Aprender fica ainda melhor em família. Inclui até três perfis de estudantes, cada um com seu progresso, desafios autorais, explicações passo a passo e revisões para as olimpíadas escolares.",
    ],
  ]) {
    const product = await stripe.products.update(`missao_saber_${tier}`, {
      name: `Missão Saber ${label}`,
      description,
      images: [url],
    });
    console.log(
      JSON.stringify({
        mode,
        id: product.id,
        name: product.name,
        description: product.description,
        images: product.images,
      }),
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      type: error.type ?? error.name,
      code: error.code,
      message: String(error.message).replace(/(?:sk|rk)_(?:test|live)_[\w]+/g, "[redacted]"),
    }),
  );
  process.exitCode = 1;
}
