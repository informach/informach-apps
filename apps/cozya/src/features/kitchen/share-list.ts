import { CATEGORIES, shoppingCategory } from "./ingredients";

type ListItem = {
  name: string;
  amount: string;
  category: string;
  state: "todo" | "have" | "bought";
};

/**
 * The list as a WhatsApp message for whoever goes to the market: only what is still missing,
 * grouped like the aisles. No account, no link back: just the text.
 */
export function buildShoppingListText(weekLabel: string, items: ListItem[]): string {
  const missing = items.filter((item) => item.state === "todo");
  const lines = [`*Lista do mercado* · ${weekLabel}`];
  for (const [category, title] of Object.entries(CATEGORIES)) {
    const group = missing.filter((item) => shoppingCategory(item.category) === category);
    if (!group.length) continue;
    lines.push("", `*${category === "despensa" ? "Da despensa" : title}*`);
    for (const item of group)
      lines.push(
        `• ${item.name}${item.amount && item.amount !== "Conferir" ? `: ${item.amount}` : ""}`,
      );
  }
  if (!missing.length) lines.push("", "Tudo em casa.");
  return lines.join("\n");
}

export function buildShoppingWhatsappUrl(weekLabel: string, items: ListItem[]): string {
  return `https://wa.me/?text=${encodeURIComponent(buildShoppingListText(weekLabel, items))}`;
}
