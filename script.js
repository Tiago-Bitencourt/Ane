// ============================================================================
// CONSTANTS - Single source of truth
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
// UTILITIES - Reusable helper functions
// ============================================================================
const Utils = {
  // Pre-process text to fix common OCR errors
  fixOCRErrors(text) {
    if (!text) return text;
    
    let fixed = text;
    
    // Remove ] characters (OCR artifacts)
    fixed = fixed.replace(/\]/g, '');
    
    // Remove ? characters (OCR artifacts)
    fixed = fixed.replace(/\?/g, '');
    
    // Fix sequence number with slash: "3/7" -> "37"
    fixed = fixed.replace(/^(\d+)\/(\d+)\s+(\d+\.?\d*\.?\d*)/gm, '$1$2 $3');
    
    // Fix double pipes with space: "|F| | 63" -> "|F| 63"
    fixed = fixed.replace(/\|([MFN])\|\s*\|\s*(\d+)/g, '|$1| $2');
    
    return fixed;
  },

  // Normalize text by joining all lines of each record into a single line
  normalizeRecordLines(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const normalized = [];
    let currentRecord = [];
    
    const shouldStopRecord = (line) => {
      if (/^---\s*Página/.test(line)) return true;
      if (/https?:\/\/[^\s]+/i.test(line)) return true;
      if (/^\d{2}\/\d{2}\/\d{4}/.test(line)) return true;
      // Also detect dates like 07/1711 (DD/YYYY)
      if (/^\d{2}\/\d{4}$/.test(line)) return true;
      return false;
    };
    
    const isNewRecord = (line) => {
      // Pattern: sequence number (1-3 digits) followed by ID with dots
      return /^\d{1,3}\s+\d+\.?\d*\.?\d*/.test(line);
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (shouldStopRecord(line)) {
        if (currentRecord.length > 0) {
          normalized.push(currentRecord.join(' '));
          currentRecord = [];
        }
        continue;
      }
      
      // Check if this line starts a new record
      if (isNewRecord(line)) {
        // Finalize previous record if exists
        if (currentRecord.length > 0) {
          normalized.push(currentRecord.join(' '));
        }
        currentRecord = [line];
        continue;
      }
      
      // If we have a current record, check if we should add this line to it
      if (currentRecord.length > 0) {
        // Check if previous line ends with |F|, |M|, |N|, | |F|, | |M|, or | |N| and current line is just a number (age)
        const prevLine = currentRecord[currentRecord.length - 1] || '';
        if ((/\|[MFN]\|\s*$/.test(prevLine) || /\|\s*\|[MFN]\|\s*$/.test(prevLine)) && /^\d+$/.test(line.trim())) {
          currentRecord.push(`| ${line.trim()}`);
          continue;
        }
        
        // If this line looks like a new record, finalize current and start new
        if (isNewRecord(line)) {
          normalized.push(currentRecord.join(' '));
          currentRecord = [line];
          continue;
        }
        
        // Check if this is a date that should end the record
        if (shouldStopRecord(line)) {
          normalized.push(currentRecord.join(' '));
          currentRecord = [];
          continue;
        }
        
        // Add line to current record
        currentRecord.push(line);
      } else {
        // No current record, start one if line looks like a record start
        if (/^\d+/.test(line) && !shouldStopRecord(line)) {
          currentRecord = [line];
        }
      }
    }
    
    if (currentRecord.length > 0) {
      normalized.push(currentRecord.join(' '));
    }
    
    return normalized;
  },

  extractLastNDigits(value, n = Constants.CONFIG.ID_DIGITS) {
    const cleaned = String(value || '').replace(/[.\s/,]/g, '');
    return cleaned.length >= n ? cleaned.slice(-n) : cleaned;
  },

  // Convert row data to standardized format: #;id;sexo;;| idade nome
  toStandardFormat(row) {
    const seq = row.sequence || '';
    const id = row.id || '';
    const sex = row.sex || '';
    const age = row.age || '';
    const name = (row.name || '').replace(/;/g, ',');
    
    // Format: sequência;id;sexo;;| idade nome
    // When age and name exist, they go after the pipe
    if (age && name) {
      return `${seq};${id};${sex};;| ${age} ${name}`;
    }
    // Fallback to standard format if age or name is missing
    return `${seq};${id};${sex};${age};${name}`;
  },

  downloadFile(content, filename, mimeType = 'text/csv;charset=utf-8;') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
};

