// ============================================================================
// CONSTANTS
// ============================================================================
const Constants = {
  CONFIG: {
    OCR_LANGUAGE: 'por',
    OCR_SCALE: 7.0,
    ID_DIGITS: 5
  },
  CSV_COLUMNS: {
    ID_NAMES: ['ID amost.', 'ID', 'Id', 'id', 'ID amostra', 'ID amostra.'],
    HEADERS: ['#', 'ID', 'Sexo', 'Idade', 'Nome']
  },
  UI_MESSAGES: {
    NO_DATA: 'Nenhum dado extraído',
    CSV_SELECTED: 'Arquivo selecionado',
    CSV_REQUIRED: 'Por favor, selecione um arquivo CSV.',
    PDF_REQUIRED: 'Por favor, primeiro extraia os dados do PDF.',
    ID_COLUMN_NOT_FOUND: 'Erro: Coluna de ID não encontrada no CSV. Procure por "ID amost." ou "ID".',
    CSV_PROCESSED: 'CSV processado com sucesso!',
    CSV_ERROR: 'Erro ao processar CSV:',
    CSV_READ_ERROR: 'Erro ao ler o arquivo CSV.'
  }
};

// ============================================================================
// UTILITIES
// ============================================================================
const Utils = {
  fixOCRErrors(text) {
    if (!text) return text;
    return text
      .replace(/[\]?]/g, '')
      .replace(/^(\d+)\/(\d+)\s+(\d+\.?\d*\.?\d*)/gm, '$1$2 $3')
      .replace(/\|([MFN])\|\s*\|\s*(\d+)/g, '|$1| $2')
      // Fix OCR errors where letters replace digits at end of ID patterns
      // Pattern: number.number.numberLetter | -> try to fix (e.g., "25.083.1M |" -> "25.083.144 |")
      // Common OCR errors: M often = 44, N = 11, but we'll be conservative
      .replace(/(\d+\.\d+\.\d)([A-Z])(\s*\|)/g, (match, p1, p2, p3) => {
        // If it's a single letter after a digit before pipe, try common replacements
        const replacements = { 'M': '44', 'N': '11', 'O': '0', 'I': '1' };
        // Only replace if it's a known common error, otherwise remove the letter
        return p1 + (replacements[p2] || '') + p3;
      });
  },

  normalizeRecordLines(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const normalized = [];
    let currentRecord = [];
    
    const shouldStop = (line) => /^---\s*Página|https?:\/\/|\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4}$/.test(line);
    const isNewRecord = (line) => /^\d{1,3}\s+\d+\.?\d*\.?\d*/.test(line);
    const isAgeAfterSex = (prev, curr) => (/\|[MFN]\|\s*$|\|\s*\|[MFN]\|\s*$/.test(prev) && /^\d+$/.test(curr));

    for (const line of lines) {
      if (shouldStop(line)) {
        if (currentRecord.length) normalized.push(currentRecord.join(' '));
        currentRecord = [];
        continue;
      }

      if (isNewRecord(line)) {
        if (currentRecord.length) normalized.push(currentRecord.join(' '));
        currentRecord = [line];
      } else if (currentRecord.length) {
        if (isAgeAfterSex(currentRecord[currentRecord.length - 1], line)) {
          currentRecord.push(`| ${line.trim()}`);
        } else if (!isNewRecord(line) && !shouldStop(line)) {
          currentRecord.push(line);
        }
      } else if (/^\d+/.test(line)) {
        currentRecord = [line];
      }
    }
    
    if (currentRecord.length) normalized.push(currentRecord.join(' '));
    return normalized;
  },

  extractLastNDigits(value, n = Constants.CONFIG.ID_DIGITS) {
    // Remove dots, spaces, commas, and also remove letters (OCR errors like "1M" -> "1")
    const cleaned = String(value || '').replace(/[.\s/,]/g, '').replace(/[A-Za-z]/g, '');
    return cleaned.length >= n ? cleaned.slice(-n) : cleaned;
  },

  toStandardFormat(row) {
    const { sequence = '', id = '', sex = '', age = '', name = '' } = row;
    const cleanName = (name || '').replace(/;/g, ',');
    return `${sequence};${id};${sex};${age};${cleanName}`;
  },

  downloadFile(content, filename, mimeType = 'text/csv;charset=utf-8;') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },

  showStatus(element, message, type = 'info') {
    if (!element) return;
    const icons = { info: 'check-circle', error: 'exclamation-circle', success: 'check-circle' };
    element.innerHTML = `<div class="status-message status-${type}"><i class="fas fa-${icons[type]}"></i> ${message}</div>`;
  }
};

