// Configuração e textos da interface.
(function (Ane) {
  'use strict';

  Ane.config = Object.freeze({
    OCR_LANGUAGE: 'por',
    // Escala de renderização da página antes do OCR. Valores altos melhoram a
    // leitura de PDFs escaneados, ao custo de memória e tempo.
    OCR_SCALE: 7.0,
    // Quantidade de dígitos finais do ID usada para cruzar PDF e CSV.
    ID_DIGITS: 5,
    PDFJS_WORKER_SRC: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  });

  Ane.csvColumns = Object.freeze({
    ID_NAMES: ['ID amost.', 'ID', 'Id', 'id', 'ID amostra', 'ID amostra.'],
    NAME_KEYWORD: 'nome',
    SEX_KEYWORD: 'sexo',
    AGE_KEYWORD: 'idade'
  });

  Ane.tableHeaders = Object.freeze(['#', 'ID', 'Sexo', 'Idade', 'Nome']);
  Ane.editableFields = Object.freeze(['id', 'sex', 'age', 'name']);

  Ane.messages = Object.freeze({
    NO_DATA: 'Nenhum dado extraído',
    FILE_SELECTED: 'Arquivo selecionado',
    CSV_REQUIRED: 'Por favor, selecione um arquivo CSV.',
    PDF_REQUIRED: 'Por favor, primeiro extraia os dados do PDF.',
    ID_COLUMN_NOT_FOUND: 'Erro: Coluna de ID não encontrada no CSV. Procure por "ID amost." ou "ID".',
    CSV_PROCESSED: 'CSV processado com sucesso!',
    CSV_ERROR: 'Erro ao processar CSV:',
    CSV_READ_ERROR: 'Erro ao ler o arquivo CSV.',
    PDF_ERROR: 'Erro ao processar PDF:',
    INVALID_PDF: 'Arquivo inválido: selecione um arquivo .pdf',
    INVALID_CSV: 'Arquivo inválido: selecione um arquivo .csv'
  });
})(globalThis.Ane = globalThis.Ane || {});
