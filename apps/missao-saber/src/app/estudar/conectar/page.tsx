import { redirect } from "next/navigation";
import { safeDestination } from "@/features/study-access/policy";
export default async function Connect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  redirect(
    `/estudar?next=${encodeURIComponent(safeDestination((await searchParams).next, "study"))}`,
  );
}
