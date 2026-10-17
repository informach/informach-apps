import { animations } from "../../shared/animation.js";
import { snapshot } from "../../shared/project.js";
import { renderScene } from "../../shared/scene.js";

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
export async function exportProject(state, options) {
  let svg;
  if (state.scene) svg = renderScene(state.scene);
  else {
    const response = await fetch("assets/zeze.svg");
    if (!response.ok) throw new Error("Mascote indisponível");
    svg = await response.text();
  }
  const viewBox = state.scene ? state.scene.viewBox.join(" ") : "0 0 260 360";
  svg = svg.replace(/<title>.*?<\/title>/, "<title>" + escapeHtml(options.alt) + "</title>");
  const t = state.transforms;
  const transform = `translate(${t.x}px, ${t.y}px) rotate(${t.rotation}deg) scale(${t.sx}, ${t.sy})`;
  const css = `@keyframes Parado{50%{transform:translateY(-3px) scale(1.012)}}@keyframes Acenar{25%{transform:rotate(7deg)}75%{transform:rotate(-7deg)}}@keyframes Pular{50%{transform:translateY(-70px)}}.motion{transform-origin:50% 80%;animation-timing-function:ease-in-out}.Parado{animation-name:Parado;animation-duration:2s;animation-iteration-count:infinite}.Acenar{animation-name:Acenar;animation-duration:1.2s;animation-iteration-count:infinite;animation-direction:alternate}.Pular{animation-name:Pular;animation-duration:.8s;animation-iteration-count:1}${options.reduced ? "@media(prefers-reduced-motion:reduce){.motion{animation:none!important}}" : ""}`;
  const body = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  const animated = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${escapeHtml(options.alt)}"><style>${css}</style><g style="transform:${transform};transform-origin:50% 80%;opacity:${t.opacity / 100}"><g class="motion ${state.animation}">${body}</g></g></svg>`;
  let content, extension, type;
  if (options.format === "json") {
    extension = "edisvg.json";
    type = "application/json";
    content = JSON.stringify(
      {
        ...snapshot(state),
        animations,
        svg,
        limitations: ["Movimento global; sem deformação de malha ou IK"],
      },
      null,
      2,
    );
  } else if (options.format === "svg") {
    extension = "svg";
    type = "image/svg+xml";
    content = animated;
  } else {
    extension = "html";
    type = "text/html";
    content = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(state.name)} — EdiSVG</title><style>body{margin:0;min-height:100dvh;display:grid;place-content:center;text-align:center;background:#f2efe8;font:14px system-ui;color:#0c2044}button{width:360px;max-width:90vw;height:440px;background:none;border:0;cursor:pointer}button:focus-visible{outline:2px solid #0c2044}svg{height:100%;width:100%}p{opacity:.65}</style><button aria-label="Interagir com ${escapeHtml(state.name)}">${animated}</button><p>Passe o mouse para acenar. Clique para pular.</p><script>const button=document.querySelector('button'),motion=document.querySelector('.motion');let hovering=false,jumping=false;function set(name){motion.setAttribute('class','motion '+name)}set('Parado');button.onmouseenter=()=>{hovering=true;if(!jumping)set('Acenar')};button.onmouseleave=()=>{hovering=false;if(!jumping)set('Parado')};button.onclick=()=>{if(jumping)return;jumping=true;set('Pular');setTimeout(()=>{jumping=false;set(hovering?'Acenar':'Parado')},800)};${options.offscreen ? "new IntersectionObserver(entries=>{motion.style.animationPlayState=entries[0].isIntersecting?'running':'paused'}).observe(button);" : ""}</script></html>`;
  }
  if (globalThis.window?.desktop) return window.desktop.exportFile({ content, extension });
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `zeze.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
