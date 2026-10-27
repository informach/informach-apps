import {
  Align,
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  loadYoga,
  MeasureMode,
  type Node,
  Overflow,
  PositionType,
  Wrap,
  type Yoga,
} from "yoga-layout/load";
import {
  type Bounds,
  defaultLayoutItem,
  type LayoutContainer,
  type LayoutDocument,
  type LayoutItem,
  type LayoutObject,
  type LayoutSize,
  parseLayout,
} from "./model";

export interface LayoutContainerResult {
  width: number;
  height: number;
  content: Bounds;
  overflow: boolean;
}
export interface LayoutResult {
  boxes: Map<string, Bounds>;
  containers: Map<string | null, LayoutContainerResult>;
}
export interface LayoutEngine {
  compute(
    document: LayoutDocument,
    viewport: { width: number; height: number },
    objects: ReadonlyMap<string, LayoutObject>,
    intrinsic: ReadonlyMap<string, Bounds>,
    /** The artboard's authored size, used by `rootSize` fixed axes. */
    design?: { width: number; height: number },
  ): LayoutResult;
}
let yogaPromise: Promise<Yoga> | undefined;
export async function createLayoutEngine(): Promise<LayoutEngine> {
  if (!yogaPromise)
    yogaPromise = loadYoga().catch((error) => {
      yogaPromise = undefined;
      throw error;
    });
  const yoga = await yogaPromise;
  const align = {
      start: Align.FlexStart,
      center: Align.Center,
      end: Align.FlexEnd,
      stretch: Align.Stretch,
      auto: Align.Auto,
    },
    justify = {
      start: Justify.FlexStart,
      center: Justify.Center,
      end: Justify.FlexEnd,
      "space-between": Justify.SpaceBetween,
      "space-around": Justify.SpaceAround,
      "space-evenly": Justify.SpaceEvenly,
    };
  return {
    compute(raw, viewport, objects, intrinsic, design = viewport) {
      if (
        ![viewport.width, viewport.height, design.width, design.height].every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 100000,
        )
      )
        throw new Error("Viewport de layout inválido.");
      const document = parseLayout(raw, objects),
        config = yoga.Config.create(),
        allocated: Node[] = [],
        actual = new Map<string, Node>(),
        owners = new Map<Node, string | null>(),
        parents = new Map<Node, Node>(),
        grids: {
          node: Node;
          cells: Node[];
          config: LayoutContainer;
          targetId: string | null;
          last: string;
        }[] = [];
      const styles = new Map(document.items.map((item) => [item.targetId, item])),
        containers = new Map(
          document.containers.map((container) => [container.targetId, container.config]),
        ),
        children = new Map<string | null, string[]>();
      for (const [id, object] of objects) {
        const list = children.get(object.parentId) ?? [];
        list.push(id);
        children.set(object.parentId, list);
      }
      config.setUseWebDefaults(true);
      config.setPointScaleFactor(0);
      const create = () => {
        if (allocated.length >= 6001) throw new Error("Orçamento de nós Yoga excedido.");
        const node = yoga.Node.create(config);
        allocated.push(node);
        return node;
      };
      const insert = (parent: Node, child: Node) => {
        parent.insertChild(child, parent.getChildCount());
        parents.set(child, parent);
      };
      const containerStyle = (node: Node, value: LayoutContainer) => {
        node.setFlexDirection(value.flow === "column" ? FlexDirection.Column : FlexDirection.Row);
        node.setDirection(value.direction === "rtl" ? Direction.RTL : Direction.LTR);
        node.setFlexWrap(value.flow === "grid" || value.wrap ? Wrap.Wrap : Wrap.NoWrap);
        node.setJustifyContent(justify[value.justify]);
        node.setAlignItems(align[value.align]);
        node.setAlignContent(Align.FlexStart);
        node.setGap(Gutter.Column, value.gap[0]);
        node.setGap(Gutter.Row, value.gap[1]);
        [Edge.Top, Edge.Right, Edge.Bottom, Edge.Left].forEach((edge, index) => {
          node.setPadding(edge, value.padding[index] ?? 0);
        });
        node.setOverflow(
          value.scroll ? Overflow.Scroll : value.clip ? Overflow.Hidden : Overflow.Visible,
        );
      };
      const size = (
        node: Node,
        value: LayoutSize,
        axis: "width" | "height",
        parent: LayoutContainer,
        position: LayoutItem["position"],
      ) => {
        const set = (value: number | "auto") =>
          axis === "width" ? node.setWidth(value) : node.setHeight(value);
        if (value.kind === "fixed") set(value.value);
        else if (value.kind === "percent") {
          if (axis === "width") node.setWidthPercent(value.value * 100);
          else node.setHeightPercent(value.value * 100);
        } else if (value.kind === "hug") set("auto");
        else if (position.kind === "absolute") set("auto");
        else if (
          (parent.flow === "row" && axis === "width") ||
          (parent.flow === "column" && axis === "height")
        ) {
          set("auto");
          node.setFlexBasis(0);
          node.setFlexGrow(value.weight);
        } else {
          set("auto");
          node.setAlignSelf(Align.Stretch);
        }
      };
      const build = (id: string, parent: LayoutContainer): Node => {
        const node = create(),
          style = styles.get(id) ?? defaultLayoutItem(id),
          container = containers.get(id);
        actual.set(id, node);
        owners.set(node, id);
        node.setFlexShrink(0);
        node.setAlignSelf(align[style.alignSelf]);
        node.setMinWidth(style.minWidth);
        node.setMaxWidth(style.maxWidth);
        node.setMinHeight(style.minHeight);
        node.setMaxHeight(style.maxHeight);
        [Edge.Top, Edge.Right, Edge.Bottom, Edge.Left].forEach((edge, index) => {
          node.setMargin(edge, style.margin[index] ?? 0);
        });
        size(node, style.width, "width", parent, style.position);
        size(node, style.height, "height", parent, style.position);
        if (style.aspectRatio !== null) node.setAspectRatio(style.aspectRatio);
        if (style.position.kind === "absolute") {
          node.setPositionType(PositionType.Absolute);
          for (const [edge, value] of [
            [Edge.Left, style.position.left],
            [Edge.Right, style.position.right],
            [Edge.Top, style.position.top],
            [Edge.Bottom, style.position.bottom],
          ] as const)
            if (value !== null) node.setPosition(edge, value);
        }
        if (container) {
          containerStyle(node, container);
          append(node, id, container);
        } else {
          const bounds = intrinsic.get(id);
          if (
            !bounds ||
            Object.values(bounds).some(
              (value) => !Number.isFinite(value) || Math.abs(value) > 1e7,
            ) ||
            bounds.width < 0 ||
            bounds.height < 0
          )
            throw new Error("Medida intrínseca ausente ou inválida.");
          node.setMeasureFunc((width, widthMode, height, heightMode) => ({
            width:
              widthMode === MeasureMode.Exactly
                ? width
                : widthMode === MeasureMode.AtMost
                  ? Math.min(width, bounds.width)
                  : bounds.width,
            height:
              heightMode === MeasureMode.Exactly
                ? height
                : heightMode === MeasureMode.AtMost
                  ? Math.min(height, bounds.height)
                  : bounds.height,
          }));
        }
        return node;
      };
      function append(node: Node, id: string | null, value: LayoutContainer) {
        const cells: Node[] = [];
        for (const child of children.get(id) ?? []) {
          if (value.flow === "grid" && styles.get(child)?.position.kind !== "absolute") {
            const cell = create();
            cell.setFlexDirection(FlexDirection.Column);
            cell.setFlexShrink(0);
            cell.setAlignItems(Align.Stretch);
            cell.setWidthPercent(100 / (value.columns?.kind === "fixed" ? value.columns.count : 1));
            const column: LayoutContainer = {
              ...value,
              flow: "column",
              columns: undefined,
              wrap: false,
              padding: [0, 0, 0, 0],
              gap: [0, 0],
            };
            insert(cell, build(child, column));
            insert(node, cell);
            cells.push(cell);
          } else insert(node, build(child, value));
        }
        if (value.flow === "grid")
          grids.push({ node, cells, config: value, targetId: id, last: "" });
      }
      try {
        const root = create();
        owners.set(root, null);
        containerStyle(root, document.root);
        const rootSize = document.rootSize ?? { width: "fill", height: "fill" },
          rootWidth =
            rootSize.width === "hug"
              ? undefined
              : rootSize.width === "fixed"
                ? design.width
                : viewport.width,
          rootHeight =
            rootSize.height === "hug"
              ? undefined
              : rootSize.height === "fixed"
                ? design.height
                : viewport.height;
        if (rootWidth === undefined) root.setWidthAuto();
        else root.setWidth(rootWidth);
        if (rootHeight === undefined) root.setHeightAuto();
        else root.setHeight(rootHeight);
        append(root, null, document.root);
        let settled = false;
        for (let pass = 0; pass < 35; pass++) {
          root.calculateLayout(
            rootWidth,
            rootHeight,
            document.root.direction === "rtl" ? Direction.RTL : Direction.LTR,
          );
          let changes = 0;
          for (const grid of grids) {
            const innerWidth = Math.max(
                0,
                grid.node.getComputedWidth() - grid.config.padding[1] - grid.config.padding[3],
              ),
              innerHeight = Math.max(
                0,
                grid.node.getComputedHeight() - grid.config.padding[0] - grid.config.padding[2],
              ),
              count =
                grid.config.columns?.kind === "fixed"
                  ? grid.config.columns.count
                  : Math.max(
                      1,
                      Math.min(
                        24,
                        Math.floor(
                          (innerWidth + grid.config.gap[0]) /
                            ((grid.config.columns?.minWidth ?? 1) + grid.config.gap[0]),
                        ),
                      ),
                    ),
              rows = Math.max(1, Math.ceil(grid.cells.length / count)),
              minimumHeight = Math.max(
                0,
                ...grid.cells.map((cell) => {
                  const child = cell.getChild(0);
                  return (
                    child.getComputedHeight() +
                    child.getComputedMargin(Edge.Top) +
                    child.getComputedMargin(Edge.Bottom)
                  );
                }),
              ),
              width = Math.max(0, (innerWidth - grid.config.gap[0] * (count - 1)) / count),
              fixedHeight =
                grid.targetId === null ||
                (styles.get(grid.targetId)?.height.kind ?? "hug") !== "hug",
              height = fixedHeight
                ? Math.max(minimumHeight, (innerHeight - grid.config.gap[1] * (rows - 1)) / rows)
                : null,
              stamp = JSON.stringify([count, width, height]);
            if (stamp === grid.last) continue;
            grid.last = stamp;
            changes++;
            for (const cell of grid.cells) {
              cell.setWidth(width);
              if (height === null) cell.setHeightAuto();
              else cell.setHeight(height);
            }
          }
          if (changes === 0) {
            settled = true;
            break;
          }
        }
        if (!settled) throw new Error("Layout de grade não convergiu; nenhuma alteração aplicada.");
        const boxes = new Map<string, Bounds>(),
          resultContainers: LayoutResult["containers"] = new Map();
        for (const [id, node] of actual) {
          let x = node.getComputedLeft(),
            y = node.getComputedTop(),
            parent = parents.get(node);
          while (parent && !owners.has(parent)) {
            x += parent.getComputedLeft();
            y += parent.getComputedTop();
            parent = parents.get(parent);
          }
          const bounds = { x, y, width: node.getComputedWidth(), height: node.getComputedHeight() };
          if (
            Object.values(bounds).some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7)
          )
            throw new Error("Resultado de layout fora dos limites.");
          boxes.set(id, bounds);
        }
        for (const [node, id] of owners) {
          const setting = id === null ? document.root : containers.get(id);
          if (!setting) continue;
          const width = node.getComputedWidth(),
            height = node.getComputedHeight(),
            list = (children.get(id) ?? []).flatMap((child) => {
              const box = boxes.get(child);
              return box ? [box] : [];
            }),
            left = Math.min(0, ...list.map((box) => box.x)),
            top = Math.min(0, ...list.map((box) => box.y)),
            right = Math.max(width, ...list.map((box) => box.x + box.width + setting.padding[1])),
            bottom = Math.max(
              height,
              ...list.map((box) => box.y + box.height + setting.padding[2]),
            );
          resultContainers.set(id, {
            width,
            height,
            content: { x: left, y: top, width: right - left, height: bottom - top },
            overflow: left < 0 || top < 0 || right > width + 0.001 || bottom > height + 0.001,
          });
        }
        return { boxes, containers: resultContainers };
      } finally {
        // Determine all forest roots before freeing any descendants. Build/measure
        // errors may leave a partially attached tree; those nodes are freed too.
        const roots = allocated.filter((node) => !parents.has(node));
        for (const node of roots) node.freeRecursive();
        config.free();
      }
    },
  };
}
