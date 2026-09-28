// Liga a interface aos módulos de OCR, extração e CSV.
(function (Ane) {
  'use strict';

  const { parser, csv, pdfOcr, view, messages } = Ane;
  const { html } = view;

  const state = {
    extracted: null, // { rows, standardLines }
    pdfJob: 0 // incrementa a cada PDF para descartar resultados de seleções antigas
  };

  function downloadFile(content, filename, mimeType = 'text/csv;charset=utf-8;') {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function init() {
    const el = {
      pdfFile: document.getElementById('pdfFile'),
      pdfStatus: document.getElementById('pdfStatus'),
      csvFile: document.getElementById('csvFile'),
      csvStatus: document.getElementById('csvStatus'),
      processBtn: document.getElementById('processCSVBtn'),
      output: document.getElementById('output')
    };

    function onCellEdit(index, field, value) {
      const row = state.extracted?.rows[index];
      if (!row) return;
      row[field] = value;
      const line = parser.toStandardFormat(row);
      state.extracted.standardLines[index] = line;
      view.updateStandardLine(el.output, index, line);
    }

    async function onPdfSelected(file) {
      if (!file) return view.clear(el.pdfStatus);

      const job = ++state.pdfJob;
      state.extracted = null;
      view.showStatus(el.pdfStatus, html`${messages.FILE_SELECTED}: <strong>${file.name}</strong>`);
      view.showLoader(el.output);

      try {
        const text = await pdfOcr.extractText(file, (page, total) => {
          if (job === state.pdfJob) view.updateProgress(el.output, page, total);
        });
        if (job !== state.pdfJob) return;

        const extracted = parser.extractRecords(text);
        if (!extracted.rows.length) return view.showEmptyResult(el.output, text);

        state.extracted = extracted;
        view.showResults(el.output, extracted, text, onCellEdit);
      } catch (error) {
        if (job !== state.pdfJob) return;
        console.error('Erro ao processar PDF:', error);
        view.showStatus(el.output, `${messages.PDF_ERROR} ${error.message}`, 'error');
      }
    }

    function onCsvSelected(file) {
      el.processBtn.disabled = !file;
      if (file) {
        view.showStatus(el.csvStatus, html`${messages.FILE_SELECTED}: <strong>${file.name}</strong>`);
      } else {
        view.clear(el.csvStatus);
      }
    }

    async function onProcessCsv() {
      const file = el.csvFile.files?.[0];
      if (!file) return view.showStatus(el.csvStatus, messages.CSV_REQUIRED, 'error');
      if (!state.extracted?.rows.length) return view.showStatus(el.csvStatus, messages.PDF_REQUIRED, 'error');

      let text;
      try {
        // ignoreBOM mantém o BOM no texto para que a saída preserve a codificação do original.
        text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await file.arrayBuffer());
      } catch {
        return view.showStatus(el.csvStatus, messages.CSV_READ_ERROR, 'error');
      }

      try {
        // Usa os dados atuais da tabela, incluindo as edições feitas pelo usuário.
        const result = csv.fill(csv.parse(text), state.extracted.rows);
        if (!result) return view.showStatus(el.csvStatus, messages.ID_COLUMN_NOT_FOUND, 'error');

        downloadFile(csv.stringify(result), file.name.replace(/\.csv$/i, '') + '_preenchido.csv');
        view.showStatus(
          el.csvStatus,
          html`${messages.CSV_PROCESSED} <strong>${result.filledCount}</strong> campos preenchidos. Arquivo baixado.`,
          'success'
        );
      } catch (error) {
        console.error('Erro ao processar CSV:', error);
        view.showStatus(el.csvStatus, `${messages.CSV_ERROR} ${error.message}`, 'error');
      }
    }

    el.pdfFile.addEventListener('change', (e) => onPdfSelected(e.target.files[0]));
    el.csvFile.addEventListener('change', (e) => onCsvSelected(e.target.files[0]));
    el.processBtn.addEventListener('click', onProcessCsv);
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.Ane = globalThis.Ane || {});
