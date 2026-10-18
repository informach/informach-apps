import { BrowserWindow, screen } from "electron";
import type { GuidedMark, GuidedMarkPurpose } from "../shared/guidedPlan.ts";
import type { BrowserTarget, GuidedTarget } from "../shared/guidedRecording.ts";
import { GUIDED_PARTITION } from "./guidedCapture.ts";
import { CdpDriver } from "./guidedCdp.ts";

/**
 * The lesson window: the platform opened in its own partition (the login stays there), with no
 * bridge to the editor. The teacher logs in and marks targets here; the guided take itself is
 * captured by an offscreen window of the same partition (main/guidedCapture.ts). Screen plans
 * still read its elements through executeJavaScript (captureBrowserTarget, resolveBrowserTarget).
 */

let lesson: BrowserWindow | null = null;
const webUrl = (value: string): string => {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Informe um endereço http ou https da plataforma.");
  return url.href;
};

/** `backKey` is the guided target shortcut as configured ("F8" by default). */
export async function openGuidedBrowser(url: string, backKey = "F8"): Promise<void> {
  const address = webUrl(url);
  if (!lesson || lesson.isDestroyed()) {
    lesson = new BrowserWindow({
      width: 1280,
      height: 800,
      title: `EdiAula · Ambiente de aula · ${backKey} volta ao gravador`,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: GUIDED_PARTITION,
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

/** The address the lesson window shows, when it is open. */
export function lessonUrl(): string | null {
  return lesson && !lesson.isDestroyed() ? lesson.webContents.getURL() : null;
}

/** Marking an element in the lesson window, without the real pointer doing anything. */
export interface MarkSession {
  /** The target key: the first press turns the inspector on, the second calls it off. */
  toggle(): void;
  cancel(): void;
  result: Promise<GuidedMark | null>;
}

const MARK_TEXT: Record<GuidedMarkPurpose, string> = {
  target: "o alvo",
  destination: "onde o arrasto termina",
  condition: "o elemento a esperar",
};

/**
 * The teacher goes to the element (navigating freely), presses `key` to turn the DevTools
 * inspector on (Overlay.setInspectMode) and clicks it: the node the inspector hands over is
 * described in its own frame and becomes a locator. A drag destination on a workspace block
 * means "below it"; on the workspace's background, that point of the workspace.
 */
export async function markInLesson(purpose: GuidedMarkPurpose, key: string): Promise<MarkSession> {
  const window = lesson;
  if (!window || window.isDestroyed())
    throw new Error("Abra a janela da aula e entre na plataforma antes de marcar.");
  const cdp = new CdpDriver(window.webContents);
  await cdp.attach();
  const title = window.getTitle();
  const what = MARK_TEXT[purpose];
  window.setTitle(`EdiAula · Marcar ${what}: vá até ele na página e pressione ${key}`);
  window.show();
  window.focus();
  let inspecting = false;
  let done = false;
  let settle: (value: GuidedMark | null) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const result = new Promise<GuidedMark | null>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  const finish = (): void => {
    if (done) return;
    done = true;
    off();
    window.removeListener("closed", closed);
    if (!window.isDestroyed()) {
      void cdp
        .inspect(false)
        .catch(() => undefined)
        .finally(() => cdp.detach());
      window.setTitle(title);
    } else cdp.detach();
  };
  const closed = (): void => {
    finish();
    fail(new Error("A janela da aula foi fechada."));
  };
  window.once("closed", closed);
  const off = cdp.on("Overlay.inspectNodeRequested", (params) => {
    if (params.__detached) {
      finish();
      fail(cdp.detachedError ?? new Error("A marcação foi interrompida."));
      return;
    }
    const id = params.backendNodeId;
    if (typeof id !== "number" || done) return;
    const bounds = window.getContentBounds();
    const cursor = screen.getCursorScreenPoint();
    const zoom = window.webContents.getZoomFactor();
    const page = { x: (cursor.x - bounds.x) / zoom, y: (cursor.y - bounds.y) / zoom };
    void cdp.mark(id, page).then(
      (marked) => {
        finish();
        if (marked.workspace) {
          if (purpose !== "destination")
            fail(new Error("Marque um bloco ou um elemento da página."));
          else settle({ workspace: marked.workspace, url: marked.url });
          return;
        }
        if (!marked.locator) {
          fail(new Error(marked.problem ?? "Não consegui identificar esse elemento."));
          return;
        }
        const locator =
          purpose === "destination"
            ? {
                ...marked.locator,
                strategies: marked.locator.strategies.map((s) =>
                  s.by === "blockly" && s.area === "workspace" ? { ...s, below: true } : s,
                ),
              }
            : marked.locator;
        settle({ locator, url: marked.url });
      },
      (error: unknown) => {
        finish();
        fail(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
  return {
    result,
    toggle: () => {
      if (done) return;
      if (inspecting) {
        finish();
        settle(null);
        return;
      }
      inspecting = true;
      window.setTitle(`EdiAula · Clique em ${what}. ${key} cancela`);
      window.focus();
      cdp.inspect(true).catch((error: unknown) => {
        finish();
        fail(error instanceof Error ? error : new Error(String(error)));
      });
    },
    cancel: () => {
      finish();
      settle(null);
    },
  };
}

/** Native handle of the lesson window while it is open, as the cursor helper names windows. */
export function guidedBrowserWindowIds(): string[] {
  return lesson && !lesson.isDestroyed() ? [windowId(lesson)] : [];
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
