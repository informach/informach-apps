/**
 * The script main/guidedCdp.ts runs in an isolated world of the lesson page (the page's own
 * scripts cannot see or change it). It only reads the DOM and reports facts; the choice of an
 * element is made by shared/locators.ts, so the same rules hold in the tests. It defines
 * `__ediaulaGuided` once per world:
 *
 * - `locate(locator)`: candidates of every strategy but "role" (main asks the Accessibility
 *   domain for those) and the Blockly part of the page as JSON when a strategy needs it;
 * - `facts(element, point)`, `factsIn(element, point, within)`: one candidate;
 * - `promote(element)`: the element a mark stands for (the block, the button around it);
 * - `describe(element, point)`: what is stable about a marked element (ElementDescription);
 * - `blockly()`: the Blockly SVG and toolbox as BlocklyNode JSON;
 * - `hits(points)`: the block or category on top at each point;
 * - `cursorAt(x, y)`: the computed cursor there, and whether the element takes typing.
 *
 * Plain JavaScript in a string: it must not depend on anything the bundler adds.
 */
export const LOCATOR_PAGE_SCRIPT = String.raw`(() => {
  if (globalThis.__ediaulaGuided) return true;
  const norm = (s) => String(s == null ? "" : s).normalize("NFC").replace(/\s+/g, " ").trim();
  const low = (s) => norm(s).toLocaleLowerCase("pt-BR");
  const CLICKABLE =
    'button,a[href],input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],' +
    '[role="menuitem"],[role="checkbox"],[role="radio"],[role="option"],[role="switch"],' +
    '[contenteditable="true"],[onclick]';
  const TESTID = ["data-testid", "data-test", "data-test-id", "data-qa", "data-cy"];
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };
  const textOf = (el) => norm(el.textContent).slice(0, 200);
  const editable = (el) =>
    !!el &&
    (el.isContentEditable ||
      (el.tagName === "INPUT" && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(el.type)) ||
      el.tagName === "TEXTAREA");

  function facts(el, point) {
    const r = rectOf(el);
    const st = getComputedStyle(el);
    const visible =
      r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) !== 0;
    const inView = r.x + r.width > 0 && r.y + r.height > 0 && r.x < innerWidth && r.y < innerHeight;
    const enabled =
      el.disabled !== true &&
      el.getAttribute("aria-disabled") !== "true" &&
      !el.closest("fieldset:disabled") &&
      !el.closest("[inert]");
    const p = point || { u: 0.5, v: 0.5 };
    let covered = true;
    if (visible && inView) {
      const x = Math.min(innerWidth - 1, Math.max(0, r.x + r.width * p.u));
      const y = Math.min(innerHeight - 1, Math.max(0, r.y + r.height * p.v));
      const hit = document.elementFromPoint(x, y);
      covered = !(hit && (hit === el || el.contains(hit)));
    }
    return { tag: el.tagName.toLowerCase(), text: textOf(el), rect: r, visible, enabled, covered, inView, cursor: st.cursor };
  }

  function byLabel(value, scope) {
    const want = low(value);
    const out = new Set();
    for (const el of scope.querySelectorAll("[aria-label],[placeholder],[title],[alt]"))
      for (const attr of ["aria-label", "placeholder", "title", "alt"])
        if (low(el.getAttribute(attr)) === want) out.add(el);
    for (const label of scope.querySelectorAll("label"))
      if (low(label.textContent) === want && label.control) out.add(label.control);
    return [...out];
  }

  function byText(value, tag, scope) {
    const want = low(value);
    const root = scope === document ? document.body : scope;
    if (!root || !want) return [];
    const out = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const own = low(n.data);
      if (!own || own.length > want.length || !want.includes(own)) continue;
      let el = n.parentElement;
      if (!el || el.closest("script,style,noscript,template")) continue;
      while (el && low(el.textContent) !== want) {
        if (low(el.textContent).length > want.length || el === root) {
          el = null;
          break;
        }
        el = el.parentElement;
      }
      if (!el) continue;
      if (tag && el.tagName.toLowerCase() !== tag) {
        const up = el.closest(tag);
        if (up && low(up.textContent) === want) el = up;
      }
      const action = el.closest(CLICKABLE);
      if (action && low(action.textContent) === want) el = action;
      out.add(el);
    }
    return [...out];
  }

  function query(s, scope) {
    try {
      switch (s.by) {
        case "testid":
          return [...scope.querySelectorAll(TESTID.map((a) => "[" + a + '="' + CSS.escape(s.value) + '"]').join(","))];
        case "data":
          return [...scope.querySelectorAll("[data-" + s.name + '="' + CSS.escape(s.value) + '"]')];
        case "id": {
          const el = document.getElementById(s.value);
          return el && (scope === document || scope.contains(el)) ? [el] : [];
        }
        case "label":
          return byLabel(s.value, scope);
        case "text":
          return byText(s.value, s.tag, scope);
        case "css":
          return [...scope.querySelectorAll(s.value)];
        default:
          return [];
      }
    } catch {
      return [];
    }
  }

  function scopeOf(within) {
    if (!within) return document;
    const found = query(within, document);
    return found.length === 1 ? found[0] : null;
  }

  const KEEP =
    "svg,g.blocklyWorkspace,g.blocklyBlockCanvas,g.blocklyDraggable,g.blocklyEditableText,path.blocklyPath," +
    "text.blocklyText,.blocklyToolboxDiv,.blocklyToolbox,.blocklyToolboxCategory,.blocklyTreeRow," +
    ".blocklyTreeLabel,.blocklyToolboxCategoryLabel";
  function blockly() {
    const roots = [...document.querySelectorAll("svg.blocklySvg,svg.blocklyFlyout,.blocklyToolboxDiv,.blocklyToolbox")];
    const top = roots.filter((r) => !roots.some((o) => o !== r && o.contains(r)));
    const visit = (el, out) => {
      if (el.matches(KEEP)) {
        const node = { tag: el.tagName.toLowerCase(), cls: [...el.classList].filter((c) => c.startsWith("blockly")) };
        const key = el.getAttribute("data-id");
        if (key) node.key = key;
        if (el.matches("text,.blocklyTreeLabel,.blocklyToolboxCategoryLabel")) node.text = norm(el.textContent);
        if (el.matches("svg,g.blocklyDraggable,path.blocklyPath,text,.blocklyToolboxCategory,.blocklyTreeRow"))
          node.rect = rectOf(el);
        if (el.matches("g.blocklyBlockCanvas"))
          node.transform = el.getAttribute("transform") || el.style.transform || "";
        node.children = [];
        for (const child of el.children) visit(child, node.children);
        out.push(node);
      } else for (const child of el.children) visit(child, out);
    };
    const out = [];
    for (const root of top) visit(root, out);
    return out;
  }

  function hits(points) {
    return points.map((p) => {
      const el = document.elementFromPoint(p.x, p.y);
      if (!el) return null;
      const block = el.closest("g.blocklyDraggable");
      if (block) return block.getAttribute("data-id");
      const category = el.closest(".blocklyToolboxCategory,.blocklyTreeRow");
      if (category) {
        const label = category.querySelector(".blocklyTreeLabel,.blocklyToolboxCategoryLabel");
        return "toolbox:" + norm((label || category).textContent);
      }
      return null;
    });
  }

  function locate(locator) {
    const scope = scopeOf(locator.within);
    const matches = [];
    let needsBlockly = false;
    locator.strategies.forEach((s, strategy) => {
      if (s.by === "role") return;
      if (s.by === "blockly") {
        needsBlockly = true;
        return;
      }
      const found = scope ? query(s, scope) : [];
      matches.push({ strategy, candidates: found.slice(0, 50).map((el) => facts(el, locator.point)) });
    });
    return {
      url: location.href,
      view: { width: innerWidth, height: innerHeight },
      scoped: !!scope,
      matches,
      blockly: needsBlockly ? blockly() : null,
    };
  }

  const ROLE_OF = { BUTTON: "button", A: "link", SELECT: "combobox", TEXTAREA: "textbox", IMG: "img" };
  function cssOf(el) {
    const tag = el.tagName.toLowerCase();
    const classes = [...el.classList].filter((c) => /^[a-z][a-z-]{2,30}$/i.test(c) && !/\d/.test(c)).slice(0, 2);
    const tries = [];
    if (classes.length) tries.push(tag + classes.map((c) => "." + CSS.escape(c)).join(""));
    for (const attr of ["name", "type", "href", "src"]) {
      const v = el.getAttribute(attr);
      if (v && v.length <= 120) tries.push(tag + "[" + attr + '="' + CSS.escape(v) + '"]');
    }
    tries.push(tag);
    for (const t of tries) {
      try {
        if (document.querySelectorAll(t).length === 1) return t;
      } catch {}
    }
    return undefined;
  }
  function pathOf(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      const siblings = n.parentElement ? [...n.parentElement.children].filter((x) => x.tagName === n.tagName) : [n];
      parts.unshift(n.tagName.toLowerCase() + ":nth-of-type(" + (siblings.indexOf(n) + 1) + ")");
    }
    return parts.join(" > ");
  }

  /** The element a mark stands for: the block, the toolbox category or the control around it. */
  function promote(target) {
    const el = target && target.nodeType === 1 ? target : target && target.parentElement;
    if (!el) return null;
    const block = el.closest("g.blocklyDraggable");
    if (block) return block;
    const category = el.closest(".blocklyToolboxCategory,.blocklyTreeRow");
    if (category) return category;
    if (el.closest(".blocklyMainBackground")) return el;
    return el.closest(CLICKABLE) || el;
  }

  function describe(target, point) {
    const el = promote(target);
    if (!el) return null;
    let blockly = null;
    const background = el.closest(".blocklyMainBackground");
    if (el.matches("g.blocklyDraggable")) {
      const svg = el.closest("svg");
      blockly = { key: el.getAttribute("data-id"), area: svg && svg.matches(".blocklyFlyout") ? "flyout" : "workspace" };
    } else if (el.matches(".blocklyToolboxCategory,.blocklyTreeRow")) {
      const label = el.querySelector(".blocklyTreeLabel,.blocklyToolboxCategoryLabel");
      blockly = { key: "toolbox:" + norm((label || el).textContent), area: "toolbox" };
    }
    const r = rectOf(el);
    const p = point || { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const testidAttr = TESTID.find((a) => el.getAttribute(a));
    const data = [...el.attributes]
      .filter((a) => a.name.startsWith("data-") && !TESTID.includes(a.name))
      .slice(0, 6)
      .map((a) => ({ name: a.name.slice(5), value: a.value }));
    const labelText =
      el.getAttribute("aria-label") ||
      (el.labels && el.labels[0] ? norm(el.labels[0].textContent) : "") ||
      el.getAttribute("placeholder") ||
      el.getAttribute("title") ||
      "";
    const tag = el.tagName.toLowerCase();
    return {
      tag,
      text: textOf(el),
      testid: testidAttr ? el.getAttribute(testidAttr) : undefined,
      data,
      id: el.id || undefined,
      role: el.getAttribute("role") || ROLE_OF[el.tagName] || undefined,
      label: labelText ? norm(labelText).slice(0, 200) : undefined,
      css: cssOf(el),
      path: pathOf(el),
      blockly,
      workspace: !!background,
      kind: tag === "canvas" ? "canvas" : tag === "iframe" ? "frame" : "element",
      rect: r,
      cursor: getComputedStyle(el).cursor,
      view: { width: innerWidth, height: innerHeight },
      url: location.href,
      point: {
        u: r.width ? Math.min(1, Math.max(0, (p.x - r.x) / r.width)) : 0.5,
        v: r.height ? Math.min(1, Math.max(0, (p.y - r.y) / r.height)) : 0.5,
      },
    };
  }

  function factsIn(el, point, within) {
    const scope = scopeOf(within);
    if (!scope || (scope !== document && !scope.contains(el))) return null;
    return facts(el, point);
  }

  function cursorAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return { cursor: "default", editable: false };
    return { cursor: getComputedStyle(el).cursor, editable: editable(el) || editable(el.closest("input,textarea,[contenteditable]")) };
  }

  Object.defineProperty(globalThis, "__ediaulaGuided", {
    value: Object.freeze({ locate, facts, factsIn, promote, describe, blockly, hits, cursorAt }),
  });
  return true;
})()`;