// ============================================================================
// PDF PROCESSOR - Single Responsibility: Process PDF files
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

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      this.updateProgress(pageNumber, pdf.numPages);
      const pageText = await this.processPage(pdf, pageNumber, worker);
      allText += `\n\n--- Página ${pageNumber} ---\n\n` + pageText;
    }

    await worker.terminate();
    return allText;
  }

  async processPage(pdf, pageNumber, worker) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: Constants.CONFIG.OCR_SCALE });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    const imageData = canvas.toDataURL('image/png');
    const { data: { text } } = await worker.recognize(imageData);

    return text;
  }

  updateProgress(pageNumber, totalPages) {
    const progressPercent = Math.round((pageNumber / totalPages) * 100);
    const existingLoader = this.outputElement.querySelector('.loader-container');
    if (existingLoader) {
      const titleElement = existingLoader.querySelector('.loader-title');
      const subtitleElement = existingLoader.querySelector('.loader-subtitle');
      const progressBar = existingLoader.querySelector('.progress-bar');
      const progressText = existingLoader.querySelector('.progress-text');
      if (titleElement) titleElement.textContent = `Processando página ${pageNumber} de ${totalPages}`;
      if (subtitleElement) subtitleElement.textContent = 'Extraindo dados da tabela...';
      if (progressBar) progressBar.style.width = `${progressPercent}%`;
      if (progressText) progressText.textContent = `${progressPercent}% concluído`;
    } else {
      this.outputElement.innerHTML = `
        <div class="container">
          <div class="loader-container">
            <i class="fas fa-file-pdf loader-icon"></i>
            <div class="loader-title">Processando página ${pageNumber} de ${totalPages}</div>
            <div class="loader-subtitle">Extraindo dados da tabela...</div>
            <div class="progress-container">
              <div class="progress-bar-wrapper">
                <div class="progress-bar" style="width: ${progressPercent}%"></div>
              </div>
              <div class="progress-text">${progressPercent}% concluído</div>
            </div>
          </div>
        </div>
      `;
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
            <div class="progress-bar-wrapper">
              <div class="progress-bar" style="width: 0%"></div>
            </div>
            <div class="progress-text">0% concluído</div>
          </div>
        </div>
      </div>
    `;
  }
}

// ============================================================================
// DATA EXTRACTOR - Single Responsibility: Extract structured data from text
// ============================================================================
class DataExtractor {
  // Split line if it contains multiple records
  splitMultipleRecords(line) {
    // Pattern to find record starts: sequence number (1-3 digits) followed by space and ID with dots
    // More specific: look for pattern like "8 25.079.883" or "9 25.079.885"
    // This pattern appears at start of line or after a space, and the ID has dots
    const recordPattern = /(?:^|\s)(\d{1,3}\s+\d+\.\d+\.\d+)/g;
    const matches = [];
    let match;
    
    while ((match = recordPattern.exec(line)) !== null) {
      // Calculate actual start index (accounting for optional leading space)
      const actualIndex = match.index === 0 ? 0 : match.index + 1;
      matches.push({
        index: actualIndex,
        text: match[1]
      });
    }
    
    // If we found multiple record starts, split the line
    if (matches.length > 1) {
      const records = [];
      for (let i = 0; i < matches.length; i++) {
        const startIndex = matches[i].index;
        const endIndex = i < matches.length - 1 ? matches[i + 1].index : line.length;
        const recordText = line.substring(startIndex, endIndex).trim();
        if (recordText) {
          records.push(recordText);
        }
      }
      return records;
    }
    
    // If no multiple records found, return original line as single-item array
    return [line];
  }

  extract(text) {
    const fixedText = Utils.fixOCRErrors(text);
    const normalizedLines = Utils.normalizeRecordLines(fixedText);
    
    const results = [];
    const standardLines = [];
    
    for (const line of normalizedLines) {
      // Check if line contains multiple records and split them
      const splitLines = this.splitMultipleRecords(line);
      
      for (const splitLine of splitLines) {
        const rowData = this.extractFromLine(splitLine);
        
        if (!rowData) {
          if (splitLine && (/\d/.test(splitLine) || /[A-ZÁÉÍÓÚÇ]/.test(splitLine))) {
            results.push({
              sequence: '',
              id: '',
              sex: '',
              age: '',
              name: '',
              rawLine: splitLine
            });
            standardLines.push(`;;;${splitLine}`);
          }
          continue;
        }
        
        results.push(rowData);
        standardLines.push(Utils.toStandardFormat(rowData));
      }
    }

    return { 
      rows: results,
      standardLines: standardLines
    };
  }

  extractFromLine(line) {
    // Pattern: sequence ID| |sex| | age name (with empty pipe before sex, like | |F|)
    // More flexible: handles | |F| | 45 or | |F| 45
    const emptyPipeSexPattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|\s*\|([WN]?[MF]|N)\|\s*(?:\|\s+)?(\d+)\s+(.+)$/;
    const emptyPipeMatch = line.match(emptyPipeSexPattern);
    
    if (emptyPipeMatch) {
      return {
        sequence: emptyPipeMatch[1] || '',
        id: Utils.extractLastNDigits(emptyPipeMatch[2]),
        sex: emptyPipeMatch[3] || '',
        age: emptyPipeMatch[4] || '',
        name: (emptyPipeMatch[5] || '').trim(),
        rawLine: line
      };
    }
    
    // Pattern: sequence ID| |sex| | age (with empty pipe before sex, age but no name)
    const emptyPipeSexAgePattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|\s*\|([WN]?[MF]|N)\|\s*(?:\|\s+)?(\d+)$/;
    const emptyPipeAgeMatch = line.match(emptyPipeSexAgePattern);
    
    if (emptyPipeAgeMatch) {
      return {
        sequence: emptyPipeAgeMatch[1] || '',
        id: Utils.extractLastNDigits(emptyPipeAgeMatch[2]),
        sex: emptyPipeAgeMatch[3] || '',
        age: emptyPipeAgeMatch[4] || '',
        name: '',
        rawLine: line
      };
    }
    
    // Pattern: sequence ID| |sex| (with empty pipe before sex, no age or name)
    const emptyPipeSexOnlyPattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|\s*\|([WN]?[MF]|N)\|\s*$/;
    const emptyPipeSexOnlyMatch = line.match(emptyPipeSexOnlyPattern);
    
    if (emptyPipeSexOnlyMatch) {
      return {
        sequence: emptyPipeSexOnlyMatch[1] || '',
        id: Utils.extractLastNDigits(emptyPipeSexOnlyMatch[2]),
        sex: emptyPipeSexOnlyMatch[3] || '',
        age: '',
        name: '',
        rawLine: line
      };
    }
    
    // Pattern: sequence ID|sex| | age name (with pipes around sex and optional pipe before age)
    // More flexible pattern to handle various spacing
    const pipeSexPattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|([WN]?[MF]|N)\|\s*\|?\s*(\d+)\s+(.+)$/;
    const pipeMatch = line.match(pipeSexPattern);
    
    if (pipeMatch) {
      return {
        sequence: pipeMatch[1] || '',
        id: Utils.extractLastNDigits(pipeMatch[2]),
        sex: pipeMatch[3] || '',
        age: pipeMatch[4] || '',
        name: (pipeMatch[5] || '').trim(),
        rawLine: line
      };
    }
    
    // Pattern: sequence ID|sex| age (with pipes around sex, age but no name)
    const pipeSexAgePattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|([WN]?[MF]|N)\|\s*\|?\s*(\d+)$/;
    const pipeAgeMatch = line.match(pipeSexAgePattern);
    
    if (pipeAgeMatch) {
      return {
        sequence: pipeAgeMatch[1] || '',
        id: Utils.extractLastNDigits(pipeAgeMatch[2]),
        sex: pipeAgeMatch[3] || '',
        age: pipeAgeMatch[4] || '',
        name: '',
        rawLine: line
      };
    }
    
    // Pattern: sequence ID|sex| (with pipes around sex, no age or name)
    const pipeSexOnlyPattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|([WN]?[MF]|N)\|\s*$/;
    const pipeSexOnlyMatch = line.match(pipeSexOnlyPattern);
    
    if (pipeSexOnlyMatch) {
      return {
        sequence: pipeSexOnlyMatch[1] || '',
        id: Utils.extractLastNDigits(pipeSexOnlyMatch[2]),
        sex: pipeSexOnlyMatch[3] || '',
        age: '',
        name: '',
        rawLine: line
      };
    }
    
    // Pattern: sequence ID|sex|age name
    const fullPattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|?\s*([WN]?[MF]|N)?\s*\|?\s*(\d+)?\s*(.+)?$/;
    const match = line.match(fullPattern);
    
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
    
    // Try pattern without age: sequence ID|sex name
    const noAgePattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|?\s*([WN]?[MF]|N)\s+(.+)$/;
    const matchNoAge = line.match(noAgePattern);
    
    if (matchNoAge) {
      return {
        sequence: matchNoAge[1] || '',
        id: Utils.extractLastNDigits(matchNoAge[2]),
        sex: matchNoAge[3] || '',
        age: '',
        name: (matchNoAge[4] || '').trim(),
        rawLine: line
      };
    }
    
    // Try simple pattern: sequence ID
    const simplePattern = /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)/;
    const simpleMatch = line.match(simplePattern);
    
    if (simpleMatch) {
      return {
        sequence: simpleMatch[1] || '',
        id: Utils.extractLastNDigits(simpleMatch[2]),
        sex: '',
        age: '',
        name: '',
        rawLine: line
      };
    }
    
    return null;
  }
}

// ============================================================================
// TABLE RENDERER - Single Responsibility: Render UI components
// ============================================================================
class TableRenderer {
  constructor(outputElement) {
    this.outputElement = outputElement;
  }

  render(data, rawText) {
    if (!data?.rows?.length) {
      this.renderEmptyState(rawText);
      return;
    }

    this.outputElement.innerHTML = this.buildTableHTML(data.rows, rawText, data.standardLines);
    window.extractedData = data;
    this.setupEditableCells();
  }

  renderEmptyState(rawText) {
    this.outputElement.innerHTML = `
      <div class="container">
        <div style="text-align: center; padding: 40px;">
          <i class="fas fa-exclamation-triangle" style="font-size: 3em; color: var(--warning); margin-bottom: 20px;"></i>
          <p style="font-size: 18px; color: var(--text-primary); font-weight: 600; margin-bottom: 10px;">${Constants.UI_MESSAGES.NO_DATA}</p>
          <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 30px;">Texto bruto extraído do PDF:</p>
          <div class="raw-text">${rawText}</div>
        </div>
      </div>
    `;
  }

  buildTableHTML(rows, rawText, standardLines) {
    return `
      <div class="container">
        <div class="tabs">
          <div class="tab active" onclick="showTab('table', this)">
            <i class="fas fa-table"></i>
            Tabela de Dados (${rows.length})
          </div>
          <div class="tab" onclick="showTab('standard', this)">
            <i class="fas fa-code"></i>
            Formato Padronizado (${standardLines?.length || 0})
          </div>
          <div class="tab" onclick="showTab('raw', this)">
            <i class="fas fa-file-alt"></i>
            Texto Bruto
          </div>
        </div>
        
        <div id="table-tab" class="tab-content active">
          <div class="info-badge">
            <i class="fas fa-edit"></i>
            Clique em qualquer célula (exceto #) para editar os dados
          </div>
          <div style="overflow-x: auto;">
            <table id="dataTable">
              <thead>${this.buildHeaderRow()}</thead>
              <tbody>${this.buildTableRows(rows)}</tbody>
            </table>
          </div>
        </div>
        
        <div id="standard-tab" class="tab-content">
          <div class="info-badge">
            <i class="fas fa-info-circle"></i>
            Dados no formato padronizado: #;id;sexo;idade;nome
          </div>
          <div class="unified-lines-container">
            ${this.buildStandardLines(standardLines || [])}
          </div>
        </div>
        
        <div id="raw-tab" class="tab-content">
          <div class="raw-text">${rawText}</div>
        </div>
      </div>
    `;
  }

  buildStandardLines(standardLines) {
    if (!standardLines || standardLines.length === 0) {
      return '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">Nenhum dado padronizado disponível</p>';
    }
    
    return standardLines.map((line, index) => 
      `<div class="unified-line" data-index="${index}">${this.escapeHtml(line)}</div>`
    ).join('');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  buildHeaderRow() {
    return '<tr>' + Constants.CSV_COLUMNS.HEADERS.map(h => `<th>${h}</th>`).join('') + '</tr>';
  }

  buildTableRows(rows) {
    return rows.map((item, index) => this.buildTableRow(item, index)).join('');
  }

  buildTableRow(item, index) {
    const fields = ['id', 'sex', 'age', 'name'];
    const cells = fields.map(field => this.buildEditableCell(item, field, index));

    return `<tr><td>${item.sequence || ''}</td>${cells.join('')}</tr>`;
  }

  buildEditableCell(item, field, index) {
    const value = item[field] || '';
    const isEmpty = value === '';
    const naClass = isEmpty ? ' na-value' : '';

    return `<td class="editable${naClass}" contenteditable="true" data-field="${field}" data-index="${index}">${value}</td>`;
  }

  setupEditableCells() {
    document.querySelectorAll('td.editable[contenteditable="true"]').forEach(cell => {
      cell.addEventListener('focus', function () {
        this.dataset.originalValue = this.textContent.trim();
      });

      cell.addEventListener('blur', function () {
        const field = this.dataset.field;
        const index = parseInt(this.dataset.index);
        const newValue = this.textContent.trim();

        if (window.extractedData?.rows?.[index]) {
          window.extractedData.rows[index][field] = newValue;
          this.classList.toggle('na-value', newValue === '');
          
          // Update standard format
          if (window.extractedData.standardLines) {
            window.extractedData.standardLines[index] = Utils.toStandardFormat(window.extractedData.rows[index]);
            // Update display if on standard tab
            const standardTab = document.getElementById('standard-tab');
            if (standardTab && standardTab.classList.contains('active')) {
              const lineElement = standardTab.querySelector(`[data-index="${index}"]`);
              if (lineElement) {
                lineElement.textContent = window.extractedData.standardLines[index];
              }
            }
          }
        }
      });

      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.blur();
        }
      });
    });
  }
}

// ============================================================================
// CSV PROCESSOR - Single Responsibility: Process CSV files
// ============================================================================
class CSVProcessor {
  constructor() {
    this.extractedDataMap = {};
  }

  setExtractedData(data) {
    this.extractedDataMap = {};
    (data?.rows || []).forEach(row => {
      const id = String(row.id || '').trim();
      if (id) {
        this.extractedDataMap[id] = {
          name: row.name || '',
          sex: row.sex || '',
          age: row.age || ''
        };
      }
    });
  }

  parse(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length > 0) rows.push(values);
    }

    return { headers, rows };
  }

  parseCSVLine(line) {
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    return values;
  }

  convertToCSV(headers, rows) {
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    return headers.map(escapeCSV).join(',') + '\n' +
      rows.map(row => row.map(escapeCSV).join(',')).join('\n');
  }

  findColumnIndex(headers, possibleNames) {
    return headers.findIndex(h => possibleNames.includes(h));
  }

  fillCSVWithData(headers, rows) {
    const idColumnIndex = this.findColumnIndex(headers, Constants.CSV_COLUMNS.ID_NAMES);
    if (idColumnIndex === -1) return null;

    const nameColumnIndex = headers.findIndex(h => h.toLowerCase().includes('nome'));
    const sexColumnIndex = headers.findIndex(h => h.toLowerCase().includes('sexo'));
    const ageColumnIndex = headers.findIndex(h => h.toLowerCase().includes('idade'));

    let filledCount = 0;

    rows.forEach(row => {
      if (row.length <= idColumnIndex) return;

      const csvId = String(row[idColumnIndex] || '').trim();
      const idLast5 = csvId.length >= Constants.CONFIG.ID_DIGITS
        ? csvId.slice(-Constants.CONFIG.ID_DIGITS)
        : csvId;

      const data = this.extractedDataMap[idLast5];
      if (!data) return;

      filledCount += this.fillColumn(row, nameColumnIndex, data.name);
      filledCount += this.fillColumn(row, sexColumnIndex, data.sex);
      filledCount += this.fillColumn(row, ageColumnIndex, data.age);
    });

    return { headers, rows, filledCount };
  }

  fillColumn(row, columnIndex, value) {
    if (columnIndex === -1 || !value) return 0;

    while (row.length <= columnIndex) {
      row.push('');
    }

    if (!row[columnIndex] || row[columnIndex].trim() === '') {
      row[columnIndex] = value;
      return 1;
    }

    return 0;
  }

  generateDownloadCSV(data) {
    if (!data?.rows) return '';

    const headers = Constants.CSV_COLUMNS.HEADERS;
    const rows = data.rows.map(item => [
      item.sequence || '',
      item.id || '',
      item.sex || '',
      item.age || '',
      (item.name || '').replace(/,/g, ';')
    ]);

    return this.convertToCSV(headers, rows);
  }
}

// ============================================================================
// UI MANAGER - Single Responsibility: Manage UI interactions
// ============================================================================
class UIManager {
  constructor() {
    this.csvProcessor = new CSVProcessor();
    this.setupEventListeners();
  }

  setupEventListeners() {
    const csvFile = document.getElementById('csvFile');
    const pdfFile = document.getElementById('pdfFile');

    if (csvFile) {
      csvFile.addEventListener('change', (e) => {
        this.handleCSVFileSelection(e.target.files[0]);
      });
    }

    if (pdfFile) {
      pdfFile.addEventListener('change', async (e) => {
        await this.handlePDFFileSelection(e.target.files[0]);
      });
    }
  }

  handleCSVFileSelection(file) {
    const btn = document.getElementById('processCSVBtn');
    const status = document.getElementById('csvStatus');

    if (file) {
      btn.disabled = false;
      status.innerHTML = `
        <div class="status-message status-info">
          <i class="fas fa-check-circle"></i> 
          ${Constants.UI_MESSAGES.CSV_SELECTED}: <strong>${file.name}</strong>
        </div>
      `;
    } else {
      btn.disabled = true;
      status.innerHTML = '';
    }
  }

  async handlePDFFileSelection(file) {
    const status = document.getElementById('pdfStatus');
    
    if (!file) {
      if (status) status.innerHTML = '';
      return;
    }

    if (status) {
      status.innerHTML = `
        <div class="status-message status-info">
          <i class="fas fa-check-circle"></i> 
          Arquivo selecionado: <strong>${file.name}</strong>
        </div>
      `;
    }

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
      output.innerHTML = `
        <div class="container">
          <div class="status-message status-error">
            <i class="fas fa-exclamation-circle"></i>
            Erro ao processar PDF: ${error.message}
          </div>
        </div>
      `;
    }
  }

  processCSV() {
    const csvFileInput = document.getElementById('csvFile');
    const statusDiv = document.getElementById('csvStatus');

    if (!csvFileInput.files?.[0]) {
      statusDiv.innerHTML = `
        <div class="status-message status-error">
          <i class="fas fa-exclamation-circle"></i> 
          ${Constants.UI_MESSAGES.CSV_REQUIRED}
        </div>
      `;
      return;
    }

    if (!window.extractedData?.rows?.length) {
      statusDiv.innerHTML = `
        <div class="status-message status-error">
          <i class="fas fa-exclamation-circle"></i> 
          ${Constants.UI_MESSAGES.PDF_REQUIRED}
        </div>
      `;
      return;
    }

    const file = csvFileInput.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parsed = this.csvProcessor.parse(e.target.result);
        const result = this.csvProcessor.fillCSVWithData(parsed.headers, parsed.rows);

        if (!result) {
          statusDiv.innerHTML = `
            <div class="status-message status-error">
              <i class="fas fa-exclamation-circle"></i> 
              ${Constants.UI_MESSAGES.ID_COLUMN_NOT_FOUND}
            </div>
          `;
          return;
        }

        const { headers, rows, filledCount } = result;
        const updatedCSV = this.csvProcessor.convertToCSV(headers, rows);
        Utils.downloadFile(updatedCSV, file.name.replace('.csv', '_preenchido.csv'));

        statusDiv.innerHTML = `
          <div class="status-message status-success">
            <i class="fas fa-check-circle"></i> 
            ${Constants.UI_MESSAGES.CSV_PROCESSED} 
            <strong>${filledCount}</strong> campos preenchidos. Arquivo baixado.
          </div>
        `;
      } catch (error) {
        statusDiv.innerHTML = `
          <div class="status-message status-error">
            <i class="fas fa-exclamation-circle"></i> 
            ${Constants.UI_MESSAGES.CSV_ERROR} ${error.message}
          </div>
        `;
        console.error('Error processing CSV:', error);
      }
    };

    reader.onerror = () => {
      statusDiv.innerHTML = `
        <div class="status-message status-error">
          <i class="fas fa-exclamation-circle"></i> 
          ${Constants.UI_MESSAGES.CSV_READ_ERROR}
        </div>
      `;
    };

    reader.readAsText(file, 'UTF-8');
  }

  showTab(tabName, element) {
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });

    document.getElementById(`${tabName}-tab`).classList.add('active');
    if (element) element.classList.add('active');
  }

  downloadCSV() {
    if (!window.extractedData) return;
    const csv = this.csvProcessor.generateDownloadCSV(window.extractedData);
    Utils.downloadFile(csv, 'dados_extraidos.csv');
  }
}

// ============================================================================
// APP INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const App = new UIManager();

  window.processCSV = () => App.processCSV();
  window.showTab = (tabName, element) => App.showTab(tabName, element);
  window.downloadCSV = () => App.downloadCSV();
});
