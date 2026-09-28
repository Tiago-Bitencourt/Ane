// Leitura, preenchimento e escrita de CSV. Módulo puro: não depende do DOM.
(function (Ane) {
  'use strict';

  const BOM = '﻿';

  // Planilhas em pt-BR costumam exportar com ";" — escolhe o separador mais frequente no cabeçalho.
  function detectDelimiter(headerLine) {
    const count = (ch) => headerLine.split(ch).length - 1;
    return count(';') > count(',') ? ';' : ',';
  }

  function parseLine(line, delimiter) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  function parse(text) {
    const hasBom = text.startsWith(BOM);
    const lines = (hasBom ? text.slice(1) : text).split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return { headers: [], rows: [], delimiter: ',', hasBom };

    const delimiter = detectDelimiter(lines[0]);
    const [headers, ...rows] = lines.map((line) => parseLine(line, delimiter));
    return { headers, rows, delimiter, hasBom };
  }

  function stringify({ headers, rows, delimiter = ',', hasBom = false }) {
    const escape = (value) => {
      const str = value == null ? '' : String(value);
      return /["\n\r]/.test(str) || str.includes(delimiter) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [headers, ...rows].map((row) => row.map(escape).join(delimiter));
    return (hasBom ? BOM : '') + lines.join('\n');
  }

  // Índice dos registros extraídos pelos últimos dígitos do ID.
  function indexRecordsById(records) {
    const index = new Map();
    for (const record of records || []) {
      const id = String(record.id || '').trim();
      if (id) index.set(id, record);
    }
    return index;
  }

  // Preenche somente células vazias. Retorna null se não houver coluna de ID.
  function fill(csv, records) {
    const { headers, rows } = csv;
    const { ID_NAMES, NAME_KEYWORD, SEX_KEYWORD, AGE_KEYWORD } = Ane.csvColumns;

    const idIdx = headers.findIndex((h) => ID_NAMES.includes(h));
    if (idIdx === -1) return null;

    const columnWith = (keyword) => headers.findIndex((h) => h.toLowerCase().includes(keyword));
    const targets = [
      [columnWith(NAME_KEYWORD), 'name'],
      [columnWith(SEX_KEYWORD), 'sex'],
      [columnWith(AGE_KEYWORD), 'age']
    ].filter(([col]) => col !== -1);

    const index = indexRecordsById(records);
    let filledCount = 0;

    for (const row of rows) {
      if (row.length <= idIdx) continue;
      const record = index.get(Ane.parser.normalizeId(row[idIdx]));
      if (!record) continue;

      for (const [col, field] of targets) {
        const value = record[field];
        if (!value) continue;
        while (row.length <= col) row.push('');
        if (!row[col].trim()) {
          row[col] = value;
          filledCount++;
        }
      }
    }

    return { ...csv, filledCount };
  }

  Ane.csv = { parse, stringify, fill };
})(globalThis.Ane = globalThis.Ane || {});
