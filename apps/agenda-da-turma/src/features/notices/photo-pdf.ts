/**
 * Junta as fotos de um recado num PDF só, no navegador.
 *
 * A agenda da criança tem duas páginas; o comunicado da escola, três. Até aqui
 * cada foto era uma importação — e uma cobrança — separada, e as atividades
 * saíam desconexas. Como PDF, é um recado só, uma leitura só.
 *
 * Roda no cliente de propósito: o servidor já aceita PDF de até três páginas, e
 * montar aqui evita subir três arquivos para depois juntar.
 */
export const MAX_PHOTOS = 3;
/**
 * O servidor recusa anexo acima de 5 MB, medido nos bytes decodificados. A
 * folga é para o PDF crescer um pouco na montagem, não para o base64 — esse
 * infla o `dataUrl`, e o limite do route handler já conta com isso.
 */
const MAX_PDF_BYTES = 4.6 * 1024 * 1024;
const MAX_EDGE = 1600;

export type Photo = { name: string; dataUrl: string };

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("IMAGE"));
    image.src = dataUrl;
  });
}

/**
 * Redesenha em JPEG com o lado maior limitado.
 *
 * Duas razões: WebP não é aceito pelo `pdf-lib`, e uma foto de celular moderna
 * passa sozinha do limite de 5 MB. A qualidade cai em passos até caber — uma
 * foto de agenda continua legível bem antes do fundo da escala.
 */
async function toJpeg(dataUrl: string, quality: number): Promise<string> {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function buildPdfFromPhotos(photos: readonly Photo[]): Promise<Photo> {
  if (!photos.length) throw new Error("NO_PHOTOS");
  const { PDFDocument } = await import("pdf-lib");
  for (const quality of [0.85, 0.7, 0.55]) {
    const pdf = await PDFDocument.create();
    for (const photo of photos) {
      const jpeg = await toJpeg(photo.dataUrl, quality);
      const embedded = await pdf.embedJpg(jpeg);
      const page = pdf.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    }
    const bytes = await pdf.save();
    if (bytes.byteLength <= MAX_PDF_BYTES) {
      // Em blocos: concatenar caractere a caractere sobre ~4,6 milhões de
      // bytes trava a interface no telefone, que é exatamente onde a foto é
      // tirada.
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return {
        name: `recado-${photos.length}-fotos.pdf`,
        dataUrl: `data:application/pdf;base64,${btoa(binary)}`,
      };
    }
  }
  throw new Error("PHOTOS_TOO_LARGE");
}