// ============================================================================
// PDF PROCESSOR
// ============================================================================
class PDFProcessor {
  constructor(outputElement) {
    this.outputElement = outputElement;
  }

  async process(file) {
    const url = URL.createObjectURL(file);
    const pdf = await pdfjsLib.getDocument(url).promise;
    const worker = await Tesseract.createWorker(Constants.CONFIG.OCR_LANGUAGE);
    let allText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      this.updateProgress(i, pdf.numPages);
      const pageText = await this.processPage(pdf, i, worker);
      allText += `\n\n--- Página ${i} ---\n\n` + pageText;
    }

    await worker.terminate();
    return allText;
  }

  async processPage(pdf, pageNumber, worker) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: Constants.CONFIG.OCR_SCALE });
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const { data: { text } } = await worker.recognize(canvas.toDataURL('image/png'));
    return text;
  }

  updateProgress(pageNumber, totalPages) {
    const percent = Math.round((pageNumber / totalPages) * 100);
    const loader = this.outputElement.querySelector('.loader-container');
    const html = `
      <div class="container">
        <div class="loader-container">
          <i class="fas fa-file-pdf loader-icon"></i>
          <div class="loader-title">Processando página ${pageNumber} de ${totalPages}</div>
          <div class="loader-subtitle">Extraindo dados da tabela...</div>
          <div class="progress-container">
            <div class="progress-bar-wrapper"><div class="progress-bar" style="width: ${percent}%"></div></div>
            <div class="progress-text">${percent}% concluído</div>
          </div>
        </div>
      </div>`;
    
    if (loader) {
      loader.querySelector('.loader-title').textContent = `Processando página ${pageNumber} de ${totalPages}`;
      loader.querySelector('.progress-bar').style.width = `${percent}%`;
      loader.querySelector('.progress-text').textContent = `${percent}% concluído`;
    } else {
      this.outputElement.innerHTML = html;
    }
  }

  showInitialLoader() {
    this.outputElement.innerHTML = `
      <div class="container">
        <div class="loader-container">
          <i class="fas fa-file-pdf loader-icon"></i>
          <div class="loader-title">Processando PDF com OCR...</div>
          <div class="loader-subtitle">Isso pode levar alguns segundos. Por favor, aguarde.</div>
          <div class="progress-container">
            <div class="progress-bar-wrapper"><div class="progress-bar" style="width: 0%"></div></div>
            <div class="progress-text">0% concluído</div>
          </div>
        </div>
      </div>`;
  }
}

