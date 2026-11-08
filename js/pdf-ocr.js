// Extrai texto do PDF. Usa a camada de texto quando existe (mapa digital);
// senão renderiza a página e aplica OCR (PDF.js + Tesseract.js).
(function (Ane) {
  'use strict';

  if (globalThis.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = Ane.config.PDFJS_WORKER_SRC;
  }

  const MIN_TEXT_CHARS = 40;
  const LINE_Y_TOLERANCE = 4;

  function textContentToString(content) {
    const items = (content.items || []).filter((item) => item && item.str);
    items.sort((a, b) => {
      const yA = a.transform[5];
      const yB = b.transform[5];
      if (Math.abs(yA - yB) > LINE_Y_TOLERANCE) return yB - yA;
      return a.transform[4] - b.transform[4];
    });

    const lines = [];
    let currentY = null;
    let line = '';
    let lastEndX = 0;

    const flush = () => {
      const trimmed = line.replace(/\s+/g, ' ').trim();
      if (trimmed) lines.push(trimmed);
      line = '';
    };

    for (const item of items) {
      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width || 0;

      if (currentY !== null && Math.abs(y - currentY) > LINE_Y_TOLERANCE) {
        flush();
        lastEndX = 0;
      } else if (line && x - lastEndX > 3) {
        line += ' ';
      }

      line += item.str;
      lastEndX = x + width;
      currentY = y;
    }

    flush();
    return lines.join('\n');
  }

  async function extractPageText(page) {
    const content = await page.getTextContent({ normalizeWhitespace: true });
    return textContentToString(content);
  }

  async function recognizePage(page, worker) {
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
    }
  }

  // onProgress(pageNumber, totalPages) é chamado antes de cada página.
  async function extractText(file, onProgress = () => {}) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let worker = null;
    let text = '';

    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        onProgress(i, pdf.numPages);
        const page = await pdf.getPage(i);
        let pageText = '';

        try {
          pageText = await extractPageText(page);
          const compact = pageText.replace(/\s/g, '');
          if (compact.length < MIN_TEXT_CHARS) {
            if (!worker) worker = await Tesseract.createWorker(Ane.config.OCR_LANGUAGE);
            pageText = await recognizePage(page, worker);
          }
        } finally {
          page.cleanup();
        }

        text += `\n\n--- Página ${i} ---\n\n` + pageText;
      }
      return text;
    } finally {
      if (worker) await worker.terminate();
      pdf.destroy();
    }
  }

  Ane.pdfOcr = { extractText };
})(globalThis.Ane = globalThis.Ane || {});
