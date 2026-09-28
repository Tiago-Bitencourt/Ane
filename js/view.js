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

  const STATUS_ICONS = { info: 'check-circle', success: 'check-circle', error: 'exclamation-circle' };

  // `message` pode ser texto simples ou o resultado de `html`.
  function showStatus(element, message, type = 'info') {
    element.innerHTML = html`
      <div class="status-message status-${type}" role="${type === 'error' ? 'alert' : 'status'}">
        <i class="fas fa-${STATUS_ICONS[type]}"></i> <span>${message}</span>
      </div>`;
  }

  function clear(element) {
    element.innerHTML = '';
  }

  function showLoader(output) {
    output.innerHTML = html`
      <div class="container">
        <div class="loader-container">
          <i class="fas fa-file-pdf loader-icon"></i>
          <div class="loader-title">Processando PDF com OCR...</div>
          <div class="loader-subtitle">Isso pode levar alguns segundos. Por favor, aguarde.</div>
          <div class="progress-container">
            <div class="progress-bar-wrapper"><div class="progress-bar"></div></div>
            <div class="progress-text">0% concluído</div>
          </div>
        </div>
      </div>`;
  }

  function updateProgress(output, pageNumber, totalPages) {
    const loader = output.querySelector('.loader-container');
    if (!loader) return;
    const percent = Math.round((pageNumber / totalPages) * 100);
    loader.querySelector('.loader-title').textContent = `Processando página ${pageNumber} de ${totalPages}`;
    loader.querySelector('.loader-subtitle').textContent = 'Extraindo dados da tabela...';
    loader.querySelector('.progress-bar').style.width = `${percent}%`;
    loader.querySelector('.progress-text').textContent = `${percent}% concluído`;
  }

  function showEmptyResult(output, rawText) {
    output.innerHTML = html`
      <div class="container">
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle empty-state-icon"></i>
          <p class="empty-state-title">${Ane.messages.NO_DATA}</p>
          <p class="empty-state-subtitle">Texto bruto extraído do PDF:</p>
          <div class="raw-text">${rawText}</div>
        </div>
      </div>`;
  }

  const tableRow = (row, index) => html`
    <tr>
      <td>${row.sequence}</td>
      ${Ane.editableFields.map((field) => html`
        <td class="editable${row[field] ? '' : ' na-value'}" contenteditable="true"
            data-field="${field}" data-index="${index}">${row[field]}</td>`)}
    </tr>`;

  const standardLines = (lines) => lines.length
    ? lines.map((line, i) => html`<div class="unified-line" data-index="${i}">${line}</div>`)
    : html`<p class="empty-hint">Nenhum dado padronizado disponível</p>`;

  // onEdit(index, field, value) é chamado quando uma célula editada perde o foco.
  function showResults(output, { rows, standardLines: lines }, rawText, onEdit) {
    output.innerHTML = html`
      <div class="container">
        <div class="tabs" role="tablist">
          <button type="button" class="tab active" data-tab="table"><i class="fas fa-table"></i> Tabela de Dados (${rows.length})</button>
          <button type="button" class="tab" data-tab="standard"><i class="fas fa-code"></i> Formato Padronizado (${lines.length})</button>
          <button type="button" class="tab" data-tab="raw"><i class="fas fa-file-alt"></i> Texto Bruto</button>
        </div>
        <div data-panel="table" class="tab-content active">
          <div class="info-badge"><i class="fas fa-edit"></i> Clique em qualquer célula (exceto #) para editar os dados</div>
          <div class="table-scroll">
            <table>
              <thead><tr>${Ane.tableHeaders.map((h) => html`<th>${h}</th>`)}</tr></thead>
              <tbody>${rows.map(tableRow)}</tbody>
            </table>
          </div>
        </div>
        <div data-panel="standard" class="tab-content">
          <div class="info-badge"><i class="fas fa-info-circle"></i> Dados no formato padronizado: #;id;sexo;idade;nome</div>
          <div class="unified-lines-container">${standardLines(lines)}</div>
        </div>
        <div data-panel="raw" class="tab-content"><div class="raw-text">${rawText}</div></div>
      </div>`;

    bindTabs(output);
    bindEditableCells(output, onEdit);
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
      const value = cell.textContent.trim();
      cell.classList.toggle('na-value', !value);
      onEdit(Number(cell.dataset.index), cell.dataset.field, value);
    });
  }

  function updateStandardLine(output, index, line) {
    const el = output.querySelector(`.unified-line[data-index="${index}"]`);
    if (el) el.textContent = line;
  }

  Ane.view = {
    html,
    showStatus,
    clear,
    showLoader,
    updateProgress,
    showEmptyResult,
    showResults,
    updateStandardLine
  };
})(globalThis.Ane = globalThis.Ane || {});