// ============================================================================
// DATA EXTRACTOR
// ============================================================================
class DataExtractor {
  splitMultipleRecords(line) {
    const pattern = /(?:^|\s)(\d{1,3}\s+\d+\.\d+\.\d+)/g;
    const matches = [];
    let match;
    
    while ((match = pattern.exec(line)) !== null) {
      matches.push({ index: match.index === 0 ? 0 : match.index + 1 });
    }
    
    if (matches.length > 1) {
      const records = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i < matches.length - 1 ? matches[i + 1].index : line.length;
        const text = line.substring(start, end).trim();
        if (text) records.push(text);
      }
      return records;
    }
    return [line];
  }

  extractFromLine(line) {
    // Clean any remaining OCR errors: remove letters that appear after numbers before pipe
    // (This is a fallback - most should be fixed in fixOCRErrors)
    let cleanedLine = line.replace(/(\d+(?:\.\d+){0,2})([A-Za-z])(\s*\|)/g, '$1$3');
    
    // Consolidated patterns - try most specific first
    // ID pattern: digits with dots, stops at letter or pipe (OCR errors like "1M" are handled in extractLastNDigits)
    const patterns = [
      // Empty pipe before sex: | |F| | age name
      /^(\d+)\s+(\d+(?:\.\d+){0,2})\s*\|\s*\|([WN]?[MF]|N)\|\s*(?:\|\s+)?(\d+)\s+(.+)$/,
      // Empty pipe before sex: | |F| | age
      /^(\d+)\s+(\d+(?:\.\d+){0,2})\s*\|\s*\|([WN]?[MF]|N)\|\s*(?:\|\s+)?(\d+)$/,
      // Empty pipe before sex: | |F|
      /^(\d+)\s+(\d+(?:\.\d+){0,2})\s*\|\s*\|([WN]?[MF]|N)\|\s*$/,
      // Normal pipe sex: |F| | age name
      /^(\d+)\s+(\d+(?:\.\d+){0,2})\s*\|([WN]?[MF]|N)\|\s*\|?\s*(\d+)\s+(.+)$/,
      // Normal pipe sex: |F| | age
      /^(\d+)\s+(\d+(?:\.\d+){0,2})\s*\|([WN]?[MF]|N)\|\s*\|?\s*(\d+)$/,
      // Normal pipe sex: |F|
      /^(\d+)\s+(\d+(?:\.\d+){0,2})\s*\|([WN]?[MF]|N)\|\s*$/,
      // Generic: sequence ID sex age name (ID stops at pipe or space before letter)
      /^(\d+)\s+(\d+(?:\.\d+){0,2})\s*\|?\s*([WN]?[MF]|N)?\s*\|?\s*(\d+)?\s*(.+)?$/,
      // Without age: sequence ID sex name
      /^(\d+)\s+(\d+(?:\.\d+){0,2})\s*\|?\s*([WN]?[MF]|N)\s+(.+)$/,
      // Simple: sequence ID
      /^(\d+)\s+(\d+(?:\.\d+){0,2})/
    ];

    for (const pattern of patterns) {
      const match = cleanedLine.match(pattern);
      if (match) {
        return {
          sequence: match[1] || '',
          id: Utils.extractLastNDigits(match[2]),
          sex: match[3] || '',
          age: match[4] || '',
          name: (match[5] || '').trim(),
          rawLine: line
        };
      }
    }
    return null;
  }

  extract(text) {
    const normalized = Utils.normalizeRecordLines(Utils.fixOCRErrors(text));
    const results = [];
    const standardLines = [];

    for (const line of normalized) {
      for (const splitLine of this.splitMultipleRecords(line)) {
        const rowData = this.extractFromLine(splitLine);
        
        if (rowData) {
          results.push(rowData);
          standardLines.push(Utils.toStandardFormat(rowData));
        } else if (splitLine && (/\d/.test(splitLine) || /[A-ZÁÉÍÓÚÇ]/.test(splitLine))) {
          results.push({ sequence: '', id: '', sex: '', age: '', name: '', rawLine: splitLine });
          standardLines.push(`;;;${splitLine}`);
        }
      }
    }

    return { rows: results, standardLines };
  }
}

// ============================================================================
// TABLE RENDERER
// ============================================================================
class TableRenderer {
  constructor(outputElement) {
    this.outputElement = outputElement;
  }

  render(data, rawText) {
    if (!data?.rows?.length) {
      this.outputElement.innerHTML = `
        <div class="container">
          <div style="text-align: center; padding: 40px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3em; color: var(--warning); margin-bottom: 20px;"></i>
            <p style="font-size: 18px; color: var(--text-primary); font-weight: 600; margin-bottom: 10px;">${Constants.UI_MESSAGES.NO_DATA}</p>
            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 30px;">Texto bruto extraído do PDF:</p>
            <div class="raw-text">${rawText}</div>
          </div>
        </div>`;
      return;
    }

    this.outputElement.innerHTML = this.buildTableHTML(data.rows, rawText, data.standardLines);
    window.extractedData = data;
    this.setupEditableCells();
  }

  buildTableHTML(rows, rawText, standardLines) {
    return `
      <div class="container">
        <div class="tabs">
          <div class="tab active" onclick="showTab('table', this)"><i class="fas fa-table"></i> Tabela de Dados (${rows.length})</div>
          <div class="tab" onclick="showTab('standard', this)"><i class="fas fa-code"></i> Formato Padronizado (${standardLines?.length || 0})</div>
          <div class="tab" onclick="showTab('raw', this)"><i class="fas fa-file-alt"></i> Texto Bruto</div>
        </div>
        <div id="table-tab" class="tab-content active">
          <div class="info-badge"><i class="fas fa-edit"></i> Clique em qualquer célula (exceto #) para editar os dados</div>
          <div style="overflow-x: auto;">
            <table id="dataTable">
              <thead><tr>${Constants.CSV_COLUMNS.HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead>
              <tbody>${rows.map((item, i) => this.buildTableRow(item, i)).join('')}</tbody>
            </table>
          </div>
        </div>
        <div id="standard-tab" class="tab-content">
          <div class="info-badge"><i class="fas fa-info-circle"></i> Dados no formato padronizado: #;id;sexo;idade;nome</div>
          <div class="unified-lines-container">${this.buildStandardLines(standardLines || [])}</div>
        </div>
        <div id="raw-tab" class="tab-content"><div class="raw-text">${rawText}</div></div>
      </div>`;
  }

