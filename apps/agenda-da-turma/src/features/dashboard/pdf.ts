import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import type { TaskRow } from "@/features/unified-activities/task-repository";
import type { DashboardProfileSummary, DashboardSnapshot } from "./types";

type BuildArgs = {
  snapshot: DashboardSnapshot;
  profiles: Array<{ id: string; name: string }>;
  profileFilter: string | null;
  userName: string;
  generatedAtIso: string;
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

const PDF_HEADER_HEIGHT = 44;
const LOGO_WIDTH = 64;
const LOGO_HEIGHT = 11.5;
const LOGO_SVG_URL = "/logotipo.svg";

let logoDataUrlPromise: Promise<string | null> | null = null;

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

/**
 * Uma linha da tabela por tarefa.
 *
 * Antes esta função precisava saber de qual tabela a linha tinha vindo para
 * achar a matéria e rotular a coluna "Turma". Com a convergência a matéria já
 * chega resolvida e a coluna diz a procedência que existir — turma publicada,
 * extracurricular ou recado — em vez de uma origem técnica.
 */
function activityRow(item: TaskRow): string[] {
  const statusLabel =
    item.status === "done" ? "Concluída" : item.status === "canceled" ? "Cancelada" : "Pendente";
  const trimmedDescription = item.description?.trim();
  // jspdf-autotable wrap nativo respeita \n quando overflow="linebreak"
  // (default). Indentação de 2 espaços nas linhas de observação cria a
  // hierarquia visual sem precisar de hook custom de render.
  const activityCell = trimmedDescription
    ? `${item.title}\n${trimmedDescription
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`
    : item.title;
  const turmaLabel =
    item.grade && item.classLetter
      ? `${item.grade}${item.classLetter}`
      : item.profileSubjectId
        ? "Extra"
        : item.noticeId
          ? "Recado"
          : "Família";
  return [
    item.dueAt ? formatDueDate(item.dueAt) : "A confirmar",
    ACTIVITY_TYPE_LABELS[item.type],
    item.subjectName ?? "—",
    turmaLabel,
    activityCell,
    item.profileName,
    statusLabel,
  ];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load PDF logo"));
    image.src = src;
  });
}

async function getLogoDataUrl(): Promise<string | null> {
  logoDataUrlPromise ??= (async () => {
    if (typeof document === "undefined") {
      return null;
    }

    const response = await fetch(LOGO_SVG_URL);
    if (!response.ok) {
      return null;
    }

    const svg = await response.text();
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

    try {
      const image = await loadImage(blobUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 1440;
      canvas.height = image.naturalHeight || 257;

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  })();

  return logoDataUrlPromise;
}

export async function buildDashboardPdf(args: BuildArgs): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.autoTable;
  const logoDataUrl = await getLogoDataUrl();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const marginTop = PDF_HEADER_HEIGHT;

  const filteredProfileName = args.profileFilter
    ? args.profiles.find((p) => p.id === args.profileFilter)?.name
    : null;
  const scopeLabel = filteredProfileName ? `Perfil: ${filteredProfileName}` : "Todos os perfis";
  const generatedAtLabel = formatGeneratedAt(args.generatedAtIso);

  function drawHeader() {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, marginTop - 4, "F");

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", marginX, 8, LOGO_WIDTH, LOGO_HEIGHT, "agenda-logo");
    } else {
      doc.setTextColor(...COLOR_PRIMARY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Agenda da Turma", marginX, 15);
    }

    doc.setTextColor(...COLOR_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Painel de atividades", marginX, 25);

    doc.setTextColor(...COLOR_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(args.userName, marginX, 30.5);

    const rightLabel = generatedAtLabel;
    doc.text(rightLabel, pageWidth - marginX, 25, { align: "right" });

    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.line(marginX, 32.5, pageWidth - marginX, 32.5);

    doc.setTextColor(...COLOR_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(scopeLabel, marginX, 38);
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
    margin: { left: marginX, right: marginX, top: PDF_HEADER_HEIGHT, bottom: 18 },
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
    items: TaskRow[];
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
    margin: { left: marginX, right: marginX, top: PDF_HEADER_HEIGHT, bottom: 18 },
    head: [["Data", "Tipo", "Matéria", "Turma", "Atividade", "Estudante", "Status"]],
    body: opts.items.map(activityRow),
    // valign:"top" alinha colunas curtas (Data/Tipo/etc.) ao topo quando a
    // célula "Atividade" gera múltiplas linhas por causa da observação. Sem
    // isso, jspdf-autotable centraliza vertical e a Data parece desalinhada.
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.3,
      textColor: COLOR_TEXT,
      valign: "top",
    },
    headStyles: { fillColor: opts.headFill, textColor: 255, fontStyle: "bold", valign: "middle" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      // Data "DD/MM/YYYY" mal cabia em 18mm (font 8.5 + padding 2.3 × 2) e o
      // último dígito do ano quebrava pra linha de baixo. 21mm dá folga
      // confortável. A coluna "Atividade" (índice 4, `auto`) encolhe sozinha.
      0: { cellWidth: 21 },
      1: { cellWidth: 17 },
      2: { cellWidth: 28 },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: "auto" },
      5: { cellWidth: 25 },
      6: { cellWidth: 18 },
    },
    theme: "grid",
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return (finalY ?? afterTitle) + 6;
}
