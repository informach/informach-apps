import { formatClockTime, longDayLabel, shortDayLabel, weekRangeLabel } from "./day-labels";
import type { PrintRow, WeekPrintout } from "./week-print-types";

type BuildArgs = {
  week: WeekPrintout;
  /** "Clara" ou "Todas as crianças". */
  scope: string;
  generatedAtIso: string;
};

const SP_TZ = "America/Sao_Paulo";

// RGB literais: PDF não tem DOM, então não há tokens CSS para ler. Paleta
// clara fixa, para o papel sair igual com o app em modo escuro. Folha impressa
// é tinta preta: o dia de hoje vai em negrito, não em cor.
const COLOR_TEXT: [number, number, number] = [17, 24, 39];
const COLOR_MUTED: [number, number, number] = [92, 99, 112];
const COLOR_BORDER: [number, number, number] = [210, 214, 220];
const COLOR_HEAD: [number, number, number] = [243, 244, 246];

const PDF_HEADER_HEIGHT = 40;
const LOGO_WIDTH = 64;
const LOGO_HEIGHT = 11.5;
const LOGO_SVG_URL = "/logotipo.svg";

let logoDataUrlPromise: Promise<string | null> | null = null;

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  const dateStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SP_TZ,
    day: "numeric",
    month: "long",
  }).format(date);
  const timeStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SP_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${dateStr}, às ${timeStr}`;
}

function filename(fromIso: string): string {
  return `agenda-da-turma-semana-${fromIso}.pdf`;
}

/**
 * Uma linha por atividade. A última coluna fica vazia para marcar à mão: é uma
 * folha para a porta da geladeira, e "Feito" impresso só aparece no que já foi
 * marcado no app.
 */
function rowCells(row: PrintRow, todayIso: string, withDay: boolean): string[] {
  const what = row.details
    ? `${row.title}\n${row.details
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`
    : row.title;
  const when = withDay
    ? row.dueAt
      ? shortDayLabel(row.dueAt, todayIso)
      : "Sem data"
    : row.time
      ? formatClockTime(row.time)
      : "";
  return [when, row.child, row.subject ?? row.type, what, row.done ? "Feito" : ""];
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
    if (typeof document === "undefined") return null;
    const response = await fetch(LOGO_SVG_URL);
    if (!response.ok) return null;
    const svg = await response.text();
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = await loadImage(blobUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 1440;
      canvas.height = image.naturalHeight || 257;
      const context = canvas.getContext("2d");
      if (!context) return null;
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

type AutoTableFn = typeof import("jspdf-autotable")["autoTable"];

/**
 * A semana em papel: um bloco por dia, no formato em que a família pensa
 * ("Quinta, 22 de outubro"), e no fim o que passou do prazo e o que está sem
 * data. Sem números de resumo e sem nada que ponha uma criança ao lado da
 * outra.
 */
export async function buildWeekPdf(args: BuildArgs): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable: AutoTableFn = autoTableModule.autoTable;
  const logoDataUrl = await getLogoDataUrl();
  const { week } = args;
  const firstDay = week.days[0]?.iso ?? week.todayIso;
  const lastDay = week.days[week.days.length - 1]?.iso ?? week.todayIso;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const generatedAtLabel = formatGeneratedAt(args.generatedAtIso);
  const title = `A semana de ${weekRangeLabel(firstDay, lastDay)}`;

  function drawHeader() {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, PDF_HEADER_HEIGHT - 4, "F");
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", marginX, 8, LOGO_WIDTH, LOGO_HEIGHT, "agenda-logo");
    } else {
      doc.setTextColor(...COLOR_TEXT);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Agenda da Turma", marginX, 15);
    }
    doc.setTextColor(...COLOR_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(title, marginX, 26);
    doc.setTextColor(...COLOR_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(args.scope, marginX, 32);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.line(marginX, 35, pageWidth - marginX, 35);
  }

  function drawFooter(pageNumber: number, pageCount: number) {
    doc.setTextColor(...COLOR_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Impresso em ${generatedAtLabel}`, marginX, pageHeight - 8);
    doc.text(`Página ${pageNumber} de ${pageCount}`, pageWidth - marginX, pageHeight - 8, {
      align: "right",
    });
  }

  function section(
    startY: number,
    heading: string,
    rows: PrintRow[],
    opts: { emphasis: boolean; withDay: boolean; empty: string | null },
  ): number {
    // "Passou do prazo" e "Sem data" vazios nem aparecem; um dia vazio diz que
    // não tem nada, para a folha não parecer cortada.
    if (rows.length === 0 && !opts.empty) return startY;
    // Um bloco que não cabe inteiro no fim da página começa na próxima: o nome
    // do dia sozinho no rodapé, com as atividades na página seguinte, engana.
    let y = startY;
    if (y > pageHeight - 40) {
      doc.addPage();
      y = PDF_HEADER_HEIGHT;
    }
    doc.setTextColor(...COLOR_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(opts.emphasis ? 12.5 : 11.5);
    doc.text(opts.emphasis ? `${heading} (hoje)` : heading, marginX, y + 4);
    if (rows.length === 0) {
      doc.setTextColor(...COLOR_MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(opts.empty ?? "", marginX, y + 10);
      return y + 16;
    }
    autoTable(doc, {
      startY: y + 7,
      margin: { left: marginX, right: marginX, top: PDF_HEADER_HEIGHT, bottom: 18 },
      head: [[opts.withDay ? "Dia" : "Hora", "Criança", "Matéria", "Atividade", "Feito"]],
      body: rows.map((row) => rowCells(row, week.todayIso, opts.withDay)),
      // valign "top" alinha as colunas curtas ao topo quando a atividade quebra
      // em várias linhas por causa dos detalhes.
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 2.3,
        textColor: COLOR_TEXT,
        valign: "top",
        lineColor: COLOR_BORDER,
        lineWidth: 0.2,
      },
      headStyles: { fillColor: COLOR_HEAD, textColor: COLOR_TEXT, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: opts.withDay ? 24 : 14 },
        1: { cellWidth: 26 },
        2: { cellWidth: 30 },
        3: { cellWidth: "auto" },
        4: { cellWidth: 14, halign: "center" },
      },
      theme: "grid",
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    return (finalY ?? y) + 7;
  }

  drawHeader();
  let cursorY = PDF_HEADER_HEIGHT + 2;
  for (const day of week.days) {
    cursorY = section(cursorY, longDayLabel(day.iso, week.todayIso), day.rows, {
      emphasis: day.iso === week.todayIso,
      withDay: false,
      empty: "Nada marcado.",
    });
  }
  cursorY = section(cursorY, "Passou do prazo", week.late, {
    emphasis: false,
    withDay: true,
    empty: null,
  });
  section(cursorY, "Sem data", week.undated, { emphasis: false, withDay: true, empty: null });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) drawHeader();
    drawFooter(i, totalPages);
  }
  doc.save(filename(firstDay));
}