  buildStandardLines(standardLines) {
    if (!standardLines?.length) return '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">Nenhum dado padronizado disponível</p>';
    return standardLines.map((line, i) => `<div class="unified-line" data-index="${i}">${this.escapeHtml(line)}</div>`).join('');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  buildTableRow(item, index) {
    const fields = ['id', 'sex', 'age', 'name'];
    const cells = fields.map(field => {
      const value = item[field] || '';
      return `<td class="editable${value ? '' : ' na-value'}" contenteditable="true" data-field="${field}" data-index="${index}">${value}</td>`;
    });
    return `<tr><td>${item.sequence || ''}</td>${cells.join('')}</tr>`;
  }

  setupEditableCells() {
    document.querySelectorAll('td.editable[contenteditable="true"]').forEach(cell => {
      cell.addEventListener('focus', function() { this.dataset.originalValue = this.textContent.trim(); });
      cell.addEventListener('blur', function() {
        const field = this.dataset.field;
        const index = parseInt(this.dataset.index);
        const newValue = this.textContent.trim();

        if (window.extractedData?.rows?.[index]) {
          window.extractedData.rows[index][field] = newValue;
          this.classList.toggle('na-value', !newValue);
          
          if (window.extractedData.standardLines) {
            window.extractedData.standardLines[index] = Utils.toStandardFormat(window.extractedData.rows[index]);
            const standardTab = document.getElementById('standard-tab');
            if (standardTab?.classList.contains('active')) {
              const lineEl = standardTab.querySelector(`[data-index="${index}"]`);
              if (lineEl) lineEl.textContent = window.extractedData.standardLines[index];
            }
          }
        }
      });
      cell.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); this.blur(); } });
    });
  }
}

// ============================================================================
// CSV PROCESSOR
// ============================================================================
class CSVProcessor {
  constructor() {
    this.extractedDataMap = {};
  }

  setExtractedData(data) {
    this.extractedDataMap = {};
    (data?.rows || []).forEach(row => {
      const id = String(row.id || '').trim();
      if (id) this.extractedDataMap[id] = { name: row.name || '', sex: row.sex || '', age: row.age || '' };
    });
  }

  parse(csvText) {
    const lines = csvText.split('\n').filter(l => l.trim());
    if (!lines.length) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length) rows.push(values);
    }

    return { headers, rows };
  }

  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else current += char;
    }
    values.push(current.trim());
    return values;
  }

  convertToCSV(headers, rows) {
    const escape = (v) => {
      if (v == null) return '';
      const str = String(v);
      return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    return headers.map(escape).join(',') + '\n' + rows.map(row => row.map(escape).join(',')).join('\n');
  }

  fillCSVWithData(headers, rows) {
    const idIdx = headers.findIndex(h => Constants.CSV_COLUMNS.ID_NAMES.includes(h));
    if (idIdx === -1) return null;

    const nameIdx = headers.findIndex(h => h.toLowerCase().includes('nome'));
    const sexIdx = headers.findIndex(h => h.toLowerCase().includes('sexo'));
    const ageIdx = headers.findIndex(h => h.toLowerCase().includes('idade'));

    let filledCount = 0;

    rows.forEach(row => {
      if (row.length <= idIdx) return;
      const csvId = String(row[idIdx] || '').trim();
      const idLast5 = csvId.length >= Constants.CONFIG.ID_DIGITS ? csvId.slice(-Constants.CONFIG.ID_DIGITS) : csvId;
      const data = this.extractedDataMap[idLast5];
      if (!data) return;

      filledCount += this.fillColumn(row, nameIdx, data.name);
      filledCount += this.fillColumn(row, sexIdx, data.sex);
      filledCount += this.fillColumn(row, ageIdx, data.age);
    });

    return { headers, rows, filledCount };
  }

  fillColumn(row, colIdx, value) {
    if (colIdx === -1 || !value) return 0;
    while (row.length <= colIdx) row.push('');
    if (!row[colIdx]?.trim()) { row[colIdx] = value; return 1; }
    return 0;
  }

  generateDownloadCSV(data) {
    if (!data?.rows) return '';
    const headers = Constants.CSV_COLUMNS.HEADERS;
    const rows = data.rows.map(item => [item.sequence || '', item.id || '', item.sex || '', item.age || '', (item.name || '').replace(/,/g, ';')]);
    return this.convertToCSV(headers, rows);
  }
}

