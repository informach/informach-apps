/**
 * Navegação espacial por setas para TV (controle remoto) e teclado.
 * As setas movem o foco para o elemento focável mais próximo naquela direção;
 * Enter/OK aciona o botão; Voltar/Esc chama `onBack`.
 */
const FOCUSABLE = 'button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]';
const BACK_KEYS = new Set(["Escape", "Backspace", "BrowserBack", "GoBack"]);
// códigos do botão Voltar em controles de TV (webOS 461, Tizen 10009)
const BACK_CODES = new Set([461, 10009]);

type Dir = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function candidates(): HTMLElement[] {
  const modal = document.querySelector<HTMLElement>("[data-modal]");
  // o atalho "Pular para o conteúdo" é do teclado de computador, não do controle remoto
  return [...(modal ?? document).querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.classList.contains("skip") && visible(el),
  );
}

export function moveFocus(dir: Dir) {
  const all = candidates();
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !all.includes(cur)) {
    (document.querySelector<HTMLElement>("[data-autofocus]") ?? all[0])?.focus();
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const main =
      dir === "ArrowRight" ? dx : dir === "ArrowLeft" ? -dx : dir === "ArrowDown" ? dy : -dy;
    const cross = dir === "ArrowRight" || dir === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
    if (main <= 4) continue;
    const score = main + cross * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
}

export function installFocusNav(onBack: () => void) {
  const handler = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA";
    if (
      e.key.startsWith("Arrow") &&
      !(typing && (e.key === "ArrowLeft" || e.key === "ArrowRight"))
    ) {
      e.preventDefault();
      moveFocus(e.key as Dir);
    } else if (
      (BACK_KEYS.has(e.key) && !(typing && e.key === "Backspace")) ||
      BACK_CODES.has(e.keyCode)
    ) {
      e.preventDefault();
      onBack();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
