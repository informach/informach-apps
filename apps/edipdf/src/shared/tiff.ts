import { zlibSync } from "fflate";
import { type PDFArray, PDFDocument, PDFHexString, PDFName, PDFRawStream } from "pdf-lib";
import { decodeBoundedPdfStream } from "./bounded-pdf-stream.ts";
import { validateRasterImage } from "./raster-image.ts";
import { inspectTiff, type TiffPage } from "./tiff-format.ts";

const reversed = Uint8Array.from({ length: 256 }, (_, value) => {
  let result = 0;
  for (let bit = 0; bit < 8; bit++) result = (result << 1) | ((value >> bit) & 1);
  return result;
});
const reversedView = new DataView(reversed.buffer);
function unpackBits(input: Uint8Array, length: number): Uint8Array {
  const result = new Uint8Array(length);
  const source = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let at = 0,
    out = 0;
  while (at < input.length) {
    const code = source.getUint8(at++);
    if (code === 128) continue;
    const count = code < 128 ? code + 1 : 257 - code;
    if (out + count > length || at + (code < 128 ? count : 1) > input.length)
      throw new Error("Strip TIFF PackBits incompleto ou acima do tamanho declarado.");
    if (code < 128) {
      result.set(input.subarray(at, at + count), out);
      at += count;
    } else result.fill(source.getUint8(at++), out, out + count);
    out += count;
  }
  if (out !== length) throw new Error("Strip TIFF PackBits não preenche todas as linhas.");
  return result;
}
function decodeStrip(
  pdf: PDFDocument,
  page: TiffPage,
  input: Uint8Array,
  rows: number,
): Uint8Array {
  const stride = Math.ceil((page.width * page.samples * page.bits) / 8),
    expected = stride * rows;
  let data: Uint8Array;
  if (page.compression === 1) data = new Uint8Array(input);
  else if (page.compression === 32773) data = unpackBits(input, expected);
  else
    data = decodeBoundedPdfStream(
      PDFRawStream.of(
        pdf.context.obj({
          Filter: page.compression === 5 ? "LZWDecode" : "FlateDecode",
          DecodeParms: { EarlyChange: 1 },
        }),
        input,
      ),
      expected,
    );
  if (data.length !== expected)
    throw new Error("A expansão do strip TIFF não corresponde às dimensões declaradas.");
  if (page.fillOrder === 2) data = data.map((value) => reversedView.getUint8(value));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
    sampleBytes = page.bits / 8;
  if (page.predictor === 2) {
    for (let row = 0; row < rows; row++) {
      for (let sample = page.samples; sample < page.width * page.samples; sample++) {
        const at = row * stride + sample * sampleBytes,
          previous = at - page.samples * sampleBytes;
        if (page.bits === 8) data[at] = (view.getUint8(at) + view.getUint8(previous)) & 255;
        else
          view.setUint16(
            at,
            (view.getUint16(at, page.littleEndian) + view.getUint16(previous, page.littleEndian)) &
              65535,
            page.littleEndian,
          );
      }
    }
  }
  if (page.bits === 16 && page.littleEndian)
    for (let at = 0; at < data.length; at += 2) {
      const low = view.getUint8(at);
      data[at] = view.getUint8(at + 1);
      data[at + 1] = low;
    }
  return data;
}
function jpegStrip(page: TiffPage, input: Uint8Array, rows: number): Uint8Array {
  let bytes = input;
  if (page.jpegTables) {
    const table = page.jpegTables;
    if (
      table.length < 4 ||
      table[0] !== 255 ||
      table[1] !== 216 ||
      table.at(-2) !== 255 ||
      table.at(-1) !== 217 ||
      input[0] !== 255 ||
      input[1] !== 216
    )
      throw new Error("Tabelas JPEG TIFF incompletas.");
    bytes = new Uint8Array(table.length + input.length - 4);
    bytes.set(table.subarray(0, -2));
    bytes.set(input.subarray(2), table.length - 2);
  }
  const size = validateRasterImage(bytes, "jpg");
  if (
    size.width !== page.width ||
    size.height !== rows ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw new Error("O quadro JPEG TIFF não corresponde às dimensões do strip.");
  return bytes;
}
/** Preserve strip data, native fax/JPEG codecs, bit depth, alpha, ICC and physical orientation. */
export async function tiffToPdf(
  input: Uint8Array,
  progress?: (page: number, total: number) => void,
): Promise<{ bytes: Uint8Array; pages: number; warnings: string[] }> {
  const inspected = inspectTiff(input),
    pdf = await PDFDocument.create();
  for (const [index, image] of inspected.pages.entries()) {
    const colors = image.photometric === 2 || image.photometric === 6 ? 3 : 1;
    let colorSpace: PDFName | PDFArray = pdf.context.obj(colors === 3 ? "DeviceRGB" : "DeviceGray");
    if (image.profile)
      colorSpace = pdf.context.obj([
        "ICCBased",
        pdf.context.register(
          pdf.context.flateStream(image.profile, { N: image.photometric === 3 ? 3 : colors }),
        ),
      ]);
    if (image.colorMap) {
      const entries = 2 ** image.bits,
        palette = new Uint8Array(entries * 3);
      for (const [offset, value] of image.colorMap.entries())
        palette[(offset % entries) * 3 + Math.floor(offset / entries)] = Math.round(
          (value * 255) / 65535,
        );
      colorSpace = pdf.context.obj([
        "Indexed",
        image.profile ? colorSpace : "DeviceRGB",
        entries - 1,
        PDFHexString.of(
          Array.from(palette, (value) => value.toString(16).padStart(2, "0")).join(""),
        ),
      ]);
    }
    const xObjects = pdf.context.obj({}),
      operations: string[] = [];
    for (const [strip, encoded] of image.strips.entries()) {
      const start = strip * image.rowsPerStrip,
        rows = Math.min(image.rowsPerStrip, image.height - start);
      const dictionary = pdf.context.obj({
        Type: "XObject",
        Subtype: "Image",
        Width: image.width,
        Height: rows,
        BitsPerComponent: image.bits,
        ColorSpace: colorSpace,
      });
      let stream: PDFRawStream;
      if ([2, 3, 4].includes(image.compression)) {
        dictionary.set(PDFName.of("Filter"), PDFName.of("CCITTFaxDecode"));
        dictionary.set(
          PDFName.of("DecodeParms"),
          pdf.context.obj({
            K:
              image.compression === 4 ? -1 : image.compression === 3 && image.t4Options & 1 ? 1 : 0,
            Columns: image.width,
            Rows: rows,
            EndOfBlock: false,
            EndOfLine: image.compression === 3,
            EncodedByteAlign: image.compression === 2 || !!(image.t4Options & 4),
            BlackIs1: true,
          }),
        );
        // TIFF and PDF both define white/black runs; Decode handles the source polarity.
        if (image.photometric === 0) dictionary.set(PDFName.of("Decode"), pdf.context.obj([1, 0]));
        stream = PDFRawStream.of(
          dictionary,
          image.fillOrder === 2 ? encoded.map((value) => reversedView.getUint8(value)) : encoded,
        );
      } else if (image.compression === 7) {
        dictionary.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
        if (colors === 3)
          dictionary.set(
            PDFName.of("DecodeParms"),
            pdf.context.obj({ ColorTransform: image.photometric === 6 ? 1 : 0 }),
          );
        stream = PDFRawStream.of(dictionary, jpegStrip(image, encoded, rows));
      } else {
        let data = decodeStrip(pdf, image, encoded, rows);
        if (image.alpha) {
          const sampleBytes = image.bits / 8,
            count = image.width * rows,
            color = new Uint8Array(count * colors * sampleBytes),
            alpha = new Uint8Array(count * sampleBytes),
            maximum = image.bits === 8 ? 255 : 65535;
          const source = new DataView(data.buffer, data.byteOffset, data.byteLength),
            target = new DataView(color.buffer);
          for (let pixel = 0; pixel < count; pixel++) {
            const at = pixel * image.samples * sampleBytes,
              opacityAt = at + colors * sampleBytes;
            alpha.set(data.subarray(opacityAt, opacityAt + sampleBytes), pixel * sampleBytes);
            const opacity =
              sampleBytes === 1 ? source.getUint8(opacityAt) : source.getUint16(opacityAt);
            for (let channel = 0; channel < colors; channel++) {
              const value =
                  sampleBytes === 1
                    ? source.getUint8(at + channel)
                    : source.getUint16(at + channel * sampleBytes),
                unassociated =
                  image.alpha === "associated"
                    ? opacity
                      ? Math.min(maximum, Math.round((value * maximum) / opacity))
                      : 0
                    : value;
              if (sampleBytes === 1) color[pixel * colors + channel] = unassociated;
              else target.setUint16((pixel * colors + channel) * 2, unassociated);
            }
          }
          dictionary.set(
            PDFName.of("SMask"),
            pdf.context.register(
              pdf.context.flateStream(alpha, {
                Type: "XObject",
                Subtype: "Image",
                Width: image.width,
                Height: rows,
                BitsPerComponent: image.bits,
                ColorSpace: "DeviceGray",
              }),
            ),
          );
          data = color;
        }
        if (image.photometric === 0) dictionary.set(PDFName.of("Decode"), pdf.context.obj([1, 0]));
        dictionary.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
        stream = PDFRawStream.of(dictionary, zlibSync(data));
      }
      const name = `Strip${strip}`;
      xObjects.set(PDFName.of(name), pdf.context.register(stream));
      operations.push(
        `q 1 0 0 ${rows / image.height} 0 ${1 - (start + rows) / image.height} cm /${name} Do Q`,
      );
    }
    const form = pdf.context.register(
      pdf.context.flateStream(operations.join("\n"), {
        Type: "XObject",
        Subtype: "Form",
        BBox: [0, 0, 1, 1],
        Resources: { XObject: xObjects },
      }),
    );
    const w = (image.width * 72) / image.dpiX,
      h = (image.height * 72) / image.dpiY;
    const matrices = [
      [w, 0, 0, h, 0, 0],
      [-w, 0, 0, h, w, 0],
      [-w, 0, 0, -h, w, h],
      [w, 0, 0, -h, 0, h],
      [0, -w, -h, 0, h, w],
      [0, -w, h, 0, 0, w],
      [0, w, h, 0, 0, 0],
      [0, w, -h, 0, h, 0],
    ];
    const page = pdf.addPage(image.orientation >= 5 ? [h, w] : [w, h]);
    const matrix = matrices[image.orientation - 1];
    if (!matrix) throw new Error("Matriz de orientação TIFF inválida.");
    page.node.set(PDFName.of("Resources"), pdf.context.obj({ XObject: { Tiff: form } }));
    page.node.set(
      PDFName.of("Contents"),
      pdf.context.register(pdf.context.flateStream(`q ${matrix.join(" ")} cm /Tiff Do Q`)),
    );
    progress?.(index + 1, inspected.pages.length);
  }
  pdf.setProducer("EdiPDF — importação TIFF local");
  const bytes = await pdf.save();
  if (bytes.length > 64 * 1024 * 1024)
    throw new Error("O PDF TIFF gerado excede 64 MB; a origem foi preservada.");
  return { bytes, pages: inspected.pages.length, warnings: inspected.warnings };
}