// ============================================================================
// UI MANAGER
// ============================================================================
class UIManager {
  constructor() {
    this.csvProcessor = new CSVProcessor();
    this.setupEventListeners();
  }

  setupEventListeners() {
    const csvFile = document.getElementById('csvFile');
    const pdfFile = document.getElementById('pdfFile');
    if (csvFile) csvFile.addEventListener('change', (e) => this.handleCSVFileSelection(e.target.files[0]));
    if (pdfFile) pdfFile.addEventListener('change', (e) => this.handlePDFFileSelection(e.target.files[0]));
  }

  handleCSVFileSelection(file) {
    const btn = document.getElementById('processCSVBtn');
    const status = document.getElementById('csvStatus');
    if (file) {
      btn.disabled = false;
      Utils.showStatus(status, `${Constants.UI_MESSAGES.CSV_SELECTED}: <strong>${file.name}</strong>`, 'info');
    } else {
      btn.disabled = true;
      if (status) status.innerHTML = '';
    }
  }

  async handlePDFFileSelection(file) {
    const status = document.getElementById('pdfStatus');
    if (!file) { if (status) status.innerHTML = ''; return; }
    
    Utils.showStatus(status, `Arquivo selecionado: <strong>${file.name}</strong>`, 'info');

    const output = document.getElementById('output');
    const processor = new PDFProcessor(output);
    const extractor = new DataExtractor();
    const renderer = new TableRenderer(output);

    processor.showInitialLoader();

    try {
      const allText = await processor.process(file);
      const extractedData = extractor.extract(allText);
      this.csvProcessor.setExtractedData(extractedData);
      renderer.render(extractedData, allText);
    } catch (error) {
      console.error('Error processing PDF:', error);
      Utils.showStatus(output, `Erro ao processar PDF: ${error.message}`, 'error');
    }
  }

  processCSV() {
    const csvFile = document.getElementById('csvFile');
    const status = document.getElementById('csvStatus');

    if (!csvFile.files?.[0]) {
      Utils.showStatus(status, Constants.UI_MESSAGES.CSV_REQUIRED, 'error');
      return;
    }

    if (!window.extractedData?.rows?.length) {
      Utils.showStatus(status, Constants.UI_MESSAGES.PDF_REQUIRED, 'error');
      return;
    }

    const file = csvFile.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parsed = this.csvProcessor.parse(e.target.result);
        const result = this.csvProcessor.fillCSVWithData(parsed.headers, parsed.rows);

        if (!result) {
          Utils.showStatus(status, Constants.UI_MESSAGES.ID_COLUMN_NOT_FOUND, 'error');
          return;
        }

        const { headers, rows, filledCount } = result;
        Utils.downloadFile(this.csvProcessor.convertToCSV(headers, rows), file.name.replace('.csv', '_preenchido.csv'));
        Utils.showStatus(status, `${Constants.UI_MESSAGES.CSV_PROCESSED} <strong>${filledCount}</strong> campos preenchidos. Arquivo baixado.`, 'success');
      } catch (error) {
        Utils.showStatus(status, `${Constants.UI_MESSAGES.CSV_ERROR} ${error.message}`, 'error');
        console.error('Error processing CSV:', error);
      }
    };

    reader.onerror = () => Utils.showStatus(status, Constants.UI_MESSAGES.CSV_READ_ERROR, 'error');
    reader.readAsText(file, 'UTF-8');
  }

  showTab(tabName, element) {
    document.querySelectorAll('.tab-content, .tab').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    if (element) element.classList.add('active');
  }

  downloadCSV() {
    if (!window.extractedData) return;
    Utils.downloadFile(this.csvProcessor.generateDownloadCSV(window.extractedData), 'dados_extraidos.csv');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const App = new UIManager();
  window.processCSV = () => App.processCSV();
  window.showTab = (tabName, element) => App.showTab(tabName, element);
  window.downloadCSV = () => App.downloadCSV();
});
