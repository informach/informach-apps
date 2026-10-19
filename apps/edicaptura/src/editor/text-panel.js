import { OCR_TILED_LIMITS, OcrUnavailableError } from "@informach/edi-ocr";
import { recognizeTiledCanvas } from "@informach/edi-ocr/canvas";
import { findSensitiveData } from "@informach/edi-ocr/sensitive";
import { ocrLines, visibleText } from "../domain/ocr.ts";

const LANGUAGES = [
  ["por", "Português"],
  ["eng", "Inglês"],
  ["spa", "Espanhol"],
];
const KINDS = {
  email: "E-mail",
  phone: "Telefone",
  cpf: "CPF",
  cnpj: "CNPJ",
  credential: "Credencial",
};
const MASK_MARGIN = 3;
const host = {
  createWorker: () => new Worker(new URL("./ocr-worker.js", import.meta.url), { type: "module" }),
  assets: new URL("../ocr/", document.baseURI).href,
};

/**
 * "Texto da imagem": local OCR of the open capture (original raster, same pixels as the
 * annotations), corrections per line, copy of the text the final image still shows, and assisted
 * detection of personal data that becomes opaque masks only after review. Nothing leaves the
 * computer. Results of a capture that is no longer open are discarded.
 */
export function mountTextPanel({ api, engine, current, toast }) {
  const panel = document.createElement("details");
  panel.id = "ocr-panel";
  panel.innerHTML = `<summary>Texto da imagem</summary><fieldset id="ocr-languages"><legend>Idiomas</legend>${LANGUAGES.map(([code, label]) => `<label><input type="checkbox" value="${code}"${code === "spa" ? "" : " checked"}> ${label}</label>`).join("")}</fieldset><div class="object-actions"><button type="button" id="ocr-run">Reconhecer texto</button><button type="button" id="ocr-cancel" hidden>Cancelar</button></div><progress id="ocr-progress" max="1" value="0" hidden></progress><p id="ocr-status" role="status"></p><ol id="ocr-lines" aria-label="Linhas reconhecidas"></ol><div class="object-actions"><button type="button" id="ocr-copy">Copiar texto visível</button><button type="button" id="ocr-forget">Apagar texto reconhecido</button></div><p>Correções valem para a cópia e a busca; não mudam a imagem. Texto sob máscara, pixelização ou fora do recorte não é copiado.</p><h3>Dados sensíveis</h3><button type="button" id="ocr-sensitive">Procurar dados sensíveis</button><ul id="ocr-findings" aria-label="Dados sensíveis encontrados"></ul><button type="button" id="ocr-mask" hidden>Ocultar selecionados</button><p>Sugestão automática: pode deixar passar ou marcar a mais. Confira a imagem antes de compartilhar.</p>`;
  document.querySelector(".editor-extras")?.prepend(panel);
  const $ = (id) => panel.querySelector(`#${id}`);
  let sidecar = null,
    job = null,
    findings = [],
    generation = 0;
  const safe = (action) => async () => {
    try {
      await action();
    } catch (error) {
      toast(error.message, true);
    }
  };
  const doc = () => current();
  const usable = () => doc()?.kind === "image" && !!doc()?.id && !!engine.image;
  function status(text) {
    $("ocr-status").textContent = text;
  }
  function render() {
    const lines = sidecar ? ocrLines(sidecar) : [];
    $("ocr-run").disabled = !usable() || !!job;
    $("ocr-cancel").hidden = !job;
    $("ocr-progress").hidden = !job;
    $("ocr-copy").disabled = !lines.length || !!job;
    $("ocr-forget").disabled = !sidecar || !!job;
    $("ocr-sensitive").disabled = !lines.length || !!job;
    $("ocr-mask").hidden = !findings.length;
    const list = $("ocr-lines");
    list.replaceChildren(
      ...lines.map((line) => {
        const item = document.createElement("li");
        const input = document.createElement("input");
        input.value = line.text;
        input.setAttribute("aria-label", `Linha ${line.line + 1}: ${line.read}`);
        input.title = line.edited ? `Lido: ${line.read}` : "";
        input.onfocus = () => engine.setHighlights([line.box]);
        input.onblur = () => engine.setHighlights([]);
        input.onchange = safe(async () => {
          const edits = { ...sidecar.edits };
          if (input.value === line.read) delete edits[String(line.line)];
          else edits[String(line.line)] = input.value;
          const id = doc().id;
          const next = await api.ocrEdit({ id, edits });
          if (doc()?.id === id) {
            sidecar = next;
            render();
          }
        });
        item.append(input);
        return item;
      }),
    );
    const findingsList = $("ocr-findings");
    findingsList.replaceChildren(
      ...findings.map((finding, index) => {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = finding.selected;
        box.onchange = () => {
          findings[index].selected = box.checked;
        };
        label.append(
          box,
          ` ${KINDS[finding.kind]}: ${finding.text}${finding.confidence === "high" ? "" : " (conferir)"}`,
        );
        label.onmouseenter = () => engine.setHighlights(finding.boxes);
        label.onmouseleave = () => engine.setHighlights([]);
        item.append(label);
        return item;
      }),
    );
  }
  async function load(target, mine) {
    const value = await api.ocrRead(target.id);
    if (mine !== generation) return;
    if (value?.stale) {
      sidecar = null;
      status("O original mudou desde o reconhecimento. Reconheça o texto de novo.");
    } else {
      sidecar = value;
      status(
        !value
          ? "Texto ainda não reconhecido."
          : value.status === "empty"
            ? "Nenhum texto encontrado nesta captura."
            : `${ocrLines(value).length} linhas reconhecidas.`,
      );
    }
    render();
  }
  function activate(target) {
    generation++;
    job?.abort();
    job = null;
    sidecar = null;
    findings = [];
    engine.setHighlights?.([]);
    panel.hidden = target?.kind !== "image";
    status(
      target?.kind !== "image"
        ? ""
        : target.id
          ? "Lendo texto salvo…"
          : "Salve a captura para reconhecer o texto.",
    );
    render();
    if (target?.kind === "image" && target.id)
      load(target, generation).catch((error) => {
        status(`Texto salvo ilegível: ${error.message}`);
      });
  }
  $("ocr-run").onclick = safe(async () => {
    if (!usable()) return;
    const languages = [...panel.querySelectorAll("#ocr-languages input:checked")].map(
      (input) => input.value,
    );
    if (!languages.length) throw new Error("Escolha ao menos um idioma.");
    const image = engine.image;
    if (image.width > OCR_TILED_LIMITS.maxSide || image.height > OCR_TILED_LIMITS.maxSide)
      throw new Error("A imagem é grande demais para reconhecer o texto de uma vez.");
    const target = doc(),
      mine = generation,
      controller = new AbortController();
    job = controller;
    findings = [];
    status("Preparando o reconhecimento…");
    render();
    const canvas = document.createElement("canvas");
    try {
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      const result = await recognizeTiledCanvas(
        host,
        canvas,
        { languages },
        controller.signal,
        (value, stage) => {
          if (mine !== generation) return;
          $("ocr-progress").value = value;
          status(`${stage}… ${Math.round(value * 100)}%`);
        },
      );
      if (mine !== generation || doc()?.id !== target.id) return;
      const saved = await api.ocrSave({ id: target.id, languages, result });
      if (mine !== generation) return;
      sidecar = saved;
      status(
        saved.status === "empty"
          ? "Nenhum texto encontrado nesta captura."
          : `${ocrLines(saved).length} linhas reconhecidas. Confira e corrija se precisar.`,
      );
    } catch (error) {
      if (mine !== generation) return;
      if (error?.name === "AbortError") status("Reconhecimento cancelado.");
      else if (error instanceof OcrUnavailableError)
        status(`Reconhecimento indisponível neste computador: ${error.message}`);
      else throw error;
    } finally {
      canvas.width = 0;
      if (job === controller) job = null;
      render();
    }
  });
  $("ocr-cancel").onclick = () => job?.abort();
  $("ocr-copy").onclick = safe(async () => {
    const { text, hidden } = visibleText(ocrLines(sidecar), {
      annotations: engine.annotations,
      crop: engine.crop,
    });
    if (!text) throw new Error("Nenhum texto visível para copiar.");
    await api.ocrCopyText(text);
    toast(
      hidden
        ? `Texto copiado. ${hidden} linha(s) oculta(s) por máscara, recorte ou vazias ficaram de fora.`
        : "Texto copiado.",
    );
  });
  $("ocr-forget").onclick = safe(async () => {
    const id = doc().id;
    await api.ocrDelete(id);
    if (doc()?.id !== id) return;
    sidecar = null;
    findings = [];
    engine.setHighlights([]);
    status("Texto reconhecido apagado. A imagem não mudou.");
    render();
  });
  $("ocr-sensitive").onclick = () => {
    findings = findSensitiveData(sidecar.result.words).map((match) => ({
      ...match,
      selected: match.confidence === "high",
    }));
    status(
      findings.length
        ? `${findings.length} possível(is) dado(s) sensível(is). Marque o que deve ser ocultado.`
        : "Nenhum dado sensível sugerido. Confira a imagem mesmo assim.",
    );
    render();
  };
  $("ocr-mask").onclick = safe(async () => {
    const chosen = findings.filter((finding) => finding.selected);
    if (!chosen.length) throw new Error("Marque ao menos um item.");
    const { width, height } = engine.image;
    engine.addAnnotations(
      chosen.map(({ bounds }) => ({
        kind: "redact",
        x: Math.max(0, bounds.x0 - MASK_MARGIN),
        y: Math.max(0, bounds.y0 - MASK_MARGIN),
        x2: Math.min(width, bounds.x1 + MASK_MARGIN),
        y2: Math.min(height, bounds.y1 + MASK_MARGIN),
      })),
    );
    engine.setHighlights([]);
    findings = findings.filter((finding) => !finding.selected);
    status(`${chosen.length} máscara(s) opaca(s) adicionada(s). Desfazer remove todas de uma vez.`);
    render();
  });
  /** The text the final image shows, for the assistant's review; empty without recognized text. */
  function shareableText() {
    if (!sidecar) return "";
    return visibleText(ocrLines(sidecar), { annotations: engine.annotations, crop: engine.crop })
      .text;
  }
  return { activate, render, shareableText };
}
