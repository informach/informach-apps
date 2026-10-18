import { buildRasterPrint } from "@shared/raster-print";

self.onmessage = (event: MessageEvent<unknown>) => {
  void buildRasterPrint(event.data)
    .then((result) => {
      if (!(result.bytes.buffer instanceof ArrayBuffer))
        throw new Error("Buffer de impressão não transferível.");
      self.postMessage({ ok: true, ...result }, { transfer: [result.bytes.buffer] });
    })
    .catch((failure: unknown) => {
      self.postMessage({
        ok: false,
        error: (failure instanceof Error
          ? failure.message
          : "Falha na impressão como imagens."
        ).slice(0, 2000),
      });
    });
};
