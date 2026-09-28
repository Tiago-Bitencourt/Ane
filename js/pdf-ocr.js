// Renderiza cada página do PDF em um canvas e aplica OCR (PDF.js + Tesseract.js).
(function (Ane) {
  'use strict';

  if (globalThis.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = Ane.config.PDFJS_WORKER_SRC;
  }

  async function recognizePage(pdf, pageNumber, worker) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: Ane.config.OCR_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    try {
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const { data } = await worker.recognize(canvas);
      return data.text;
    } finally {
      // Canvas nessa escala ocupa centenas de MB: libera antes da próxima página.
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
  }

  // onProgress(pageNumber, totalPages) é chamado antes de cada página.
  async function extractText(file, onProgress = () => {}) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const worker = await Tesseract.createWorker(Ane.config.OCR_LANGUAGE);

    try {
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        onProgress(i, pdf.numPages);
        text += `\n\n--- Página ${i} ---\n\n` + (await recognizePage(pdf, i, worker));
      }
      return text;
    } finally {
      await worker.terminate();
      pdf.destroy();
    }
  }

  Ane.pdfOcr = { extractText };
})(globalThis.Ane = globalThis.Ane || {});
