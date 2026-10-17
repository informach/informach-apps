import type { Metadata } from "next";
import { ProductPage } from "@/features/products/components/product-view";
import { parseTab } from "@/features/products/logic";
import { getProductView } from "@/features/products/service";
import { requireStaff } from "@/lib/access";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const tab = parseTab((await searchParams).p);
  return <ProductPage view={await getProductView(tab, staff)} />;
}
