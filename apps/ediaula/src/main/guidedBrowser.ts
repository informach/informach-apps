import { BrowserWindow, screen } from "electron";
import type { BrowserTarget, GuidedTarget } from "../shared/guidedRecording.ts";

let lesson: BrowserWindow | null = null;
const webUrl = (value: string): string => {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Informe um endereço http ou https da plataforma.");
  return url.href;
};

export async function openGuidedBrowser(url: string): Promise<void> {
  const address = webUrl(url);
  if (!lesson || lesson.isDestroyed()) {
    lesson = new BrowserWindow({
      width: 1280,
      height: 800,
      title: "EdiAula · Ambiente de aula · F8 volta ao gravador",
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: "persist:ediaula-guided-web",
        backgroundThrottling: false,
      },
    });
    const window = lesson;
    window.setMenuBarVisibility(false);
    window.webContents.on("page-title-updated", (e) => e.preventDefault());
    window.webContents.on("will-navigate", (e, next) => {
      try {
        webUrl(next);
      } catch {
        e.preventDefault();
      }
    });
    window.webContents.setWindowOpenHandler(({ url: next }) => {
      try {
        void window.loadURL(webUrl(next)).catch(() => {});
      } catch {
        /* Non-web links do not belong to a lesson. */
      }
      return { action: "deny" };
    });
    window.on("closed", () => {
      lesson = null;
    });
    window.maximize();
  }
  lesson.show();
  lesson.focus();
  await lesson.loadURL(address);
}

function windowId(window: BrowserWindow): string {
  const handle = window.getNativeWindowHandle();
  return (handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString();
}

/** The remote page has no preload or Node access. These expressions only read its DOM. */
export async function captureBrowserTarget(target: GuidedTarget): Promise<GuidedTarget> {
  if (!lesson || lesson.isDestroyed() || target.window !== windowId(lesson)) return target;
  const bounds = lesson.getContentBounds();
  const dip = screen.screenToDipPoint({ x: target.x, y: target.y });
  const zoom = lesson.webContents.getZoomFactor();
  const point = { x: (dip.x - bounds.x) / zoom, y: (dip.y - bounds.y) / zoom };
  const browser: BrowserTarget | null = await lesson.webContents.executeJavaScript(`(() => {
    const p = ${JSON.stringify(point)};
    let el = document.elementFromPoint(p.x, p.y);
    if (!el) return null;
    el = el.closest('button,a,input,select,textarea,[role="button"]') || el;
    const unique = s => document.querySelectorAll(s).length === 1;
    let selector = '';
    for (const attr of ['data-testid','data-test','id','aria-label']) {
      const value = el.getAttribute(attr);
      if (value) { const s = '[' + attr + '="' + CSS.escape(value) + '"]'; if (unique(s)) { selector = s; break; } }
    }
    if (!selector) {
      const parts = []; let n = el;
      while (n && n.nodeType === 1) {
        const siblings = n.parentElement ? Array.from(n.parentElement.children).filter(x => x.tagName === n.tagName) : [n];
        parts.unshift(n.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(n) + 1) + ')');
        n = n.parentElement;
      }
      selector = parts.join(' > ');
    }
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || !unique(selector)) return null;
    const kind = el.tagName === 'CANVAS' ? 'canvas' : el.tagName === 'IFRAME' ? 'frame' : 'element';
    const label = el.matches('button,a,[role="button"]') ? (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 100) : '';
    return { selector, url: location.href, kind, label, u: kind === 'element' ? 0.5 : (p.x - rect.left) / rect.width, v: kind === 'element' ? 0.5 : (p.y - rect.top) / rect.height };
  })()`);
  if (!browser)
    throw new Error("Não consegui identificar o elemento. Marque um alvo dentro da aula.");
  return { ...target, browser };
}

export async function resolveBrowserTarget(target: GuidedTarget): Promise<GuidedTarget> {
  if (!target.browser) return target;
  if (!lesson || lesson.isDestroyed() || target.window !== windowId(lesson))
    throw new Error("A janela da aula foi fechada. Abra-a e marque os alvos novamente.");
  const point: { x: number; y: number } = await lesson.webContents.executeJavaScript(`(() => {
    const target = ${JSON.stringify(target.browser)};
    if (location.href !== target.url) throw new Error('A página mudou. Revise o alvo desta etapa.');
    const found = document.querySelectorAll(target.selector);
    if (found.length !== 1) throw new Error('Alvo ausente ou ambíguo.');
    const el = found[0];
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error('O alvo está desativado.');
    const label = el.matches('button,a,[role="button"]') ? (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 100) : '';
    if (target.label !== label) throw new Error('O conteúdo do botão mudou.');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * target.u, y = r.top + r.height * target.v;
    const hit = document.elementFromPoint(x,y);
    if (!r.width || !r.height || !hit || !(el === hit || el.contains(hit))) throw new Error('O alvo não está visível ou está coberto.');
    return { x, y };
  })()`);
  const bounds = lesson.getContentBounds();
  const zoom = lesson.webContents.getZoomFactor();
  const physical = screen.dipToScreenPoint({
    x: Math.round(bounds.x + point.x * zoom),
    y: Math.round(bounds.y + point.y * zoom),
  });
  return { ...target, ...physical };
}
