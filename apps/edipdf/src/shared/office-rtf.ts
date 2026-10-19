import {
  type OfficeDocument,
  type OfficeParagraph,
  type OfficeTable,
  officeDocumentSchema,
} from "./office-format.ts";
import { validateRasterImage } from "./raster-image.ts";
import { rtfTokens } from "./rtf-tokens.ts";

interface Picture {
  format?: "png" | "jpg";
  parts: (string | Uint8Array)[];
  length: number;
  width?: number;
  height?: number;
  scaleX: number;
  scaleY: number;
}
interface ReaderState {
  destination: "body" | "list" | "skip" | "font" | "color" | "picture";
  bold: boolean;
  italic: boolean;
  size: number;
  color: number;
  font: number;
  hidden: boolean;
  align: OfficeParagraph["align"];
  bullet: boolean;
  heading?: number;
  unicodeFallback: number;
  skip: number;
  ignorable: boolean;
  picture?: Picture;
}
const encodings: Record<number, string> = {
  10000: "macintosh",
  65001: "utf-8",
  1250: "windows-1250",
  1251: "windows-1251",
  1252: "windows-1252",
  1253: "windows-1253",
  1254: "windows-1254",
  1255: "windows-1255",
  1256: "windows-1256",
  1257: "windows-1257",
  1258: "windows-1258",
  874: "windows-874",
  932: "shift_jis",
  936: "gbk",
  949: "euc-kr",
  950: "big5",
};
const charsets: Record<number, number | "symbol" | "default"> = {
  0: "default",
  1: "default",
  2: "symbol",
  77: 10000,
  128: 932,
  129: 949,
  134: 936,
  136: 950,
  161: 1253,
  162: 1254,
  163: 1258,
  177: 1255,
  178: 1256,
  186: 1257,
  204: 1251,
  222: 874,
  238: 1250,
};
const numeric = (value: number | undefined, min: number, max: number, name: string) => {
  if (value === undefined || !Number.isInteger(value) || value < min || value > max)
    throw new Error(`Parâmetro RTF ${name} fora do perfil local.`);
  return value;
};
const initial = (): ReaderState => ({
  destination: "body",
  bold: false,
  italic: false,
  size: 11,
  color: 0,
  font: 0,
  hidden: false,
  align: "left",
  bullet: false,
  unicodeFallback: 1,
  skip: 0,
  ignorable: false,
});
const skipped = new Set([
  "stylesheet",
  "info",
  "generator",
  "filetbl",
  "listtable",
  "listoverridetable",
  "revtbl",
  "rsidtbl",
  "xmlnstbl",
  "themedata",
  "colorschememapping",
  "latentstyles",
  "pn",
  "nonshppict",
  "fldinst",
  "header",
  "headerl",
  "headerr",
  "headerf",
  "footer",
  "footerl",
  "footerr",
  "footerf",
  "footnote",
  "annotation",
  "atnauthor",
  "atnid",
  "datafield",
]);

