import { readCalendarFeed } from "@/features/calendar-feed/service";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  };
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response(null, { status: 404, headers });
  const feed = await readCalendarFeed(token);
  if (!feed) return new Response(null, { status: 404, headers });
  return new Response(feed, {
    headers: {
      ...headers,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agenda-da-turma.ics"',
    },
  });
}
