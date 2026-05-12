import type { ActivityListItem } from "@/features/activities/types";
import type { DashboardProfileSummary, DashboardSnapshot } from "./types";

type BuildArgs = {
  snapshot: DashboardSnapshot;
  profiles: Array<{ id: string; name: string }>;
  profileFilter: string | null;
  userName: string;
  generatedAtIso: string;
};

const ACTIVITY_TYPE_PT: Record<string, string> = {
  task: "Tarefa",
  exam: "Prova",
  project: "Trabalho",
  reminder: "Recado",
};

const SP_TZ = "America/Sao_Paulo";

// RGB literais — PDF não tem DOM, então não há tokens CSS para ler.
// Paleta light fixa: garante que o PDF seja sempre tema-claro mesmo
// quando o app estiver em dark mode.
const COLOR_TEXT: [number, number, number] = [17, 24, 39]; // gray-900
const COLOR_MUTED: [number, number, number] = [107, 114, 128]; // gray-500
const COLOR_BORDER: [number, number, number] = [229, 231, 235]; // gray-200
const COLOR_PRIMARY: [number, number, number] = [0, 111, 253]; // ~#006FFD
const COLOR_DESTRUCTIVE: [number, number, number] = [239, 68, 68]; // red-500
const COLOR_WARNING: [number, number, number] = [249, 115, 22]; // orange-500
const COLOR_SUCCESS: [number, number, number] = [16, 185, 129]; // emerald-500

function formatDueDate(iso: string): string {
  // ISO "YYYY-MM-DD" — converte direto sem TZ shenanigans.
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  const dateStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SP_TZ,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
  const timeStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SP_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${dateStr} às ${timeStr}`;
}

function todayFilename(): string {
  const date = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SP_TZ }).format(date);
  return `agenda-da-turma-${parts}.pdf`;
}

function activityRow(item: ActivityListItem): string[] {
  const subjectAndTurma = `${item.subjectName} · ${item.grade}${item.classLetter}`;
  const statusLabel = item.status === "done" ? "Concluída" : "Pendente";
  return [
    formatDueDate(item.dueAt),
    ACTIVITY_TYPE_PT[item.type] ?? item.type,
    subjectAndTurma,
    item.title,
    item.studentProfileName,
    statusLabel,
  ];
}

export async function buildDashboardPdf(args: BuildArgs): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.autoTable;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const marginTop = 32;

  const filteredProfileName = args.profileFilter
    ? args.profiles.find((p) => p.id === args.profileFilter)?.name
    : null;
  const scopeLabel = filteredProfileName ? `Perfil: ${filteredProfileName}` : "Todos os perfis";
  const generatedAtLabel = formatGeneratedAt(args.generatedAtIso);

  function drawHeader() {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, marginTop - 4, "F");

    doc.setTextColor(...COLOR_PRIMARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Agenda da Turma", marginX, 14);

    doc.setTextColor(...COLOR_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Painel de atividades", marginX, 20);

    doc.setTextColor(...COLOR_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(args.userName, marginX, 25);
    doc.text(scopeLabel, marginX, 29.5);

    const rightLabel = generatedAtLabel;
    doc.text(rightLabel, pageWidth - marginX, 25, { align: "right" });

    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.line(marginX, marginTop - 4, pageWidth - marginX, marginTop - 4);
  }

  function drawFooter(pageNumber: number, pageCount: number) {
    doc.setTextColor(...COLOR_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Gerado em ${generatedAtLabel}`, marginX, pageHeight - 8);
    doc.text(`Página ${pageNumber} de ${pageCount}`, pageWidth - marginX, pageHeight - 8, {
      align: "right",
    });
  }

  drawHeader();

  let cursorY = marginTop;

  // KPIs em grid 2×2.
  cursorY = drawKpis(doc, cursorY, marginX, pageWidth, args.snapshot.counters);

  // Progresso por perfil (mesma regra do dashboard-content.tsx).
  if (args.snapshot.perProfile.length >= 2 && args.profileFilter == null) {
    cursorY = drawPerProfileSection(doc, cursorY, marginX, args.snapshot.perProfile, autoTable);
  }

  cursorY = drawBucket(doc, cursorY, marginX, {
    title: "Atrasadas",
    items: args.snapshot.overdue,
    headFill: COLOR_DESTRUCTIVE,
    autoTable,
  });

  cursorY = drawBucket(doc, cursorY, marginX, {
    title: "Hoje",
    items: args.snapshot.today,
    headFill: COLOR_WARNING,
    autoTable,
  });

  cursorY = drawBucket(doc, cursorY, marginX, {
    title: "Próximos 7 dias",
    items: args.snapshot.upcoming,
    headFill: COLOR_PRIMARY,
    autoTable,
  });

  // Repinta header e footer em todas as páginas.
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      drawHeader();
    }
    drawFooter(i, totalPages);
  }

  doc.save(todayFilename());
}

