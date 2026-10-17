import { PRODUCTS, type ProductKey } from "@/lib/products";

const EDI_STRIPES = ["#C8E64A", "#5ED3B3", "#FF8F7E", "#8CB6FF", "#C2A5FF"];

/** Quadrado com a cor do produto. A Suíte Edi leva as cinco faixas das ferramentas. */
export function ProductMark({ product, size = 30 }: { product: ProductKey; size?: number }) {
  const { mark } = PRODUCTS[product];
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: mark.background,
      }}
    >
      {product === "edi" ? (
        <span className="flex gap-[2px]">
          {EDI_STRIPES.map((color) => (
            <span
              key={color}
              style={{ width: 3, height: Math.round(size * 0.4), background: color }}
            />
          ))}
        </span>
      ) : null}
    </span>
  );
}

/** Etiqueta pequena com o nome do produto na cor dele. */
export function ProductTag({ product }: { product: ProductKey }) {
  const { mark, name } = PRODUCTS[product];
  return (
    <span
      className="inline-flex items-center rounded-lg px-2 py-0.5 text-[13px] font-bold"
      style={{ background: mark.background, color: mark.foreground }}
    >
      {name}
    </span>
  );
}
