// Liga a interface aos módulos de OCR, extração e CSV.
(function (Ane) {
  'use strict';

  const { parser, csv, pdfOcr, view, messages } = Ane;
  const { html } = view;

  const state = {
    extracted: null, // { rows, standardLines }
    csvFile: null,
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

  const hasExtension = (file, ext) => file.name.toLowerCase().endsWith(ext);
  const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    const el = {
      stepPdf: document.getElementById('stepPdf'),
      stepReview: document.getElementById('stepReview'),
      stepCsv: document.getElementById('stepCsv'),
      pdfFile: document.getElementById('pdfFile'),
      pdfStatus: document.getElementById('pdfStatus'),
      csvFile: document.getElementById('csvFile'),
      csvStatus: document.getElementById('csvStatus'),
      processBtn: document.getElementById('processCSVBtn'),
      downloadTableBtn: document.getElementById('downloadTableBtn'),
      output: document.getElementById('output')
    };

    // Estado dos passos e botões derivado de `state`.
    function syncSteps({ loading = false } = {}) {
      const ready = Boolean(state.extracted);
      view.setStepState(el.stepPdf, ready ? 'done' : 'active');
      view.setStepState(el.stepReview, ready || loading ? 'active' : 'locked');
      view.setStepState(el.stepCsv, ready ? 'active' : 'locked');
      el.processBtn.disabled = !(ready && state.csvFile);
      el.downloadTableBtn.disabled = !ready;
    }

    function onCellEdit(index, field, value) {
      const row = state.extracted?.rows[index];
      if (!row) return;
      row[field] = value;

      const line = parser.toStandardFormat(row);
      state.extracted.standardLines[index] = line;
      view.updateStandardLine(el.output, index, line);
      view.updateRowIssues(el.output, index, parser.validateRecord(row));
      view.updateSummary(el.output, state.extracted.rows.filter(parser.hasIssues).length);
    }

    async function onPdfSelected(file) {
      if (!file) return;
      if (!hasExtension(file, '.pdf')) return view.showStatus(el.pdfStatus, messages.INVALID_PDF, 'error');

      const job = ++state.pdfJob;
      state.extracted = null;
      view.showFileChip(el.pdfStatus, file.name);
      view.showLoader(el.output);
      syncSteps({ loading: true });

      try {
        const text = await pdfOcr.extractText(file, (page, total) => {
          if (job === state.pdfJob) view.updateProgress(el.output, page, total);
        });
        if (job !== state.pdfJob) return;

        const extracted = parser.extractRecords(text);
        if (!extracted.rows.length) {
          view.showEmptyResult(el.output, text);
          return;
        }

        state.extracted = extracted;
        view.showResults(el.output, extracted, text, extracted.rows.map(parser.validateRecord), onCellEdit);
        syncSteps();
        el.stepReview.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      } catch (error) {
        if (job !== state.pdfJob) return;
        console.error('Erro ao processar PDF:', error);
        view.showStatus(el.output, `${messages.PDF_ERROR} ${error.message}`, 'error');
      }
    }

    function onCsvSelected(file) {
      if (!file) return;
      if (!hasExtension(file, '.csv')) return view.showStatus(el.csvStatus, messages.INVALID_CSV, 'error');
      state.csvFile = file;
      view.showFileChip(el.csvStatus, file.name);
      syncSteps();
    }

    async function onProcessCsv() {
      const file = state.csvFile;
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
          html`${messages.CSV_PROCESSED} <strong>${result.filledCount}</strong> campos preenchidos em <span class="file-name">${file.name}</span>. Arquivo baixado.`,
          'success'
        );
      } catch (error) {
        console.error('Erro ao processar CSV:', error);
        view.showStatus(el.csvStatus, `${messages.CSV_ERROR} ${error.message}`, 'error');
      }
    }

    // ";" e BOM para abrir corretamente (com acentos) no Excel em português.
    function onDownloadTable() {
      if (!state.extracted) return;
      const rows = state.extracted.rows.map((r) => [r.sequence, r.id, r.sex, r.age, r.name]);
      downloadFile(
        csv.stringify({ headers: [...Ane.tableHeaders], rows, delimiter: ';', hasBom: true }),
        'dados_extraidos.csv'
      );
    }

    // Limpa o valor do input para que escolher o mesmo arquivo de novo dispare `change`.
    function bindFileInput(input, onFile) {
      input.addEventListener('change', () => {
        const file = input.files[0];
        input.value = '';
        onFile(file);
      });

      const zone = input.closest('.dropzone');
      zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (!input.disabled) zone.classList.add('is-dragover');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('is-dragover');
        if (!input.disabled) onFile(event.dataTransfer.files[0]);
      });
    }

    // Evita que o navegador abra o arquivo quando ele é solto fora de uma área válida.
    ['dragover', 'drop'].forEach((type) => window.addEventListener(type, (e) => e.preventDefault()));

    bindFileInput(el.pdfFile, onPdfSelected);
    bindFileInput(el.csvFile, onCsvSelected);
    el.processBtn.addEventListener('click', onProcessCsv);
    el.downloadTableBtn.addEventListener('click', onDownloadTable);
    syncSteps();
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.Ane = globalThis.Ane || {});
