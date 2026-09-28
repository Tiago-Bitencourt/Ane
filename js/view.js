// Renderização da interface. Toda interpolação passa por `html`, que escapa os valores.
(function (Ane) {
  'use strict';

  class SafeHtml {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
  }

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

  const render = (value) => {
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(render).join('');
    return escapeHtml(value);
  };

  function html(strings, ...values) {
    return new SafeHtml(strings.reduce((out, str, i) => out + render(values[i - 1]) + str));
  }

  // ---------------------------------------------------------------------------
  // Passos e mensagens
  // ---------------------------------------------------------------------------

  // state: 'locked' | 'active' | 'done'. Passos bloqueados desabilitam seus campos.
  function setStepState(step, state) {
    step.dataset.state = state;
    step.querySelectorAll('input').forEach((input) => { input.disabled = state === 'locked'; });
  }

  const STATUS_ICONS = { info: 'circle-check', success: 'circle-check', error: 'circle-exclamation' };

  // `message` pode ser texto simples ou o resultado de `html`.
  function showStatus(element, message, type = 'info') {
    element.innerHTML = html`
      <div class="status status-${type}" role="${type === 'error' ? 'alert' : 'status'}">
        <i class="fas fa-${STATUS_ICONS[type]}"></i><span>${message}</span>
      </div>`;
  }

  function showFileChip(element, fileName) {
    showStatus(element, html`<span class="file-name">${fileName}</span>`, 'info');
  }

  function clear(element) {
    element.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Processamento do PDF
  // ---------------------------------------------------------------------------

  function showLoader(output) {
    output.innerHTML = html`
      <div class="loader">
        <i class="fas fa-circle-notch fa-spin loader-icon"></i>
        <div class="loader-title">Preparando o OCR...</div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="progress-bar"></div>
        </div>
        <div class="loader-subtitle">0% concluído</div>
      </div>`;
  }

  function updateProgress(output, pageNumber, totalPages) {
    const loader = output.querySelector('.loader');
    if (!loader) return;
    const percent = Math.round(((pageNumber - 1) / totalPages) * 100);
    loader.querySelector('.loader-title').textContent = `Lendo página ${pageNumber} de ${totalPages}`;
    loader.querySelector('.progress').setAttribute('aria-valuenow', percent);
    loader.querySelector('.progress-bar').style.width = `${percent}%`;
    loader.querySelector('.loader-subtitle').textContent = `${percent}% concluído`;
  }

  const rawTextDetails = (rawText, open = false) => html`
    <details class="raw-details" ${open ? html`open` : ''}>
      <summary><i class="fas fa-chevron-right"></i> Texto bruto do OCR</summary>
      <div class="raw-text">${rawText}</div>
    </details>`;

  function showEmptyResult(output, rawText) {
    output.innerHTML = html`
      <div class="status status-error" role="alert">
        <i class="fas fa-triangle-exclamation"></i>
        <span>${Ane.messages.NO_DATA}. Confira abaixo o texto lido do PDF.</span>
      </div>
      ${rawTextDetails(rawText, true)}`;
  }

  // ---------------------------------------------------------------------------
  // Resultado: resumo, tabela editável e formato padronizado
  // ---------------------------------------------------------------------------

  const ISSUE_CLASSES = { empty: 'cell-empty', suspect: 'cell-suspect' };
  const isUnrecognized = (row) => !row.sequence && !row.id && row.rawLine;

  const cellAttrs = (issue) => ({
    className: issue ? ISSUE_CLASSES[issue.type] : '',
    title: issue ? issue.message : ''
  });

  function tableRows(row, index, issues) {
    const flagged = Object.keys(issues).length ? 'has-issues' : '';
    const cells = Ane.editableFields.map((field) => {
      const { className, title } = cellAttrs(issues[field]);
      return html`<td class="editable ${className}" contenteditable="true" title="${title}"
        data-field="${field}" data-index="${index}">${row[field]}</td>`;
    });

    const main = html`<tr class="data-row ${flagged}" data-index="${index}"><td class="cell-seq">${row.sequence}</td>${cells}</tr>`;
    if (!isUnrecognized(row)) return main;

    // Linha que o OCR não conseguiu separar: mostra o texto original para facilitar a correção.
    return html`${main}
      <tr class="raw-row ${flagged}" data-raw-for="${index}">
        <td colspan="${Ane.tableHeaders.length}">
          <i class="fas fa-triangle-exclamation"></i> Linha não reconhecida — texto original: <code>${row.rawLine}</code>
        </td>
      </tr>`;
  }

  const summaryContent = (count) => (count
    ? html`<i class="fas fa-triangle-exclamation"></i><span><strong>${count}</strong> ${count === 1 ? 'linha precisa' : 'linhas precisam'} de revisão</span>`
    : html`<i class="fas fa-circle-check"></i><span>Nenhuma linha precisa de revisão</span>`);

  const standardLines = (lines) => (lines.length
    ? lines.map((line, i) => html`<div class="unified-line" data-index="${i}">${line}</div>`)
    : html`<p class="step-placeholder">Nenhum dado padronizado disponível</p>`);

  // issues: array paralelo a rows com o resultado de parser.validateRecord.
  // onEdit(index, field, value) é chamado quando uma célula editada perde o foco.
  function showResults(output, { rows, standardLines: lines }, rawText, issues, onEdit) {
    const issueCount = issues.filter((i) => Object.keys(i).length).length;

    output.innerHTML = html`
      <div class="review-bar">
        <div class="review-summary" role="status"></div>
        <label class="toggle">
          <input type="checkbox" class="filter-issues">
          <span>Mostrar só as linhas para revisar</span>
        </label>
      </div>

      <div class="tabs" role="tablist">
        <button type="button" class="tab active" data-tab="table">Tabela <span class="tab-count">${rows.length}</span></button>
        <button type="button" class="tab" data-tab="standard">Formato padronizado <span class="tab-count">${lines.length}</span></button>
      </div>

      <div data-panel="table" class="tab-content active">
        <div class="legend">
          <span><span class="legend-swatch cell-empty"></span> Campo vazio</span>
          <span><span class="legend-swatch cell-suspect"></span> Valor suspeito (passe o mouse para ver o motivo)</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr>${Ane.tableHeaders.map((h) => html`<th>${h}</th>`)}</tr></thead>
            <tbody>${rows.map((row, i) => tableRows(row, i, issues[i]))}</tbody>
          </table>
        </div>
      </div>

      <div data-panel="standard" class="tab-content">
        <p class="panel-hint">Formato: <code>#;id;sexo;idade;nome</code></p>
        <div class="unified-lines">${standardLines(lines)}</div>
      </div>

      ${rawTextDetails(rawText)}`;

    updateSummary(output, issueCount);
    bindTabs(output);
    bindFilter(output);
    bindEditableCells(output, onEdit);
  }

  function updateSummary(output, count) {
    const summary = output.querySelector('.review-summary');
    const filter = output.querySelector('.filter-issues');
    summary.innerHTML = summaryContent(count);
    summary.classList.toggle('is-ok', count === 0);
    filter.disabled = count === 0;
    if (count === 0 && filter.checked) {
      filter.checked = false;
      filter.dispatchEvent(new Event('change'));
    }
  }

  function updateRowIssues(output, index, issues) {
    const flagged = Object.keys(issues).length > 0;
    output.querySelectorAll(`tr[data-index="${index}"], tr[data-raw-for="${index}"]`)
      .forEach((tr) => tr.classList.toggle('has-issues', flagged));

    output.querySelectorAll(`td.editable[data-index="${index}"]`).forEach((cell) => {
      const issue = issues[cell.dataset.field];
      cell.classList.remove(...Object.values(ISSUE_CLASSES));
      const { className, title } = cellAttrs(issue);
      if (className) cell.classList.add(className);
      cell.title = title;
    });
  }

  function updateStandardLine(output, index, line) {
    const el = output.querySelector(`.unified-line[data-index="${index}"]`);
    if (el) el.textContent = line;
  }

  function bindTabs(root) {
    root.querySelector('.tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('.tab');
      if (!tab) return;
      root.querySelectorAll('.tab, .tab-content').forEach((el) => el.classList.remove('active'));
      tab.classList.add('active');
      root.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  }

  // Linhas corrigidas continuam visíveis até o filtro ser reaplicado, para não "sumirem" durante a edição.
  function bindFilter(root) {
    const table = root.querySelector('table');
    root.querySelector('.filter-issues').addEventListener('change', (event) => {
      table.querySelectorAll('tr.keep-visible').forEach((tr) => tr.classList.remove('keep-visible'));
      table.classList.toggle('only-issues', event.target.checked);
    });
  }

  function bindEditableCells(root, onEdit) {
    const tbody = root.querySelector('tbody');

    tbody.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.matches('td.editable')) {
        event.preventDefault();
        event.target.blur();
      }
    });

    tbody.addEventListener('focusout', (event) => {
      const cell = event.target;
      if (!cell.matches('td.editable')) return;
      const index = cell.dataset.index;
      tbody.querySelectorAll(`tr[data-index="${index}"], tr[data-raw-for="${index}"]`)
        .forEach((tr) => tr.classList.add('keep-visible'));
      onEdit(Number(index), cell.dataset.field, cell.textContent.trim());
    });
  }

  Ane.view = {
    html,
    setStepState,
    showStatus,
    showFileChip,
    clear,
    showLoader,
    updateProgress,
    showEmptyResult,
    showResults,
    updateSummary,
    updateRowIssues,
    updateStandardLine
  };
})(globalThis.Ane = globalThis.Ane || {});