type AutoTableFn = typeof import("jspdf-autotable")["autoTable"];

function drawKpis(
  doc: import("jspdf").jsPDF,
  startY: number,
  marginX: number,
  pageWidth: number,
  counters: DashboardSnapshot["counters"],
): number {
  const kpis: Array<{ label: string; value: number; accent: [number, number, number] }> = [
    { label: "Atrasadas", value: counters.overdue, accent: COLOR_DESTRUCTIVE },
    { label: "Hoje", value: counters.today, accent: COLOR_WARNING },
    { label: "Próximos 7 dias", value: counters.week, accent: COLOR_PRIMARY },
    { label: "Concluídas (7d)", value: counters.doneRecent, accent: COLOR_SUCCESS },
  ];

  const gap = 4;
  const cardWidth = (pageWidth - marginX * 2 - gap) / 2;
  const cardHeight = 22;

  kpis.forEach((kpi, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = marginX + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);

    doc.setDrawColor(...COLOR_BORDER);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "FD");

    doc.setFillColor(...kpi.accent);
    doc.rect(x, y, 1.5, cardHeight, "F");

    doc.setTextColor(...COLOR_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(kpi.label.toUpperCase(), x + 5, y + 7);

    doc.setTextColor(...COLOR_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(String(kpi.value), x + 5, y + 17);
  });

  return startY + 2 * (cardHeight + gap) + 4;
}

function drawSectionTitle(
  doc: import("jspdf").jsPDF,
  y: number,
  marginX: number,
  text: string,
): number {
  doc.setTextColor(...COLOR_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(text, marginX, y);
  return y + 3;
}

function drawPerProfileSection(
  doc: import("jspdf").jsPDF,
  startY: number,
  marginX: number,
  perProfile: DashboardProfileSummary[],
  autoTable: AutoTableFn,
): number {
  const afterTitle = drawSectionTitle(doc, startY + 2, marginX, "Progresso por perfil");

  autoTable(doc, {
    startY: afterTitle,
    margin: { left: marginX, right: marginX, top: 32, bottom: 18 },
    head: [["Perfil", "Pendentes", "Atrasadas", "Concluídas", "Progresso"]],
    body: perProfile.map((p) => [
      p.profileName,
      String(p.pending),
      String(p.overdue),
      String(p.doneTotal),
      `${p.progressPercent}%`,
    ]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5, textColor: COLOR_TEXT },
    headStyles: { fillColor: COLOR_PRIMARY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" },
    },
    theme: "grid",
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return (finalY ?? afterTitle) + 6;
}

function drawBucket(
  doc: import("jspdf").jsPDF,
  startY: number,
  marginX: number,
  opts: {
    title: string;
    items: ActivityListItem[];
    headFill: [number, number, number];
    autoTable: AutoTableFn;
  },
): number {
  if (opts.items.length === 0) {
    const afterTitle = drawSectionTitle(doc, startY + 2, marginX, `${opts.title} (0)`);
    doc.setTextColor(...COLOR_MUTED);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.text("Nada por aqui.", marginX, afterTitle + 4);
    return afterTitle + 10;
  }

  const afterTitle = drawSectionTitle(
    doc,
    startY + 2,
    marginX,
    `${opts.title} (${opts.items.length})`,
  );

  opts.autoTable(doc, {
    startY: afterTitle,
    margin: { left: marginX, right: marginX, top: 32, bottom: 18 },
    head: [["Data", "Tipo", "Matéria · Turma", "Atividade", "Estudante", "Status"]],
    body: opts.items.map(activityRow),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5, textColor: COLOR_TEXT },
    headStyles: { fillColor: opts.headFill, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 18 },
      3: { cellWidth: "auto" },
    },
    theme: "grid",
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return (finalY ?? afterTitle) + 6;
}
