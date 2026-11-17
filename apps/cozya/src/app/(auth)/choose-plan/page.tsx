import { redirect } from "next/navigation";
export default async function ChoosePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle } = await searchParams;
  redirect(`/upgrade?cycle=${cycle === "anual" || cycle === "annual" ? "annual" : "monthly"}`);
}
