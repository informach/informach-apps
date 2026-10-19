import { strToU8 } from "fflate";
import { XML_HEADER, xml } from "../office-xml.ts";
import { openText } from "../open-document/export.ts";
import { openDocumentFonts } from "../open-document/fonts.ts";
import { namespaces, writeOpenPackage } from "../open-document/package.ts";
import type { UnicodeFonts } from "../unicode-fonts.ts";
import type { PresentationElement } from "./format.ts";
import { presentationLineBox } from "./layout.ts";
import type { PreparedPresentation } from "./render.ts";

const number = (value: number) => String(Number(value.toFixed(6))),
  pt = (value: number) => `${number(value)}pt`;
function transform(
  element: Pick<PresentationElement, "box" | "rotation" | "flipX" | "flipY">,
): string {
  const angle = (element.rotation * Math.PI) / 180,
    sx = element.flipX ? -1 : 1,
    sy = element.flipY ? -1 : 1,
    a = Math.cos(angle) * sx,
    b = Math.sin(angle) * sx,
    c = -Math.sin(angle) * sy,
    d = Math.cos(angle) * sy,
    e = element.box.x + element.box.w / 2 - (a * element.box.w) / 2 - (c * element.box.h) / 2,
    f = element.box.y + element.box.h / 2 - (b * element.box.w) / 2 - (d * element.box.h) / 2;
  return `matrix(${number(a)} ${number(b)} ${number(c)} ${number(d)} ${pt(e)} ${pt(f)})`;
}
export function exportOdp(
  prepared: PreparedPresentation,
  fonts: UnicodeFonts,
  license: string,
): Uint8Array {
  const { parts, media, faces } = openDocumentFonts(fonts, license),
    automatic: string[] = [],
    slides: string[] = [];
  let counter = 0;
  for (const [index, source] of prepared.slides.entries()) {
    const slide = prepared.document.slides[index];
    if (!slide) throw new Error("Layout e slides OpenDocument não correspondem.");
    const name = `Page${index + 1}`;
    automatic.push(
      `<style:style style:name="${name}" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="${slide.background}"/></style:style>`,
    );
    const elements: string[] = [];
    for (const { element, lines } of source.elements) {
      const id = `Object${++counter}`,
        position = `svg:x="0pt" svg:y="0pt" svg:width="${pt(element.box.w)}" svg:height="${pt(element.box.h)}" draw:transform="${transform(element)}"`;
      if (element.kind === "text") {
        if (!lines) throw new Error("Texto OpenDocument sem layout medido.");
        for (const [lineIndex, line] of lines.entries()) {
          if (!line.fragments.length) continue;
          const lineName = `${id}Line${lineIndex}`,
            box = presentationLineBox(element, line),
            fragments: string[] = [];
          for (const [fragmentIndex, fragment] of line.fragments.entries()) {
            const style = `${lineName}Run${fragmentIndex}`,
              font = fragment.bold
                ? fragment.italic
                  ? "boldItalic"
                  : "bold"
                : fragment.italic
                  ? "italic"
                  : "regular";
            automatic.push(
              `<style:style style:name="${style}" style:family="text"><style:text-properties style:font-name="Noto-${font}" fo:font-size="${pt(fragment.size)}" fo:font-weight="${fragment.bold ? "bold" : "normal"}" fo:font-style="${fragment.italic ? "italic" : "normal"}" fo:color="${fragment.color}"/></style:style>`,
            );
            fragments.push(
              `<text:span text:style-name="${style}">${openText(fragment.text)}</text:span>`,
            );
          }
          elements.push(
            `<draw:frame draw:name="${xml(element.id)}-line-${lineIndex + 1}" draw:style-name="TextFrame" svg:x="0pt" svg:y="0pt" svg:width="${pt(box.w)}" svg:height="${pt(box.h)}" draw:transform="${transform({ ...element, box })}"><draw:text-box><text:p>${fragments.join("")}</text:p></draw:text-box></draw:frame>`,
          );
        }
      } else if (element.kind === "image") {
        const path = `Pictures/image${counter}.${element.format}`;
        parts[path] = element.bytes;
        media.set(path, element.format === "png" ? "image/png" : "image/jpeg");
        elements.push(
          `<draw:frame draw:name="${xml(element.id)}" ${position}><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${element.alt ? `<svg:desc>${xml(element.alt)}</svg:desc>` : ""}</draw:frame>`,
        );
      } else {
        automatic.push(
          `<style:style style:name="${id}" style:family="graphic"><style:graphic-properties draw:fill="${element.fill ? "solid" : "none"}"${element.fill ? ` draw:fill-color="${element.fill}" draw:opacity="${number(element.opacity * 100)}%"` : ""} draw:stroke="${element.stroke && element.width ? "solid" : "none"}"${element.stroke ? ` svg:stroke-color="${element.stroke}" svg:stroke-width="${pt(element.width)}" svg:stroke-opacity="${number(element.opacity * 100)}%"` : ""}/></style:style>`,
        );
        elements.push(
          element.shape === "line"
            ? `<draw:line draw:name="${xml(element.id)}" draw:style-name="${id}" svg:x1="0pt" svg:y1="0pt" svg:x2="${pt(element.box.w)}" svg:y2="${pt(element.box.h)}" draw:transform="${transform(element)}"/>`
            : `<draw:${element.shape === "rect" ? "rect" : "ellipse"} draw:name="${xml(element.id)}" draw:style-name="${id}" ${position}/>`,
        );
      }
    }
    slides.push(
      `<draw:page draw:name="${index + 1} — ${xml(slide.name || `Slide ${index + 1}`)}" draw:style-name="${name}" draw:master-page-name="Default">${elements.join("")}</draw:page>`,
    );
  }
  const textFrame =
    '<style:style style:name="TextFrame" style:family="graphic"><style:graphic-properties draw:fill="none" draw:stroke="none" fo:padding="0pt" draw:textarea-vertical-align="top" draw:textarea-horizontal-align="left"/></style:style>';
  parts["content.xml"] = strToU8(
    `${XML_HEADER}<office:document-content ${namespaces} office:version="1.3"><office:font-face-decls>${faces}</office:font-face-decls><office:automatic-styles>${textFrame}${automatic.join("")}</office:automatic-styles><office:body><office:presentation>${slides.join("")}</office:presentation></office:body></office:document-content>`,
  );
  parts["styles.xml"] = strToU8(
    `${XML_HEADER}<office:document-styles ${namespaces} office:version="1.3"><office:font-face-decls>${faces}</office:font-face-decls><office:automatic-styles><style:page-layout style:name="Layout"><style:page-layout-properties fo:page-width="${pt(prepared.document.width)}" fo:page-height="${pt(prepared.document.height)}" fo:margin="0pt" style:print-orientation="${prepared.document.width > prepared.document.height ? "landscape" : "portrait"}"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="Layout"/></office:master-styles></office:document-styles>`,
  );
  parts["meta.xml"] = strToU8(
    `${XML_HEADER}<office:document-meta ${namespaces} office:version="1.3"><office:meta><dc:title>${xml(prepared.document.title)}</dc:title><meta:generator>EdiPDF</meta:generator></office:meta></office:document-meta>`,
  );
  return writeOpenPackage("presentation", parts, media);
}
