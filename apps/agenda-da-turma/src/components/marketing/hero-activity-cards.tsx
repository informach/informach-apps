import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { CalendarClock, Check, Sparkles } from "lucide-react";

type Activity = {
  childName: string;
  subject: string;
  title: string;
  due: string;
  type: { label: string; tone: "primary" | "warning" | "success" };
  /** Maps to one of chart-1..5 (Matemática, Português, Ciências, História, Inglês). */
  chart: 1 | 2 | 3 | 4 | 5;
  done: boolean;
};

const FRONT_ACTIVITY: Activity = {
  childName: "Pedro",
  subject: "Matemática",
  title: "Prova de frações",
  due: "Quarta, 28 de maio",
  type: { label: "Prova", tone: "warning" },
  chart: 1,
  done: false,
};

const LEFT_ACTIVITY: Activity = {
  childName: "Júlia",
  subject: "Ciências",
  title: "Trabalho do sistema solar",
  due: "Sexta, 30 de maio",
  type: { label: "Trabalho", tone: "primary" },
  chart: 3,
  done: false,
};

const RIGHT_ACTIVITY: Activity = {
  childName: "Pedro",
  subject: "Português",
  title: "Lição da página 42",
  due: "Hoje",
  type: { label: "Tarefa", tone: "success" },
  chart: 2,
  done: true,
};

const CHART_TINT: Record<
  Activity["chart"],
  { bg: string; border: string; text: string; dot: string }
> = {
  1: { bg: "bg-chart-1/10", border: "border-chart-1/30", text: "text-chart-1", dot: "bg-chart-1" },
  2: { bg: "bg-chart-2/10", border: "border-chart-2/30", text: "text-chart-2", dot: "bg-chart-2" },
  3: { bg: "bg-chart-3/10", border: "border-chart-3/30", text: "text-chart-3", dot: "bg-chart-3" },
  4: { bg: "bg-chart-4/10", border: "border-chart-4/30", text: "text-chart-4", dot: "bg-chart-4" },
  5: { bg: "bg-chart-5/10", border: "border-chart-5/30", text: "text-chart-5", dot: "bg-chart-5" },
};

function ActivityCard({ activity, className }: { activity: Activity; className?: string }) {
  const tint = CHART_TINT[activity.chart];
  return (
    <Card
      className={`w-60 border-border/80 bg-card shadow-lg backdrop-blur-sm md:w-72 ${className ?? ""}`}
    >
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-2">
          {activity.type.tone === "primary" ? (
            <Badge className="gap-1">
              <Sparkles className="size-3" aria-hidden />
              {activity.type.label}
            </Badge>
          ) : activity.type.tone === "warning" ? (
            <Badge variant="secondary" className="gap-1">
              <CalendarClock className="size-3" aria-hidden />
              {activity.type.label}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 font-medium">
              <Check className="size-3" aria-hidden />
              {activity.type.label}
            </Badge>
          )}
          <p className="text-base font-semibold leading-tight tracking-tight">{activity.title}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tint.bg} ${tint.border} ${tint.text}`}
        >
          {activity.subject}
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className={`size-1.5 shrink-0 rounded-full ${tint.dot}`} />
            <span>Filho: {activity.childName}</span>
          </li>
          <li className="flex items-center gap-2">
            <CalendarClock className="size-3.5 text-muted-foreground/70" aria-hidden />
            <span>{activity.due}</span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className={`inline-flex size-4 items-center justify-center rounded-full ${
                activity.done ? "bg-chart-2/20 text-chart-2" : "bg-muted text-muted-foreground/60"
              }`}
              aria-hidden
            >
              <Check className="size-2.5" />
            </span>
            <span className={activity.done ? "line-through opacity-70" : ""}>
              {activity.done ? "Concluída" : "Pendente"}
            </span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

export function HeroActivityCards() {
  return (
    <div className="relative isolate flex min-h-[360px] items-center justify-center md:min-h-[420px]">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-primary/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-10 top-10 -z-10 size-40 rounded-full bg-secondary/30 blur-3xl"
        aria-hidden
      />

      <div className="relative h-[360px] w-full max-w-md md:h-[420px]">
        <div
          className="absolute left-0 top-12 -rotate-6 transition-transform duration-500 hover:rotate-0 motion-safe:animate-float-soft md:top-16"
          style={{ animationDelay: "0.6s" }}
        >
          <ActivityCard activity={LEFT_ACTIVITY} className="opacity-90" />
        </div>
        <div
          className="absolute right-0 top-1 rotate-6 transition-transform duration-500 hover:rotate-0 motion-safe:animate-float-soft md:top-2"
          style={{ animationDelay: "1.2s" }}
        >
          <ActivityCard activity={RIGHT_ACTIVITY} className="opacity-90" />
        </div>
        <div
          className="absolute left-1/2 top-20 -translate-x-1/2 transition-transform duration-500 hover:-translate-y-1 motion-safe:animate-float-soft md:top-24"
          style={{ animationDelay: "0s" }}
        >
          <ActivityCard activity={FRONT_ACTIVITY} />
        </div>
      </div>
    </div>
  );
}
