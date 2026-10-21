import { ByteWriter } from "./bytes";

export interface VideoSample {
  data: Uint8Array;
  key: boolean;
}
export interface Mp4Settings {
  width: number;
  height: number;
  fps: number;
  /** `avcC` record exactly as WebCodecs reports it in `decoderConfig.description`. */
  avcConfiguration: Uint8Array;
  limit: number;
}

function box(out: ByteWriter, type: string, content: () => void) {
  const start = out.length;
  out.u32be(0);
  out.ascii(type);
  content();
  out.patchU32be(start, out.length - start);
}
function fullBox(
  out: ByteWriter,
  type: string,
  version: number,
  flags: number,
  content: () => void,
) {
  box(out, type, () => {
    out.byte(version);
    out.byte(flags >>> 16);
    out.u16be(flags);
    content();
  });
}
const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

/** Single-track, constant-frame-rate H.264 MP4 with the movie box first ("fast start"): every
 * sample lasts 1000 units of an `fps × 1000` timescale, so the timing is exact by construction. */
export function muxMp4(settings: Mp4Settings, samples: readonly VideoSample[]): Uint8Array {
  const { width, height, fps } = settings;
  if (!samples.length) throw new Error("Vídeo sem quadros.");
  if (!samples[0]?.key) throw new Error("O primeiro quadro do vídeo precisa ser chave.");
  if (settings.avcConfiguration.length < 7 || settings.avcConfiguration[0] !== 1)
    throw new Error("Configuração H.264 (avcC) inválida.");
  const timescale = fps * 1000,
    duration = samples.length * 1000,
    payload = samples.reduce((sum, sample) => sum + sample.data.length, 0);
  const writeMoov = (out: ByteWriter, mdatData: number) =>
    box(out, "moov", () => {
      fullBox(out, "mvhd", 0, 0, () => {
        out.u32be(0);
        out.u32be(0);
        out.u32be(timescale);
        out.u32be(duration);
        out.u32be(0x10000);
        out.u16be(0x100);
        out.bytes(new Array(10).fill(0));
        for (const value of MATRIX) out.u32be(value);
        out.bytes(new Array(24).fill(0));
        out.u32be(2);
      });
      box(out, "trak", () => {
        fullBox(out, "tkhd", 0, 3, () => {
          out.u32be(0);
          out.u32be(0);
          out.u32be(1);
          out.u32be(0);
          out.u32be(duration);
          out.bytes(new Array(8).fill(0));
          out.u16be(0);
          out.u16be(0);
          out.u16be(0);
          out.u16be(0);
          for (const value of MATRIX) out.u32be(value);
          out.u32be(width * 0x10000);
          out.u32be(height * 0x10000);
        });
        box(out, "mdia", () => {
          fullBox(out, "mdhd", 0, 0, () => {
            out.u32be(0);
            out.u32be(0);
            out.u32be(timescale);
            out.u32be(duration);
            out.u16be(0x55c4); // "und"
            out.u16be(0);
          });
          fullBox(out, "hdlr", 0, 0, () => {
            out.u32be(0);
            out.ascii("vide");
            out.bytes(new Array(12).fill(0));
            out.ascii("EdiSVG");
            out.byte(0);
          });
          box(out, "minf", () => {
            fullBox(out, "vmhd", 0, 1, () => out.bytes(new Array(8).fill(0)));
            box(out, "dinf", () =>
              fullBox(out, "dref", 0, 0, () => {
                out.u32be(1);
                fullBox(out, "url ", 0, 1, () => {});
              }),
            );
            box(out, "stbl", () => {
              fullBox(out, "stsd", 0, 0, () => {
                out.u32be(1);
                box(out, "avc1", () => {
                  out.bytes(new Array(6).fill(0));
                  out.u16be(1);
                  out.bytes(new Array(16).fill(0));
                  out.u16be(width);
                  out.u16be(height);
                  out.u32be(0x480000);
                  out.u32be(0x480000);
                  out.u32be(0);
                  out.u16be(1);
                  const name = "EdiSVG H.264";
                  out.byte(name.length);
                  out.ascii(name);
                  out.bytes(new Array(31 - name.length).fill(0));
                  out.u16be(0x18);
                  out.u16be(0xffff);
                  box(out, "avcC", () => out.bytes(settings.avcConfiguration));
                });
              });
              fullBox(out, "stts", 0, 0, () => {
                out.u32be(1);
                out.u32be(samples.length);
                out.u32be(1000);
              });
              const keys = samples.flatMap((sample, index) => (sample.key ? [index + 1] : []));
              if (keys.length < samples.length)
                fullBox(out, "stss", 0, 0, () => {
                  out.u32be(keys.length);
                  for (const key of keys) out.u32be(key);
                });
              fullBox(out, "stsc", 0, 0, () => {
                out.u32be(1);
                out.u32be(1);
                out.u32be(samples.length);
                out.u32be(1);
              });
              fullBox(out, "stsz", 0, 0, () => {
                out.u32be(0);
                out.u32be(samples.length);
                for (const sample of samples) out.u32be(sample.data.length);
              });
              fullBox(out, "stco", 0, 0, () => {
                out.u32be(1);
                out.u32be(mdatData);
              });
            });
          });
        });
      });
    });
  const writeFtyp = (out: ByteWriter) =>
    box(out, "ftyp", () => {
      out.ascii("isom");
      out.u32be(0x200);
      for (const brand of ["isom", "iso2", "avc1", "mp41"]) out.ascii(brand);
    });
  // The chunk offset depends on the moov size, which does not depend on the offset value.
  const probe = new ByteWriter(settings.limit);
  writeFtyp(probe);
  writeMoov(probe, 0);
  const mdatData = probe.length + 8;
  if (mdatData + payload > 0xffffffff) throw new Error("Vídeo excede o limite de 4 GB do MP4.");
  const out = new ByteWriter(settings.limit, mdatData + payload);
  writeFtyp(out);
  writeMoov(out, mdatData);
  if (out.length + 8 !== mdatData) throw new Error("Estrutura MP4 inconsistente.");
  out.u32be(payload + 8);
  out.ascii("mdat");
  for (const sample of samples) out.bytes(sample.data);
  return out.finish();
}