/** Bounded RTF reflow reader. No OLE, fields, linked resources or embedded programs execute. */
export function importRtf(bytes: Uint8Array, title: string): OfficeDocument {
  const warnings = new Set<string>([
    "RTF local por fluxo: Noto Sans substitui as fontes de origem; paginação, posições e estilos avançados podem mudar. Revise todas as páginas.",
  ]);
  const document: OfficeDocument = { title, pages: [], warnings: [] },
    stack: ReaderState[] = [],
    fonts = new Map<number, string>(),
    colors: (string | undefined)[] = [];
  let state = initial(),
    header = false,
    ended = false,
    groups = 0,
    defaultFont = 0,
    encoding = "windows-1252",
    textLength = 0,
    runCount = 0,
    blockCount = 0,
    cellCount = 0;
  const defaultPaper = {
    width: 612,
    height: 792,
    margins: { left: 72, right: 72, top: 72, bottom: 72 },
  };
  let currentPage: OfficeDocument["pages"][number] = {
    width: 612,
    height: 792,
    margins: { left: 72, right: 72, top: 72, bottom: 72 },
    blocks: [],
  };
  document.pages.push(currentPage);
  let paragraph: OfficeParagraph = { kind: "paragraph", runs: [], align: "left" },
    pending: number[] = [],
    table:
      | { block: OfficeTable; row: string[]; cell: string; columns: number; inRow: boolean }
      | undefined;
  let color = { red: 0, green: 0, blue: 0, explicit: false },
    pictureParagraph = false,
    listPrefix = false;
  const newParagraph = (): OfficeParagraph => ({
    kind: "paragraph",
    runs: [],
    align: state.align,
    ...(state.bullet ? { bullet: true } : {}),
    ...(state.heading ? { heading: state.heading } : {}),
  });
  const finishParagraph = (force: boolean) => {
    if (!paragraph.runs.length && pictureParagraph) {
      pictureParagraph = false;
      paragraph = newParagraph();
      return;
    }
    if (!force && !paragraph.runs.length) return;
    pictureParagraph = false;
    if (paragraph.bullet && !listPrefix)
      warnings.add(
        "Listas RTF sem rótulo armazenado usam marcadores simples; níveis e numeração podem mudar.",
      );
    if (table?.inRow) table.cell += `${paragraph.runs.map((run) => run.text).join("")}\n`;
    else {
      if (++blockCount > 20000) throw new Error("O RTF excede o limite de blocos locais.");
      currentPage.blocks.push(paragraph);
      table = undefined;
    }
    paragraph = newParagraph();
    listPrefix = false;
  };
  const emit = (text: string) => {
    if ((state.destination !== "body" && state.destination !== "list") || state.hidden || !text)
      return;
    textLength += text.length;
    if (textLength > 5_000_000) throw new Error("O texto RTF excede cinco milhões de caracteres.");
    if (state.color && !colors[state.color]) throw new Error("Cor RTF sem definição válida.");
    if (state.destination === "body") paragraph.align = state.align;
    if (state.bullet && !listPrefix) paragraph.bullet = true;
    if (state.heading) paragraph.heading = state.heading;
    const style = {
      bold: state.bold,
      italic: state.italic,
      size: state.size,
      ...(colors[state.color] ? { color: colors[state.color] } : {}),
    };
    const previous = paragraph.runs.at(-1);
    if (
      previous &&
      previous.bold === style.bold &&
      previous.italic === style.italic &&
      previous.size === style.size &&
      previous.color === style.color
    ) {
      if (previous.text.length + text.length > 1_000_000)
        throw new Error("Trecho RTF acima de um milhão de caracteres.");
      previous.text += text;
    } else {
      if (++runCount > 200000 || paragraph.runs.length >= 10000)
        throw new Error("O RTF excede o limite de trechos formatados.");
      paragraph.runs.push({ ...style, text });
    }
  };
  const flush = () => {
    if (!pending.length) return;
    const selected = fonts.get(state.font) ?? encoding;
    if (selected === "symbol" && state.destination === "list") {
      if (pending.some((value) => value !== 0xb7 && value !== 0xa7 && value !== 32 && value !== 9))
        throw new Error("Símbolo de lista RTF sem mapeamento Unicode suportado.");
      const text = pending
        .map((value) => (value === 0xb7 || value === 0xa7 ? "•" : String.fromCharCode(value)))
        .join("");
      pending = [];
      emit(text);
      return;
    }
    if (selected === "symbol")
      throw new Error(
        "Texto RTF em fonte Symbol/Wingdings precisa de mapeamento Unicode antes da conversão.",
      );
    if (selected.startsWith("unsupported-"))
      throw new Error("Charset da fonte RTF usada no texto não suportado.");
    let decoded: string;
    try {
      decoded = new TextDecoder(selected, { fatal: true }).decode(Uint8Array.from(pending));
    } catch {
      throw new Error("O RTF contém texto inválido na codificação declarada.");
    }
    pending = [];
    emit(decoded);
  };
  const queueByte = (value: number) => {
    if (state.skip) {
      state.skip--;
      return;
    }
    if ((state.destination !== "body" && state.destination !== "list") || state.hidden) return;
    if (value < 32 && value !== 9)
      throw new Error("O RTF contém um caractere de controle visível inválido.");
    if (pending.length + textLength >= 5_000_000)
      throw new Error("O RTF excede o limite de texto local.");
    pending.push(value);
  };
  const pictureData = (value: string | Uint8Array) => {
    const picture = state.picture;
    if (!picture) throw new Error("Imagem RTF sem grupo de dados.");
    picture.length += typeof value === "string" ? value.length / 2 : value.length;
    if (!Number.isInteger(picture.length) || picture.length > 32 * 1024 * 1024)
      throw new Error("Dados de imagem RTF incompletos ou acima de 32 MB.");
    picture.parts.push(value);
  };
  const finishPicture = (picture: Picture) => {
    if (!picture.format || !picture.length)
      throw new Error("O perfil RTF aceita somente imagens PNG/JPEG completas.");
    if (table?.inRow)
      throw new Error("Imagem dentro de célula RTF exige outro perfil de conversão.");
    const data = new Uint8Array(picture.length);
    let at = 0;
    for (const part of picture.parts) {
      if (typeof part !== "string") {
        data.set(part, at);
        at += part.length;
      } else
        for (let index = 0; index < part.length; index += 2)
          data[at++] = Number.parseInt(part.slice(index, index + 2), 16);
    }
    const size = validateRasterImage(data, picture.format);
    finishParagraph(false);
    table = undefined;
    if (++blockCount > 20000) throw new Error("O RTF excede o limite de blocos locais.");
    currentPage.blocks.push({
      kind: "image",
      bytes: data,
      format: picture.format,
      width: ((picture.width ?? size.width * 0.75) * picture.scaleX) / 100,
      height: ((picture.height ?? size.height * 0.75) * picture.scaleY) / 100,
      alt: "",
    });
    pictureParagraph = true;
  };
  for (const token of rtfTokens(bytes)) {
    if (ended) {
      if (token.kind === "text" && token.bytes.every((byte) => [9, 10, 13, 32].includes(byte)))
        continue;
      throw new Error("Dados após o grupo raiz RTF.");
    }
    if (token.kind === "open") {
      flush();
      state.skip = 0;
      if (stack.length >= 100 || ++groups > 200000)
        throw new Error("Grupos RTF profundos ou numerosos demais.");
      stack.push(state);
      state = { ...state, ignorable: false };
      continue;
    }
    if (token.kind === "close") {
      flush();
      const parent = stack.pop();
      if (!parent) throw new Error("Chaves RTF sem grupo correspondente.");
      if (state.destination === "picture" && state.picture && state.picture !== parent.picture)
        finishPicture(state.picture);
      state = parent;
      state.skip = 0;
      if (!stack.length) ended = true;
      continue;
    }
    if (!stack.length) throw new Error("Conteúdo RTF fora do grupo raiz.");
    if (token.kind === "text") {
      if (state.destination === "picture") {
        const hex = new TextDecoder("ascii", { fatal: true })
          .decode(token.bytes)
          .replace(/[\t\r\n ]/g, "");
        if (!/^(?:[a-f\d]{2})*$/i.test(hex))
          throw new Error("Dados hexadecimais de imagem RTF inválidos.");
        if (hex) pictureData(hex);
      } else if (state.destination === "color") {
        for (const value of token.bytes)
          if (value === 59) {
            colors.push(
              color.explicit
                ? `#${[color.red, color.green, color.blue].map((part) => part.toString(16).padStart(2, "0")).join("")}`
                : undefined,
            );
            if (colors.length > 4096) throw new Error("Tabela de cores RTF grande demais.");
            color = { red: 0, green: 0, blue: 0, explicit: false };
          } else if (![9, 10, 13, 32].includes(value))
            throw new Error("Texto inválido na tabela de cores RTF.");
      } else for (const value of token.bytes) if (value !== 10 && value !== 13) queueByte(value);
      continue;
    }
    if (token.kind === "byte") {
      queueByte(token.value);
      continue;
    }
    flush();
    if (state.skip) {
      state.skip--;
      continue;
    }
    if (token.kind === "binary") {
      if (state.destination === "picture") pictureData(token.bytes);
      else if (state.destination === "body")
        throw new Error("Dados binários RTF fora de imagem suportada.");
      continue;
    }
    if (token.kind === "symbol") {
      if (token.value === "*") state.ignorable = true;
      else if (["\\", "{", "}"].includes(token.value)) emit(token.value);
      else if (token.value === "~") emit("\u00a0");
      else if (token.value === "_") emit("\u2011");
      else if (token.value === "-") emit("\u00ad");
      continue;
    }
    const { name, value } = token;
    if (state.ignorable) {
      state.ignorable = false;
      if (!["pict", "shppict", "pntext", "listtext"].includes(name)) state.destination = "skip";
    }
    if (state.destination === "skip") continue;
    if (name === "rtf") {
      if (value !== 1 || header || stack.length !== 1)
        throw new Error("Versão ou raiz RTF incompatível.");
      header = true;
      continue;
    }
    if (name === "fonttbl") {
      state.destination = "font";
      continue;
    }
    if (name === "colortbl") {
      if (colors.length) throw new Error("Tabela de cores RTF duplicada.");
      state.destination = "color";
      continue;
    }
    if (state.destination === "font") {
      if (name === "f") {
        state.font = numeric(value, 0, 2047, name);
        if (fonts.size >= 2048) throw new Error("Tabela de fontes RTF grande demais.");
        if (!fonts.has(state.font)) fonts.set(state.font, encoding);
      }
      if (name === "fcharset") {
        const charset = numeric(value, 0, 255, name),
          code = charsets[charset];
        fonts.set(
          state.font,
          code === undefined
            ? `unsupported-${charset}`
            : code === "symbol"
              ? "symbol"
              : code === "default"
                ? encoding
                : (encodings[code] ?? encoding),
        );
      }
      if (name === "cpg") {
        const selected = value === undefined ? undefined : encodings[value];
        if (!selected) throw new Error("Codificação de fonte RTF não suportada.");
        fonts.set(state.font, selected);
      }
      continue;
    }
    if (state.destination === "color") {
      if (name === "red" || name === "green" || name === "blue") {
        color[name] = numeric(value, 0, 255, name);
        color.explicit = true;
      }
      continue;
    }
    if (state.destination === "picture") {
      const picture = state.picture;
      if (!picture) throw new Error("Grupo de imagem RTF inválido.");
      if (name === "pngblip" || name === "jpegblip") {
        const format = name === "pngblip" ? "png" : "jpg";
        if (picture.format && picture.format !== format)
          throw new Error("Imagem RTF com formatos conflitantes.");
        picture.format = format;
      }
      if (name === "picwgoal") picture.width = numeric(value, 1, 320000, name) / 20;
      if (name === "pichgoal") picture.height = numeric(value, 1, 320000, name) / 20;
      if (name === "picscalex") picture.scaleX = numeric(value, 1, 1000, name);
      if (name === "picscaley") picture.scaleY = numeric(value, 1, 1000, name);
      if (["piccropl", "piccropr", "piccropt", "piccropb"].includes(name) && value !== 0)
        throw new Error(
          "Imagem RTF recortada exige um perfil próprio; áreas ocultas não foram expostas na conversão.",
        );
      continue;
    }
    if (skipped.has(name)) {
      if (/^(?:header|footer|footnote|annotation)/.test(name))
        warnings.add(
          "Cabeçalhos, rodapés, notas e comentários não entram neste perfil de fluxo RTF.",
        );
      if (name === "fldinst")
        warnings.add(
          "Campos RTF usam somente o resultado armazenado; instruções, links e recursos externos não são executados.",
        );
      state.destination = "skip";
      continue;
    }
    if (name === "pntext" || name === "listtext") {
      state.destination = "list";
      listPrefix = true;
      delete paragraph.bullet;
      warnings.add(
        "Rótulos de listas RTF são preservados como texto editável; a numeração não é recalculada automaticamente.",
      );
      continue;
    }
    if (
      [
        "object",
        "objdata",
        "shp",
        "upr",
        "fromhtml",
        "nestrow",
        "nestcell",
        "nesttableprops",
      ].includes(name)
    )
      throw new Error(
        `O recurso RTF ${name} exige outro perfil; nenhuma conversão parcial foi aceita.`,
      );
    if (name === "shppict" || name === "fldrslt") continue;
    if (name === "pict") {
      finishParagraph(false);
      state.destination = "picture";
      state.picture = { parts: [], length: 0, scaleX: 100, scaleY: 100 };
      continue;
    }
    if (name === "ansi") encoding = "windows-1252";
    else if (name === "mac") encoding = "macintosh";
    else if (name === "pc" || name === "pca")
      throw new Error("Codificação DOS RTF exige outro perfil local.");
    else if (name === "ansicpg") {
      const selected = value === undefined ? undefined : encodings[value];
      if (!selected) throw new Error("Codepage RTF não suportado.");
      encoding = selected;
    } else if (name === "deff") {
      defaultFont = numeric(value, 0, 2047, name);
      state.font = defaultFont;
    } else if (name === "f") state.font = numeric(value, 0, 2047, name);
    else if (name === "b") state.bold = value !== 0;
    else if (name === "i") state.italic = value !== 0;
    else if (name === "fs") state.size = numeric(value, 8, 400, name) / 2;
    else if (name === "cf") state.color = numeric(value, 0, 4095, name);
    else if (name === "plain") {
      state.bold = false;
      state.italic = false;
      state.size = 11;
      state.font = defaultFont;
      state.color = 0;
      state.hidden = false;
    } else if (name === "v" || name === "deleted") {
      state.hidden = value !== 0;
      warnings.add(
        "Texto oculto e trechos marcados como excluídos não foram incorporados ao PDF de fluxo.",
      );
    } else if (name === "uc") state.unicodeFallback = numeric(value, 0, 32, name);
    else if (name === "u") {
      emit(String.fromCharCode(numeric(value, -32768, 65535, name) & 65535));
      state.skip = state.unicodeFallback;
    } else if (name === "pard") {
      state.align = "left";
      state.bullet = false;
      state.heading = undefined;
      paragraph.align = "left";
    } else if (name === "ql" || name === "qc" || name === "qr" || name === "qj") {
      state.align =
        name === "qc" ? "center" : name === "qr" ? "right" : name === "qj" ? "justify" : "left";
      paragraph.align = state.align;
    } else if (name === "outlinelevel") {
      const level = numeric(value, 0, 9, name);
      state.heading = level < 6 ? level + 1 : undefined;
    } else if (name === "ls") {
      state.bullet = numeric(value, 0, 1000000, name) > 0;
      if (!state.bullet) delete paragraph.bullet;
    } else if (name === "par") finishParagraph(true);
    else if (name === "line") emit("\n");
    else if (name === "tab") emit("\t");
    else if (name === "emdash") emit("—");
    else if (name === "endash") emit("–");
    else if (name === "bullet") emit("•");
    else if (name === "lquote" || name === "rquote") emit(name === "lquote" ? "‘" : "’");
    else if (name === "ldblquote" || name === "rdblquote") emit(name === "ldblquote" ? "“" : "”");
    else if (["chpgn", "chdate", "chtime"].includes(name))
      throw new Error(
        "Campo RTF sem resultado armazenado; não foi inventado um valor na conversão.",
      );
    else if (name === "sectd") {
      currentPage.width = defaultPaper.width;
      currentPage.height = defaultPaper.height;
      currentPage.margins = { ...defaultPaper.margins };
    } else if (["paperw", "paperh", "pgwsxn", "pghsxn"].includes(name)) {
      const dimension = name === "paperw" || name === "pgwsxn" ? "width" : "height";
      currentPage[dimension] = numeric(value, 1440, 320000, name) / 20;
      if (name === "paperw" || name === "paperh") defaultPaper[dimension] = currentPage[dimension];
    } else if (
      ["margl", "margr", "margt", "margb", "marglsxn", "margrsxn", "margtsxn", "margbsxn"].includes(
        name,
      )
    ) {
      currentPage.margins ??= { left: 72, right: 72, top: 72, bottom: 72 };
      const margin = name.startsWith("margl")
        ? "left"
        : name.startsWith("margr")
          ? "right"
          : name.startsWith("margt")
            ? "top"
            : "bottom";
      currentPage.margins[margin] = numeric(value, 0, 40000, name) / 20;
      if (!name.endsWith("sxn")) defaultPaper.margins[margin] = currentPage.margins[margin];
    } else if (name === "page" || name === "sect") {
      if (table?.inRow) throw new Error("Quebra RTF dentro de linha de tabela não suportada.");
      finishParagraph(false);
      if (document.pages.length >= 1000) throw new Error("O RTF excede mil páginas/seções.");
      currentPage = {
        ...currentPage,
        margins: currentPage.margins ? { ...currentPage.margins } : undefined,
        blocks: [],
      };
      document.pages.push(currentPage);
      table = undefined;
    } else if (name === "itap" && (value ?? 0) > 1)
      throw new Error("Tabelas RTF aninhadas exigem outro perfil.");
    else if (name === "trowd") {
      if (table?.inRow) throw new Error("Linha RTF anterior incompleta.");
      finishParagraph(false);
      if (!table) {
        if (++blockCount > 20000) throw new Error("O RTF excede o limite de blocos locais.");
        const block: OfficeTable = { kind: "table", rows: [], header: false };
        currentPage.blocks.push(block);
        table = { block, row: [], cell: "", columns: 0, inRow: false };
      }
      table.inRow = true;
      table.columns = 0;
    } else if (name === "trhdr") {
      if (!table?.inRow) throw new Error("Cabeçalho de tabela RTF fora de linha.");
      if (!table.block.rows.length) table.block.header = value !== 0;
      else
        warnings.add(
          "Somente a primeira linha é tratada como cabeçalho de tabela neste perfil RTF.",
        );
    } else if (name === "cellx") {
      if (!table?.inRow || ++table.columns > 200)
        throw new Error("Colunas RTF fora de uma tabela válida.");
      numeric(value, -1000000, 1000000, name);
    } else if (name === "cell") {
      if (++cellCount > 200000) throw new Error("O RTF excede duzentas mil células.");
      if (!table?.inRow) throw new Error("Célula RTF fora de linha.");
      finishParagraph(true);
      table.row.push(table.cell.replace(/\n$/, ""));
      table.cell = "";
      if (table.row.length > 200) throw new Error("Tabela RTF acima de duzentas colunas.");
    } else if (name === "row") {
      if (
        !table?.inRow ||
        !table.row.length ||
        paragraph.runs.length ||
        table.cell ||
        (table.columns && table.columns !== table.row.length)
      )
        throw new Error("Linha de tabela RTF incompleta ou com células inconsistentes.");
      table.block.rows.push(table.row);
      table.row = [];
      table.inRow = false;
      if (table.block.rows.length > 10000) throw new Error("Tabela RTF acima de dez mil linhas.");
    }
  }
  flush();
  if (!header || !ended || stack.length || table?.inRow)
    throw new Error("O RTF está incompleto; nenhuma página foi descartada.");
  finishParagraph(false);
  document.warnings = [...warnings];
  return officeDocumentSchema.parse(document);
}
