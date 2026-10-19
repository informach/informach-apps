import { Unzlib } from "fflate";
import { decodePDFRawStream, PDFArray, PDFDict, PDFName, PDFRawStream } from "pdf-lib";

/** Limit every stage of a filter chain, including expansion before later filters shrink it. */
export function decodeBoundedPdfStream(stream: PDFRawStream, limit: number): Uint8Array {
  if (!Number.isInteger(limit) || limit < 1 || limit > 128 * 1024 * 1024)
    throw new Error("Limite de stream PDF inválido.");
  const raw = stream.dict.lookup(PDFName.of("Filter"));
  const filters =
    raw instanceof PDFArray
      ? raw.asArray().map((item) => stream.dict.context.lookup(item))
      : raw
        ? [raw]
        : [];
  if (filters.length > 8) throw new Error("Filtros PDF não suportados.");
  if (!filters.length) {
    if (stream.contents.length > limit) throw new Error("Stream PDF excede o limite de memória.");
    return stream.contents;
  }
  let data = stream.contents;
  const parameters = stream.dict.lookup(PDFName.of("DecodeParms"));
  for (let index = 0; index < filters.length; index++) {
    const filter = filters[index];
    if (!(filter instanceof PDFName)) throw new Error("Filtro PDF inválido.");
    if (filter === PDFName.of("FlateDecode")) {
      if (!data.length) throw new Error("Stream Flate vazio.");
      const chunks: Uint8Array[] = [];
      let length = 0;
      const decoder = new Unzlib((chunk) => {
        length += chunk.length;
        if (length > limit) throw new Error("Stream PDF descompactado excede o limite de memória.");
        chunks.push(chunk.slice());
      });
      for (let offset = 0; offset < data.length; offset += 1024)
        decoder.push(data.subarray(offset, offset + 1024), offset + 1024 >= data.length);
      const decoded = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        decoded.set(chunk, offset);
        offset += chunk.length;
      }
      data = decoded;
    } else {
      if (
        !["LZWDecode", "ASCII85Decode", "ASCIIHexDecode", "RunLengthDecode"].some(
          (name) => filter === PDFName.of(name),
        )
      )
        throw new Error("Filtro PDF não suportado para compactação segura.");
      const dictionary = stream.dict.clone();
      dictionary.set(PDFName.of("Filter"), filter);
      dictionary.delete(PDFName.of("DecodeParms"));
      const parameter = parameters instanceof PDFArray ? parameters.lookup(index) : parameters;
      if (parameter instanceof PDFDict) dictionary.set(PDFName.of("DecodeParms"), parameter);
      // These codecs emit bounded blocks. Flate uses the incremental decoder above.
      const decoded = decodePDFRawStream(PDFRawStream.of(dictionary, data)).getBytes(limit + 1);
      if (decoded.length > limit)
        throw new Error("Stream PDF descompactado excede o limite de memória.");
      data = new Uint8Array(decoded);
    }
  }
  return data;
}
