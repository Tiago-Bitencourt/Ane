// Converte o texto bruto do OCR em registros { sequence, id, sex, age, name }.
// Módulo puro: não depende do DOM.
(function (Ane) {
  'use strict';

  // Erros comuns do OCR quando uma letra aparece no lugar dos últimos dígitos do ID.
  const LETTER_TO_DIGITS = { M: '44', N: '11', O: '0', I: '1' };

  function fixOCRErrors(text) {
    if (!text) return text;
    return text
      .replace(/[\]?]/g, '')
      .replace(/^(\d+)\/(\d+)\s+(\d+\.?\d*\.?\d*)/gm, '$1$2 $3')
      .replace(/\|([MFN])\|\s*\|\s*(\d+)/g, '|$1| $2')
      // "25.083.1M |" -> "25.083.144 |"; letras desconhecidas são descartadas.
      .replace(/(\d+\.\d+\.\d)([A-Z])(\s*\|)/g, (_, head, letter, tail) => head + (LETTER_TO_DIGITS[letter] || '') + tail);
  }

  const isPageBreak = (line) => /^---\s*Página|https?:\/\/|\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4}$/.test(line);
  const isRecordStart = (line) => /^\d{1,3}\s+\d+\.?\d*\.?\d*/.test(line);
  const isAgeAfterSex = (prev, curr) => /\|[MFN]\|\s*$|\|\s*\|[MFN]\|\s*$/.test(prev) && /^\d+$/.test(curr);

  // Junta as linhas quebradas pelo OCR para que cada registro fique em uma única linha.
  function joinRecordLines(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const records = [];
    let current = [];

    const flush = () => {
      if (current.length) records.push(current.join(' '));
      current = [];
    };

    for (const line of lines) {
      if (isPageBreak(line)) {
        flush();
      } else if (isRecordStart(line)) {
        flush();
        current = [line];
      } else if (current.length) {
        const prev = current[current.length - 1];
        current.push(isAgeAfterSex(prev, line) ? `| ${line}` : line);
      } else if (/^\d+/.test(line)) {
        current = [line];
      }
    }

    flush();
    return records;
  }

  // O OCR às vezes junta dois registros na mesma linha: separa-os pelo início "seq ID".
  function splitMultipleRecords(line) {
    const pattern = /(?:^|\s)(\d{1,3}\s+\d+\.\d+\.\d+)/g;
    const starts = [];
    let match;

    while ((match = pattern.exec(line)) !== null) {
      starts.push(match.index === 0 ? 0 : match.index + 1);
    }

    if (starts.length <= 1) return [line];

    return starts
      .map((start, i) => line.substring(start, starts[i + 1] ?? line.length).trim())
      .filter(Boolean);
  }

  // Do mais específico para o mais genérico. Grupos: seq, ID, sexo, idade, nome.
  const SEQ_ID = String.raw`^(\d+)\s+(\d+(?:\.\d+){0,2})`;
  const SEX = String.raw`([WN]?[MF]|N)`;
  const RECORD_PATTERNS = [
    // "| |F| | 32 NOME", "| |F| | 32", "| |F|"
    new RegExp(`${SEQ_ID}\\s*\\|\\s*\\|${SEX}\\|\\s*(?:\\|\\s+)?(\\d+)\\s+(.+)$`),
    new RegExp(`${SEQ_ID}\\s*\\|\\s*\\|${SEX}\\|\\s*(?:\\|\\s+)?(\\d+)$`),
    new RegExp(`${SEQ_ID}\\s*\\|\\s*\\|${SEX}\\|\\s*$`),
    // "|F| | 32 NOME", "|F| | 32", "|F|"
    new RegExp(`${SEQ_ID}\\s*\\|${SEX}\\|\\s*\\|?\\s*(\\d+)\\s+(.+)$`),
    new RegExp(`${SEQ_ID}\\s*\\|${SEX}\\|\\s*\\|?\\s*(\\d+)$`),
    new RegExp(`${SEQ_ID}\\s*\\|${SEX}\\|\\s*$`),
    // Genérico: todos os campos após o ID são opcionais.
    new RegExp(`${SEQ_ID}\\s*\\|?\\s*${SEX}?\\s*\\|?\\s*(\\d+)?\\s*(.+)?$`)
  ];

  // Mantém apenas os últimos N dígitos, ignorando pontuação e letras de erro de OCR.
  function normalizeId(value, digits = Ane.config.ID_DIGITS) {
    const cleaned = String(value || '').replace(/[.\s/,]/g, '').replace(/[A-Za-z]/g, '');
    return cleaned.length >= digits ? cleaned.slice(-digits) : cleaned;
  }

  function parseRecord(line) {
    // Remove letras soltas entre o número e o pipe (fallback de fixOCRErrors).
    const cleaned = line.replace(/(\d+(?:\.\d+){0,2})([A-Za-z])(\s*\|)/g, '$1$3');

    for (const pattern of RECORD_PATTERNS) {
      const match = cleaned.match(pattern);
      if (match) {
        return {
          sequence: match[1] || '',
          id: normalizeId(match[2]),
          sex: match[3] || '',
          age: match[4] || '',
          name: (match[5] || '').trim(),
          rawLine: line
        };
      }
    }
    return null;
  }

  function emptyRecord(rawLine) {
    return { sequence: '', id: '', sex: '', age: '', name: '', rawLine };
  }

  function toStandardFormat({ sequence = '', id = '', sex = '', age = '', name = '' }) {
    return [sequence, id, sex, age, (name || '').replace(/;/g, ',')].join(';');
  }

  // Linhas não reconhecidas são mantidas (vazias) para o usuário corrigir manualmente.
  function extractRecords(text) {
    const rows = [];
    const standardLines = [];

    for (const joined of joinRecordLines(fixOCRErrors(text))) {
      for (const line of splitMultipleRecords(joined)) {
        const record = parseRecord(line);
        if (record) {
          rows.push(record);
          standardLines.push(toStandardFormat(record));
        } else if (line && /[\dA-ZÁÉÍÓÚÇ]/.test(line)) {
          rows.push(emptyRecord(line));
          standardLines.push(`;;;${line}`);
        }
      }
    }

    return { rows, standardLines };
  }

  Ane.parser = {
    fixOCRErrors,
    joinRecordLines,
    splitMultipleRecords,
    parseRecord,
    normalizeId,
    toStandardFormat,
    extractRecords
  };
})(globalThis.Ane = globalThis.Ane || {});
