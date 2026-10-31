import { assetId } from "@informach/edi-motion/assets";
import { strToU8, zipSync } from "fflate";

/** Fixed build outputs only. An animation never supplies paths or executable player code. */
export const WEB_PLAYER_FILES = [
  "edi-web-player.mjs",
  "edi-web-player.d.mts",
  "edi-web-data.mjs",
  "edi-web-data.d.mts",
  "edi-web-types.d.ts",
  "THIRD_PARTY_LICENSES.txt",
] as const;

export type WebPlayerFiles = Record<(typeof WEB_PLAYER_FILES)[number], string>;

const readme = `# Player web ediSVG

Este pacote funciona em aplicativos web com JavaScript, TypeScript, React ou outros frameworks.
Não depende do Sistema Zero, Electron, conta ou licença do editor. Não é um pacote publicado no npm.

Exporte a arte em "Animação para web" no ediSVG e coloque o arquivo como animation.edi-animation.json
ao lado dos exemplos. Sirva esta pasta por HTTP, com módulos .mjs como text/javascript. Abrir o HTML
diretamente pelo sistema de arquivos não funciona por causa das regras de módulos do navegador.

O exemplo HTML usa o player uma vez por aplicativo, com sessões independentes para cada SVG.
O exemplo React usa a versão de React já instalada no aplicativo e é uma fronteira cliente para
Next.js. Cada montagem cria seu SVG e o descarta ao sair, inclusive no StrictMode. Ajuste o caminho
da arte à pasta pública do aplicativo. Passe somente URLs de mídia confiáveis e valide uploads com
normalizeWebAnimation no servidor. O arquivo é declarativo, sem JavaScript da arte.

mountWebAnimation recebe SVG, arte e opções. O retorno oferece play, pause, reset, setInput,
setInputs, trigger, setMachine, inspect e destroy. Inputs e máquinas usam seus nomes públicos do
ediSVG; consulte readWebAnimation antes de ligar uma integração. Eventos gráficos não autorizam
pagamentos, recompensas ou outras decisões de servidor.

Por padrão a arte respeita movimento reduzido e pausa fora da tela. Defina as dimensões do host
para evitar mudança de layout. O PNG incorporado é a reserva estática e pode ser extraído com
webAnimationPoster no servidor. O módulo edi-web-data.mjs não precisa de DOM. Não monte um segundo
runtime para cada arquivo: importe edi-web-player.mjs uma vez. Layouts usam WASM incorporado;
quando houver CSP, permita wasm-unsafe-eval, sem liberar unsafe-eval ou scripts enviados no upload.
Fontes e imagens incorporadas seguem os limites e verificações do formato edi-animation v1.

Mantenha os módulos, declarações e THIRD_PARTY_LICENSES.txt juntos ao redistribuir. O manifesto
registra hashes dos arquivos. Nenhum arquivo inclui dados de conta ou código de servidor.
`;

const htmlExample = `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Arte ediSVG</title>
<svg id="art" role="img" aria-label="Animação" style="width: min(100%, 480px); aspect-ratio: 1"></svg>
<p id="status" role="status"></p>
<script type="module">
import { mountWebAnimation } from './edi-web-player.mjs';
const controller = new AbortController();
addEventListener('pagehide', () => controller.abort(), { once: true });
try {
  const response = await fetch('./animation.edi-animation.json', { signal: controller.signal });
  if (!response.ok) throw new Error('Não foi possível carregar a arte.');
  await mountWebAnimation(document.querySelector('#art'), await response.text(), {
    signal: controller.signal,
    onError: () => { document.querySelector('#status').textContent = 'Arte indisponível.'; }
  });
} catch (error) {
  if (!controller.signal.aborted) document.querySelector('#status').textContent = error.message;
}
</script></html>
`;

const reactExample = `"use client";
import { useEffect, useRef, useState } from "react";
import { mountWebAnimation } from "./edi-web-player.mjs";

export default function EdiAnimation({ src = "/animation.edi-animation.json", title = "Animação" }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const controller = new AbortController();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.setAttribute("aria-hidden", "true");
    host.current.replaceChildren(svg);
    setFailed(false);
    void (async () => {
      const response = await fetch(src, { signal: controller.signal });
      if (!response.ok) throw new Error("Arte indisponível.");
      await mountWebAnimation(svg, await response.text(), {
        signal: controller.signal,
        onError: () => { if (!controller.signal.aborted) setFailed(true); }
      });
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); svg.remove(); };
  }, [src]);
  return <div role="img" aria-label={title} style={{ width: "100%", aspectRatio: "1" }}>
    <div ref={host} style={{ width: "100%", height: "100%" }} />
    {failed && <span role="status">Arte indisponível.</span>}
  </div>;
}
`;

export function buildWebPlayerPackage(files: WebPlayerFiles) {
  if (
    Object.keys(files).length !== WEB_PLAYER_FILES.length ||
    WEB_PLAYER_FILES.some((name) => typeof files[name] !== "string" || !files[name].trim()) ||
    !files["THIRD_PARTY_LICENSES.txt"].includes("MIT License") ||
    !files["edi-web-player.mjs"].includes("mountWebAnimation") ||
    !files["edi-web-data.mjs"].includes("normalizeWebAnimation")
  )
    throw new Error("Player web ou licenças indisponíveis.");
  const entries: Record<string, Uint8Array> = Object.fromEntries(
    Object.entries({
      ...files,
      "README.md": readme,
      "example.html": htmlExample,
      "EdiAnimation.tsx": reactExample,
    }).map(([name, text]) => [name, strToU8(text)]),
  );
  entries["manifest.json"] = strToU8(
    JSON.stringify(
      {
        format: "edi-web-player",
        version: 1,
        animationFormat: 1,
        files: Object.fromEntries(
          Object.entries(entries).map(([name, bytes]) => [
            name,
            {
              bytes: bytes.byteLength,
              sha256: assetId(bytes).slice(6),
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
  if (Object.values(entries).reduce((sum, bytes) => sum + bytes.byteLength, 0) > 10_000_000)
    throw new Error("Player web excede 10 MB.");
  const content = zipSync(entries, { level: 6, mtime: new Date(1980, 0, 1) });
  if (content.byteLength > 10_000_000) throw new Error("Player web excede 10 MB.");
  return { content, extension: "web-player.zip", type: "application/zip" };
}

export async function loadWebPlayerPackage(signal?: AbortSignal) {
  const entries = await Promise.all(
    WEB_PLAYER_FILES.map(async (name) => {
      const path = name === "THIRD_PARTY_LICENSES.txt" ? "edi-player.licenses.txt" : name;
      const response = await fetch(path, { signal });
      if (!response.ok) throw new Error("Não foi possível carregar o player web.");
      const text = await response.text();
      if (text.length > 10_000_000) throw new Error("Player web excede 10 MB.");
      return [name, text] as const;
    }),
  );
  signal?.throwIfAborted();
  return buildWebPlayerPackage(Object.fromEntries(entries) as WebPlayerFiles);
}
