// ============================================================================
// CONSTANTS - Single source of truth
// ============================================================================
const Constants = {
  REGEX_PATTERNS: {
    RECORD: /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\]?\s*\|\s*([WN]?[MF]|N)\s*\]?\s*\|(\d+)?/,
    NEW_RECORD: /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\]?\s*\|\s*([WN]?[MF]|N)\s*\]?\s*\|/,
    RECORD_ID_LINE: /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|$/,
    RECORD_ID_SEX_LINE: /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|([WN]?[MF]|N)$/,
    RECORD_SEX_AGE_LINE: /^([WN]?[MF]|N)\s*\|(\d+)?$/,
    NORMALIZED_RECORD: /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|([WN]?[MF]|N)\s*\|(\d+)\s+(.+)$/,
    NORMALIZED_RECORD_NO_AGE: /^(\d+)\s+(\d+(?:[.\s/,]*\d+)*)\s*\|([WN]?[MF]|N)\s*(?:\|?\s*)?(.+)$/,
    AGE_WITH_PIPE: /^\|\s*(\d+)$/,
    AGE_WITH_PIPE_OCR_ERROR: /^1(\d{1,2})$/,
    CODE_ARTIFACT: /^[A-Z]{2,}\d+$/,
    PAGE_SEPARATOR: /^---\s*Página/,
    STANDALONE_NUMBER: /^\d+$/,
    HAS_LETTERS: /[A-Za-z]/,
    OCR_ARTIFACT: /^(ál|al|n)$/i,
    NUMBER_WITH_DOTS: /^\d+\.\d+/,
    NUMBER_WITH_SPACE: /^\d+\s+\d+/,
    URL_LINK: /https?:\/\/[^\s]+/i
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
  },
  CONFIG: {
    OCR_LANGUAGE: 'por',
    OCR_SCALE: 3.0,
    MAX_LOOKAHEAD: 30,
    BACKUP_LOOKAHEAD: 25,
    ID_DIGITS: 5
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
    
    // Fix pipe character errors: | being read as 1, l, I, or | being missing
    // Pattern: number followed by what looks like a pipe error, then sex/age
    // Fix "25.080.1701F" -> "25.080.170|F" (1 before M/F is likely a pipe)
    fixed = fixed.replace(/(\d+\.?\d*\.?\d*)([1lI])([MFN])/gi, '$1|$3');
    
    // Fix "|" being read as "1" at start of age line: "1 45" -> "| 45"
    // But only if it's followed by 1-2 digits (age) and previous line ends with | or has sex
    fixed = fixed.replace(/^1\s+(\d{1,2})$/gm, '| $1');
    
    // Fix "|" being read as "l" or "I" 
    fixed = fixed.replace(/(\d+\.?\d*\.?\d*)\s*[lI]\s*([MFN])/gi, '$1|$2');
    fixed = fixed.replace(/^[lI]\s*(\d{1,2})$/gm, '| $1');
    
    // Fix missing pipes: "25.080.170 F" -> "25.080.170|F"
    // But be careful not to break names
    fixed = fixed.replace(/(\d+\.?\d*\.?\d*)\s+([MFN])(?:\s|$)/g, '$1|$2');
    
    // Fix OCR errors: mM or Mm -> M|, / -> | (when followed by number)
    // Pattern: "mM /18" -> "M|18" or "Mm /18" -> "M|18"
    fixed = fixed.replace(/\b[mM][mM]\s*\/\s*(\d{1,2})\b/g, 'M|$1');
    fixed = fixed.replace(/\b[mM][mM]\s+(\d{1,2})\b/g, 'M|$1');
    // Fix: / read as | (when followed by number, especially after sex)
    fixed = fixed.replace(/([MFN])\s+\/\s*(\d{1,2})\b/g, '$1|$2');
    fixed = fixed.replace(/\s+\/\s*(\d{1,2})\b/g, '|$1');
    
    // Fix "0" being read as "O" in numbers (but keep O in names)
    // Only replace O in number contexts (between digits or at start/end of number sequences)
    fixed = fixed.replace(/(\d+)O(\d+)/g, '$10$2');
    fixed = fixed.replace(/^(\d+)O(\s|$)/gm, '$10$2');
    fixed = fixed.replace(/(\s)(\d+)O(\s|$)/g, '$1$20$3');
    
    // Fix "1" being read as "l" or "I" in numbers
    fixed = fixed.replace(/(\d+)[lI](\d+)/g, '$11$2');
    fixed = fixed.replace(/^(\d+)[lI](\s|$)/gm, '$11$2');
    
    // Fix "5" being read as "S" in numbers (less common but happens)
    fixed = fixed.replace(/(\d+)S(\d+)/g, '$15$2');
    
    // Fix "8" being read as "B" in numbers
    fixed = fixed.replace(/(\d+)B(\d+)/g, '$18$2');
    
    // Fix multiple spaces
    fixed = fixed.replace(/\s{2,}/g, ' ');
    
    // Fix "|" with spaces: "|  " -> "| "
    fixed = fixed.replace(/\|\s{2,}/g, '| ');
    
    // Fix trailing/leading spaces around pipes
    fixed = fixed.replace(/\s*\|\s*/g, '|');
    // But restore space after pipe if it's before a number (age)
    fixed = fixed.replace(/\|(\d+)/g, '| $1');
    // And restore space before pipe if it's after a number (ID)
    fixed = fixed.replace(/(\d)\|/g, '$1 |');
    
    // Fix common sequence number + ID patterns
    // "6  25.080170|F" -> ensure proper spacing
    fixed = fixed.replace(/^(\d+)\s{1,2}(\d+\.?\d*\.?\d*)\|/gm, '$1 $2|');
    
    return fixed;
  },

  // Normalize text by joining all lines of each record into a single line
  normalizeRecordLines(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const normalized = [];
    let currentRecord = [];
    
    // Helper function to check if line should stop record collection
    const shouldStopRecord = (line) => {
      // Page separator
      if (Constants.REGEX_PATTERNS.PAGE_SEPARATOR.test(line)) return true;
      
      // URLs
      if (Utils.isLink(line)) return true;
      
      // Table headers (contains words like "Pedido", "Hema", "RBC", etc.)
      const headerKeywords = ['pedido', 'hema', 'rbc', 'hgb', 'hct', 'vgm', 'hgm', 'chcm', 'rdw', 
                              'leucgl', 'basof', 'eos', 'próm', 'mieló', 'metami', 'bastão', 
                              'segmen', 'linfó', 'linfr', 'monóc', 'pla', 'ct-pla', 'leucgi'];
      const lowerLine = line.toLowerCase();
      // Check if line contains header keywords (but allow if it's part of a name)
      // If line has multiple header keywords, it's definitely a header
      const keywordCount = headerKeywords.filter(keyword => lowerLine.includes(keyword)).length;
      if (keywordCount >= 2) return true;
      // Also check for patterns like "cr * Pedido" or "* Pedido"
      if (/(cr\s*\*|^\s*\*)\s*pedido/i.test(line)) return true;
      
      // Dates in format "03/12/2025"
      if (/^\d{2}\/\d{2}\/\d{4}/.test(line)) return true;
      
      // "Mapa de Bancada" or similar headers
      if (/mapa\s+de\s+bancada/i.test(line)) return true;
      
      // Code artifacts (like "EQO02")
      if (Utils.isCodeArtifact(line)) return true;
      
      // OCR artifacts like "E)", "E)", single letter with punctuation
      if (/^[A-Z]\)\s*$/.test(line)) return true;
      if (/^[A-Z]\s*[\)\]\}\.]\s*$/.test(line)) return true;
      
      // Lines with many special characters that look like headers
      if (/[|#*]{2,}/.test(line)) return true;
      
      return false;
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this line should stop record collection
      if (shouldStopRecord(line)) {
        // If we have a current record, save it before stopping
        if (currentRecord.length > 0) {
          normalized.push(Utils.joinRecordLines(currentRecord));
          currentRecord = [];
        }
        // Skip this line
        continue;
      }
      
      // Check if this line starts a new record (sequence number + ID pattern)
      // Handle cases like: "3 —25.080.166|" or "3 25.080.166|" or "2  25.080165|"
      // Pattern: number, optional spaces/dashes, then number with dots (ID), optionally ending with |
      // More specific: sequence number (1-3 digits) followed by ID pattern (numbers with dots)
      const isNewRecord = /^\d{1,3}\s*[—\-]?\s*\d+\.?\d*\.?\d*\s*\|?/.test(line) &&
                         // Ensure it looks like an ID (has dots or is a long number)
                         (/\./.test(line) || /\d{5,}/.test(line));
      
      if (isNewRecord) {
        // If we have a previous record, save it
        if (currentRecord.length > 0) {
          normalized.push(Utils.joinRecordLines(currentRecord));
        }
        // Clean the line: remove special characters like "—" between sequence and ID
        let cleanedLine = line.replace(/[—\-]\s*/g, ' ');
        // Start new record
        currentRecord = [cleanedLine];
      } else if (currentRecord.length > 0) {
        // First check if this line looks like a new record (even if not at start)
        // This prevents joining two different records
        const looksLikeNewRecord = /^\d{1,3}\s*[—\-]?\s*\d+\.?\d*\.?\d*\s*\|?/.test(line) &&
                                   (/\./.test(line) || /\d{5,}/.test(line));
        
        if (looksLikeNewRecord) {
          // Save current record and start new one
          normalized.push(Utils.joinRecordLines(currentRecord));
          let cleanedLine = line.replace(/[—\-]\s*/g, ' ');
          currentRecord = [cleanedLine];
          continue;
        }
        
        // Check if this line looks like it belongs to the record
        // Stop if it looks like a header, URL, or other non-record content
        if (shouldStopRecord(line)) {
          normalized.push(Utils.joinRecordLines(currentRecord));
          currentRecord = [];
          continue;
        }
        
        // Fix OCR errors before adding to record
        let fixedLine = line;
        
        // Fix: mM or Mm -> M|, / -> | (when followed by number)
        // Pattern: "mM /18" -> "M|18"
        fixedLine = fixedLine.replace(/\b[mM][mM]\s*\/\s*(\d{1,2})\b/g, 'M|$1');
        fixedLine = fixedLine.replace(/\b[mM][mM]\s+(\d{1,2})\b/g, 'M|$1');
        // Fix: / read as | (when followed by number)
        fixedLine = fixedLine.replace(/([MFN])\s+\/\s*(\d{1,2})\b/g, '$1|$2');
        fixedLine = fixedLine.replace(/^\s*\/\s*(\d{1,2})\b/g, '|$1');
        
        // Fix: number starting with 1 followed by 1-2 digits (| read as 1)
        // Handles 2-digit: 123 -> | 23, 3-digit: 136 -> | 36, 156 -> | 56
        // Any number 100-199 should be treated as | + last 2 digits
        if (/^1\d{2}$/.test(fixedLine)) {
          const prevLine = currentRecord[currentRecord.length - 1] || '';
          // Check if previous line has pipe or ends with sex
          if (prevLine.includes('|') || /[MFN]\s*$/.test(prevLine)) {
            const ageMatch = fixedLine.match(/^1(\d{2})$/);
            if (ageMatch) {
              const age = parseInt(ageMatch[1]);
              // Any number 00-99 after the 1 is valid (100-199 range)
              if (age >= 0 && age <= 99) {
                fixedLine = `| ${ageMatch[1]}`;
              }
            }
          }
        } else if (/^1\d{1}$/.test(fixedLine)) {
          // Handle 2-digit numbers like 12, 13, etc. (should be | 2, | 3)
          const prevLine = currentRecord[currentRecord.length - 1] || '';
          if (prevLine.includes('|') || /[MFN]\s*$/.test(prevLine)) {
            const ageMatch = fixedLine.match(/^1(\d{1})$/);
            if (ageMatch) {
              const age = parseInt(ageMatch[1]);
              if (age >= 0 && age <= 9) {
                fixedLine = `| ${ageMatch[1]}`;
              }
            }
          }
        } else if (/^\d{2}$/.test(fixedLine)) {
          // Handle normal 2-digit numbers (45, 74, 36, 56) when they appear on separate lines
          // These are likely ages that should have a pipe before them
          const prevLine = currentRecord[currentRecord.length - 1] || '';
          if (prevLine.includes('|') || /[MFN]\s*$/.test(prevLine)) {
            const ageNum = parseInt(fixedLine);
            // Validate it's a reasonable age (1-99) and not starting with 1 (already handled above)
            if (ageNum >= 1 && ageNum <= 99 && !fixedLine.startsWith('1')) {
              fixedLine = `| ${fixedLine}`;
            }
          }
        }
        
        // Fix: OCR artifacts like "E)" or "E)" that might be "| age"
        // Pattern: single letter (E, I, l) followed by ) or ) and then number
        if (/^[EeIiLl]\)\s*(\d{1,2})$/.test(fixedLine)) {
          const ageMatch = fixedLine.match(/^[EeIiLl]\)\s*(\d{1,2})$/);
          if (ageMatch) {
            const age = parseInt(ageMatch[1]);
            if (age >= 1 && age <= 99) {
              const prevLine = currentRecord[currentRecord.length - 1] || '';
              // If previous line has sex, this is probably the age
              if (prevLine.includes('|') || /[MFN]\s*$/.test(prevLine)) {
                fixedLine = `| ${ageMatch[1]}`;
              }
            }
          }
        }
        
        // If line is just "E)" or similar and previous line has sex
        // Check if next line looks like a name - if so, this is an artifact but we should still process
        if (/^[A-Z]\)\s*$/.test(fixedLine)) {
          const prevLine = currentRecord[currentRecord.length - 1] || '';
          const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
          const looksLikeName = nextLine && /^[A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+$/.test(nextLine.trim());
          
          if ((prevLine.includes('|') || /[MFN]\s*$/.test(prevLine)) || looksLikeName) {
            // This is an OCR artifact (probably | age was read as E))
            // Check if there's a number in nearby lines that could be the age
            let foundAge = false;
            
            // Check previous lines in current record for age
            for (let k = currentRecord.length - 1; k >= 0 && k >= currentRecord.length - 3; k--) {
              const recLine = currentRecord[k];
              const ageMatch = recLine.match(/\|\s*(\d{1,2})(?:\s|$)/);
              if (ageMatch) {
                foundAge = true;
                break;
              }
            }
            
            // Check next lines for standalone numbers (age)
            if (!foundAge && i + 2 < lines.length) {
              const nextNextLine = lines[i + 2];
              if (/^\d{1,2}$/.test(nextNextLine.trim())) {
                const ageNum = parseInt(nextNextLine.trim());
                if (ageNum >= 1 && ageNum <= 99) {
                  // Add the age before skipping this line
                  currentRecord.push(`| ${nextNextLine.trim()}`);
                  // Skip the next line too (the age line)
                  i++;
                  foundAge = true;
                }
              }
            }
            
            // Skip this line (E)) but continue processing
            continue;
          }
        }
        
        // Continue current record
        currentRecord.push(fixedLine);
      } else {
        // Line doesn't match record pattern and no current record - might be header or noise
        // Try to start a new record if it looks like it could be one
        if (/^\d+/.test(line) && !shouldStopRecord(line)) {
          currentRecord = [line];
        }
      }
    }
    
    // Don't forget the last record
    if (currentRecord.length > 0) {
      normalized.push(Utils.joinRecordLines(currentRecord));
    }
    
    return normalized;
  },

  // Helper to join record lines with proper formatting
  joinRecordLines(recordLines) {
    let joined = recordLines.join(' ');
    
    // Remove URLs and links
    joined = joined.replace(/\s*https?:\/\/[^\s]+/gi, '');
    
    // Remove code artifacts ONLY if they are standalone (not part of name)
    // Pattern: "EQO02" or "EQ1" as standalone words, but keep "EQ1-MAURICIO" or "EQ1 MAURICIO"
    // Only remove if it's a standalone code with no letters after it
    joined = joined.replace(/\s+([A-Z]{2,}\d+)\s+(?![A-ZÁÉÍÓÚÇ])/g, ' ');
    // Don't remove codes that are followed by a hyphen and name (like "EQ1-MAURICIO")
    // The pattern above already handles this, but let's be explicit
    
    // Remove OCR artifacts like "E)", "E)", single letters with punctuation
    // This must be done early to ensure proper matching
    joined = joined.replace(/\s+[A-Z]\)\s+/g, ' ');
    joined = joined.replace(/\s+[A-Z]\)\s*$/g, ' ');
    joined = joined.replace(/^[A-Z]\)\s+/g, ' ');
    joined = joined.replace(/\s+[A-Z]\s*[\)\]\}\.]\s*/g, ' ');
    
    // Remove table headers that might have been included
    const headerPatterns = [
      /\s*cr\s*\*\s*pedido[^|]*/gi,
      /\s*\*\s*pedido[^|]*/gi,
      /\s+pedido\s+hema\s+rbc[^|]*/gi,
      /\s+hema\s+rbc\s+hgb[^|]*/gi
    ];
    headerPatterns.forEach(pattern => {
      joined = joined.replace(pattern, '');
    });
    
    // Remove lines that are clearly headers (multiple header keywords)
    const headerKeywords = ['pedido', 'hema', 'rbc', 'hgb', 'hct', 'vgm', 'hgm', 'chcm', 'rdw', 
                            'leucgl', 'basof', 'eos', 'próm', 'mieló', 'metami', 'bastão', 
                            'segmen', 'linfó', 'linfr', 'monóc', 'pla', 'ct-pla', 'leucgi'];
    const lowerJoined = joined.toLowerCase();
    const keywordCount = headerKeywords.filter(keyword => lowerJoined.includes(keyword)).length;
    if (keywordCount >= 3) {
      // This looks like a header, remove everything after the name
      // Try to find where the name ends and header begins
      const nameEndMatch = joined.match(/([A-ZÁÉÍÓÚÇ\s\.]+?)(?:\s+cr\s*\*|\s+\*\s*pedido|\.\s+cr)/i);
      if (nameEndMatch) {
        joined = nameEndMatch[1].trim();
      }
    }
    
    // GENERAL FIX: Any 3-digit number starting with 1 (100-199) should be treated as | + last 2 digits
    // This must be done FIRST before other processing
    // Pattern: "F 136" -> "F | 36", "| F 145" -> "| F | 45", "156ROSIQUELE" -> "| 56 ROSIQUELE"
    // Context-specific: only convert when it appears after sex/pipe or before name
    joined = joined.replace(/([MFN])\s+1(\d{2})(?:\s|$|[A-ZÁÉÍÓÚÇ])/g, '$1|$2');
    joined = joined.replace(/\|\s*([MFN])\s+1(\d{2})(?:\s|$|[A-ZÁÉÍÓÚÇ])/g, '|$1|$2');
    // Also handle when it appears directly before a name (no space)
    joined = joined.replace(/([MFN])\s+1(\d{2})([A-ZÁÉÍÓÚÇ])/g, '$1|$2 $3');
    joined = joined.replace(/\|\s*([MFN])\s+1(\d{2})([A-ZÁÉÍÓÚÇ])/g, '|$1|$2 $3');
    
    // Fix OCR errors: mM or Mm -> M|, / -> | (when followed by number)
    // Pattern: "mM /18" -> "M|18" or "Mm /18" -> "M|18"
    joined = joined.replace(/\b[mM][mM]\s*\/\s*(\d{1,2})\b/g, 'M|$1');
    joined = joined.replace(/\b[mM][mM]\s+(\d{1,2})\b/g, 'M|$1');
    // Fix: / read as | (when followed by number)
    joined = joined.replace(/\s+\/\s*(\d{1,2})\b/g, '|$1');
    joined = joined.replace(/([MFN])\s+\/\s*(\d{1,2})\b/g, '$1|$2');
    
    // Fix: | F followed by | number or E number (OCR error: | read as E)
    // Pattern: "| F E 41" or "| F | 41" -> "| F | 41"
    joined = joined.replace(/\|\s*([MFN])\s+[Ee]\s+(\d{1,2})(?:\s|$)/g, '|$1|$2');
    joined = joined.replace(/\|\s*([MFN])\s+\|\s*(\d{1,2})(?:\s|$)/g, '|$1|$2');
    
    // Fix OCR error: | read as 1 in age (e.g., "| F 123" -> "| F | 23")
    // Pattern: pipe + sex + space + number starting with 1 followed by 1-2 digits
    joined = joined.replace(/\|\s*([MFN])\s+1(\d{1,2})(?:\s|$)/g, '|$1|$2');
    
    // Also fix when there's no pipe before sex but number starts with 1 (e.g., "F 123" -> "F | 23")
    // Only if it's a reasonable age (1-99)
    joined = joined.replace(/([MFN])\s+1(\d{1,2})(?:\s|$)/g, (match, sex, age) => {
      const ageNum = parseInt(age);
      if (ageNum >= 1 && ageNum <= 99) {
        return `${sex}|${age}`;
      }
      return match;
    });
    
    // Fix OCR errors where | was read as E or other characters
    // Pattern: sex followed by E) or E) followed by number (probably | age)
    joined = joined.replace(/([MFN])\s+[Ee]\)\s*(\d{1,2})(?:\s|$)/g, '$1|$2');
    joined = joined.replace(/([MFN])\s+[Ee]\s+(\d{1,2})(?:\s|$)/g, '$1|$2');
    
    // Fix: name starting with "E)" or "E " when it's an OCR artifact (| read as E)
    // Pattern: after sex, if we have "E) NAME" or "E NAME" and no age was found, remove the E)
    joined = joined.replace(/\|\s*([MFN])\s+Es?\)\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, '|$1 $2');
    joined = joined.replace(/\|\s*([MFN])\s+E\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, '|$1 $2');
    // Also handle when E) appears with space: "F E) EDNEIA" -> "F EDNEIA"
    joined = joined.replace(/([MFN])\s+Es?\)\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, '$1 $2');
    joined = joined.replace(/([MFN])\s+E\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, '$1 $2');
    
    // Fix: 3-digit number starting with 1 (like 136, 156, 145) that should be | 36, | 56, | 45
    // Any number 100-199 should be treated as | + last 2 digits
    // Pattern: after sex, if we have "F 136" or "| F 136", convert to "| F | 36"
    joined = joined.replace(/\|\s*([MFN])\s+1(\d{2})(?:\s|$)/g, '|$1|$2');
    joined = joined.replace(/([MFN])\s+1(\d{2})(?:\s|$)/g, '$1|$2');
    // Also handle 2-digit numbers like 12, 13 (should be | 2, | 3)
    joined = joined.replace(/\|\s*([MFN])\s+1(\d{1})(?:\s|$)/g, '|$1|$2');
    joined = joined.replace(/([MFN])\s+1(\d{1})(?:\s|$)/g, '$1|$2');
    
    // Fix: number (age) directly followed by name without space
    // IMPORTANT: Check 3-digit numbers starting with 1 FIRST (100-199) to avoid false matches
    // Pattern: "136ROSIQUELE" -> "| 36 ROSIQUELE", "156SONIA" -> "| 56 SONIA"
    joined = joined.replace(/([MFN])\s+1(\d{2})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, (match, sex, age, name) => {
      const ageNum = parseInt(age);
      if (ageNum >= 0 && ageNum <= 99) {
        return `${sex}|${age} ${name}`;
      }
      return match;
    });
    // Then handle 2-digit numbers starting with 1 (10-19)
    joined = joined.replace(/([MFN])\s+1(\d{1})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, (match, sex, age, name) => {
      return `${sex}|${age} ${name}`;
    });
    // Finally handle any 2-digit number (age) directly followed by name
    // This catches cases like "45CARLA", "74NILCEIA", "36ROSIQUELE", "56SONIA"
    // Must come AFTER 3-digit check to avoid matching "145" as "45"
    joined = joined.replace(/([MFN])\s+(\d{2})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, (match, sex, age, name) => {
      const ageNum = parseInt(age);
      // Validate it's a reasonable age (1-99)
      // Since we already processed 3-digit numbers starting with 1, any remaining 2-digit is valid
      if (ageNum >= 1 && ageNum <= 99) {
        return `${sex}|${age} ${name}`;
      }
      return match;
    });
    // Handle 1-digit numbers (less common)
    joined = joined.replace(/([MFN])\s+(\d{1})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, (match, sex, age, name) => {
      const ageNum = parseInt(age);
      if (ageNum >= 1 && ageNum <= 9) {
        return `${sex}|${age} ${name}`;
      }
      return match;
    });
    
    // Clean up pipe spacing: ensure proper format
    joined = joined.replace(/\s*\|\s*/g, '|');
    // Add space after pipe if followed by M/F/N
    joined = joined.replace(/\|([MFN])/g, '|$1');
    // Add space before pipe if preceded by number
    joined = joined.replace(/(\d)\|/g, '$1|');
    // Add space after pipe if followed by number (age)
    joined = joined.replace(/\|(\d+)/g, '|$1');
    
    // Clean up multiple spaces
    joined = joined.replace(/\s{2,}/g, ' ').trim();
    
    return joined;
  },

  extractLastNDigits(value, n = Constants.CONFIG.ID_DIGITS) {
    const cleaned = String(value || '').replace(/[.\s/,]/g, '');
    return cleaned.length >= n ? cleaned.slice(-n) : cleaned;
  },

  // New approach: Separate age from name more aggressively
  separateAgeFromName(text) {
    if (!text) return { age: null, name: '' };
    
    const trimmed = text.trim();
    
    // Pattern 1: 3-digit number starting with 1 followed by name (e.g., "145CARLA" -> age: "45", name: "CARLA")
    let match = trimmed.match(/^1(\d{2})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
    if (match) {
      const ageNum = parseInt(match[1]);
      if (ageNum >= 0 && ageNum <= 99) {
        return { age: match[1], name: match[2].trim() };
      }
    }
    
    // Pattern 2: 2-digit number starting with 1 followed by name (e.g., "12NAME" -> age: "2", name: "NAME")
    match = trimmed.match(/^1(\d{1})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
    if (match) {
      const ageNum = parseInt(match[1]);
      if (ageNum >= 0 && ageNum <= 9) {
        return { age: match[1], name: match[2].trim() };
      }
    }
    
    // Pattern 3: 2-digit number (10-99) followed by name (e.g., "45CARLA" -> age: "45", name: "CARLA")
    match = trimmed.match(/^(\d{2})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
    if (match) {
      const ageNum = parseInt(match[1]);
      if (ageNum >= 10 && ageNum <= 99) {
        return { age: match[1], name: match[2].trim() };
      }
    }
    
    // Pattern 4: 1-digit number (1-9) followed by name (e.g., "5NAME" -> age: "5", name: "NAME")
    match = trimmed.match(/^(\d{1})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
    if (match) {
      const ageNum = parseInt(match[1]);
      if (ageNum >= 1 && ageNum <= 9) {
        return { age: match[1], name: match[2].trim() };
      }
    }
    
    // Pattern 5: Number with space followed by name (e.g., "45 CARLA" -> age: "45", name: "CARLA")
    match = trimmed.match(/^(\d{1,2})\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
    if (match) {
      const ageNum = parseInt(match[1]);
      if (ageNum >= 1 && ageNum <= 99) {
        // Check if it's a 3-digit number starting with 1
        if (match[1].length === 3 && match[1].startsWith('1')) {
          return { age: match[1].slice(1), name: match[2].trim() };
        }
        return { age: match[1], name: match[2].trim() };
      }
    }
    
    // Pattern 6: 3-digit number starting with 1 with space (e.g., "145 CARLA" -> age: "45", name: "CARLA")
    match = trimmed.match(/^1(\d{2})\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
    if (match) {
      const ageNum = parseInt(match[1]);
      if (ageNum >= 0 && ageNum <= 99) {
        return { age: match[1], name: match[2].trim() };
      }
    }
    
    // Pattern 7: Number with bracket followed by name (e.g., "[43 EDILAINE" -> age: "43", name: "EDILAINE")
    match = trimmed.match(/^\[(\d{1,2})\]?\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
    if (match) {
      const ageNum = parseInt(match[1]);
      if (ageNum >= 1 && ageNum <= 99) {
        // Check if it's a 3-digit number starting with 1
        if (match[1].length === 3 && match[1].startsWith('1')) {
          return { age: match[1].slice(1), name: match[2].trim() };
        }
        return { age: match[1], name: match[2].trim() };
      }
    }
    
    // Pattern 8: Number with bracket at start (e.g., "[43" -> age: "43", name: "")
    match = trimmed.match(/^\[(\d{1,2})\]?$/);
    if (match) {
      const ageNum = parseInt(match[1]);
      if (ageNum >= 1 && ageNum <= 99) {
        // Check if it's a 3-digit number starting with 1
        if (match[1].length === 3 && match[1].startsWith('1')) {
          return { age: match[1].slice(1), name: '' };
        }
        return { age: match[1], name: '' };
      }
    }
    
    // No age found, return name as is
    return { age: null, name: trimmed };
  },

  cleanName(name) {
    if (!name) return '';
    let cleaned = name.trim();
    
    // First, try to separate age from name using the dedicated function
    const separated = Utils.separateAgeFromName(cleaned);
    if (separated.age) {
      // Age was found and removed, use the cleaned name
      cleaned = separated.name;
    } else {
      // No age found, but still clean the name
      cleaned = separated.name;
    }
    
    return cleaned
      // Remove numbers at start that are clearly ages (1-2 digits or 3 digits starting with 1)
      // Pattern: "45CARLA" -> "CARLA" or "136ROSIQUELE" -> "ROSIQUELE" (36 is the age)
      // Any number 100-199 should be treated as | + last 2 digits
      .replace(/^1(\d{2})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/, (match, age, rest) => {
        const ageNum = parseInt(age);
        // Covers 100-199 range (00-99 after the 1)
        if (ageNum >= 0 && ageNum <= 99) {
          return rest;
        }
        return match;
      })
      .replace(/^1(\d{1})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/, (match, age, rest) => {
        const ageNum = parseInt(age);
        // Covers 10-19 range (0-9 after the 1)
        if (ageNum >= 0 && ageNum <= 9) {
          return rest;
        }
        return match;
      })
      .replace(/^(\d{1,2})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/, (match, age, rest) => {
        const ageNum = parseInt(age);
        if (ageNum >= 1 && ageNum <= 99) {
          return rest;
        }
        return match;
      })
      // Also remove numbers with space at start (e.g., "33 RAUANE" -> "RAUANE")
      .replace(/^(\d{1,2})\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/, (match, age, rest) => {
        const ageNum = parseInt(age);
        if (ageNum >= 1 && ageNum <= 99) {
          return rest;
        }
        return match;
      })
      // Remove numbers with brackets at start (e.g., "[43" or "[43]" -> remove)
      .replace(/^\[(\d{1,2})\]?\s*/g, '')
      // Remove numbers with brackets anywhere if they look like age (e.g., "[43 EDILAINE" -> "EDILAINE")
      .replace(/\s*\[(\d{1,2})\]?\s+([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)/g, (match, age, rest) => {
        const ageNum = parseInt(age);
        if (ageNum >= 1 && ageNum <= 99) {
          return rest;
        }
        return match;
      })
      // Remove "E)" or "Es)" at start if it's an OCR artifact (| read as E)
      .replace(/^Es?\)\s*/i, '')
      .replace(/^E\s+([A-ZÁÉÍÓÚÇ][a-záéíóúç])/g, '$1')
      // Remove "E" at start if it's an OCR artifact (| read as E)
      // Only remove if followed by a space and a name (not if it's part of the name like "ELIAS")
      .replace(/^E\s+([A-ZÁÉÍÓÚÇ][a-záéíóúç])/g, '$1')
      .replace(/\s+ál\s*$/i, '')
      .replace(/^(ál|al)\s+/i, '')
      .replace(/\s+\.\s*$/, '')
      .replace(/\.$/, '')
      .replace(/\s+\d+\s+\d+\.\d+.*$/, '')
      .replace(/\s+\d+\s+\d+.*\|[MF]\|.*$/, '')
      .replace(/\s+\d{5,}.*$/, '')
      .replace(/\s*https?:\/\/[^\s]+/gi, '')
      .trim();
  },

  isOCRArtifact(text) {
    if (Constants.REGEX_PATTERNS.OCR_ARTIFACT.test(text.toLowerCase())) {
      return true;
    }
    return text.length <= 3 &&
      !Constants.REGEX_PATTERNS.HAS_LETTERS.test(text) &&
      /^[a-záéíóú]+$/.test(text);
  },

  isLink(line) {
    return Constants.REGEX_PATTERNS.URL_LINK.test(line);
  },

  isCodeArtifact(line) {
    return Constants.REGEX_PATTERNS.CODE_ARTIFACT.test(line);
  },

  isNewRecord(line) {
    return Constants.REGEX_PATTERNS.NEW_RECORD.test(line) ||
           Constants.REGEX_PATTERNS.RECORD_ID_LINE.test(line) ||
           Constants.REGEX_PATTERNS.RECORD_ID_SEX_LINE.test(line);
  },

  isPageSeparator(line) {
    return Constants.REGEX_PATTERNS.PAGE_SEPARATOR.test(line);
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
  extract(text) {
    // Fix common OCR errors before processing
    const fixedText = Utils.fixOCRErrors(text);
    
    // Normalize by joining record lines
    const normalizedLines = Utils.normalizeRecordLines(fixedText);
    
    const results = [];
    
    for (let i = 0; i < normalizedLines.length; i++) {
      const line = normalizedLines[i];
      let rowData = null;
      
      // Clean line: remove E) artifacts before matching
      // Remove E) at the start, middle, or end of the line
      let cleanedLine = line.replace(/\s+Es?\)\s+/g, ' ');
      cleanedLine = cleanedLine.replace(/\s+Es?\)\s*$/g, ' ');
      cleanedLine = cleanedLine.replace(/^Es?\)\s+/g, ' ');
      cleanedLine = cleanedLine.replace(/\s+E\s+/g, ' ');
      cleanedLine = cleanedLine.replace(/\s+E\s*$/g, ' ');
      cleanedLine = cleanedLine.replace(/^E\s+/g, ' ');
      
      // Try normalized record pattern: "1  25.080.164|M|73 PAULO SOARES."
      let match = cleanedLine.match(Constants.REGEX_PATTERNS.NORMALIZED_RECORD);
      
      if (match) {
        // Extract from normalized line
        let age = match[4] || null;
        // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
        if (age && /^1\d{2}$/.test(age)) {
          age = age.slice(1); // Remove first digit, keep last 2
        }
        // Check if name starts with a number (age) - apply separateAgeFromName
        let namePart = match[5];
        if (!age && namePart) {
          const separated = Utils.separateAgeFromName(namePart);
          if (separated.age) {
            age = separated.age;
            namePart = separated.name;
          }
        }
        
        rowData = {
          sequence: match[1],
          id: Utils.extractLastNDigits(match[2]),
          sex: this.normalizeSex(match[3]),
          age: age,
          name: Utils.cleanName(namePart)
        };
      } else {
        // Try alternative normalized patterns
        // Pattern: "1  25.080.164|M| PAULO SOARES." (age missing or separated)
        const matchNoAge = cleanedLine.match(Constants.REGEX_PATTERNS.NORMALIZED_RECORD_NO_AGE);
        if (matchNoAge) {
          // Try to extract age from the name part
          let namePart = matchNoAge[4].trim();
          
          // Check if name starts with "| number" or "E number" or "Es) number" (OCR errors)
          const ageWithPipe = namePart.match(/^\|\s*(\d{1,2})\s+(.+)$/);
          const ageWithE = namePart.match(/^E\s+(\d{1,2})\s+(.+)$/);
          const ageWithEs = namePart.match(/^Es?\)\s*(\d{1,2})\s+(.+)$/);
          const ageWithEsNoParen = namePart.match(/^Es?\s+(\d{1,2})\s+(.+)$/);
          
          // Check if name starts with just "E)" or "E " (artifacts without number)
          const nameWithE = namePart.match(/^Es?\)\s+(.+)$/);
          const nameWithEOnly = namePart.match(/^E\s+(.+)$/);
          
          let age = null;
          let cleanName = namePart;
          
          if (ageWithPipe) {
            age = ageWithPipe[1];
            cleanName = ageWithPipe[2];
          } else if (ageWithEs) {
            age = ageWithEs[1];
            cleanName = ageWithEs[2];
          } else if (ageWithEsNoParen) {
            age = ageWithEsNoParen[1];
            cleanName = ageWithEsNoParen[2];
          } else if (ageWithE) {
            age = ageWithE[1];
            cleanName = ageWithE[2];
          }
          
          // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
          if (age && /^1\d{2}$/.test(age)) {
            age = age.slice(1); // Remove first digit, keep last 2
          }
          
          if (!age) {
            // If we didn't find age yet, check for name patterns without age
            if (nameWithE) {
              // E) followed by name (no number) - remove E) and process without age
              cleanName = nameWithE[1];
              age = null;
            } else if (nameWithEOnly) {
              // E followed by name (no number) - remove E and process without age
              cleanName = nameWithEOnly[1];
              age = null;
            } else {
              // Try if name starts with just a number (age) with space
              const ageMatch = namePart.match(/^(\d{1,2})\s+(.+)$/);
              if (ageMatch) {
                age = ageMatch[1];
                cleanName = ageMatch[2];
              } else {
                // Try if name starts with 3-digit number starting with 1 FIRST (like 136ROSIQUELE, 156SONIA)
                // Pattern: "136ROSIQUELE" -> age: "36" (| read as 1), name: "ROSIQUELE"
                // Any number 100-199 should be treated as | + last 2 digits
                // Check this BEFORE 2-digit numbers to avoid false matches
                const age3DigitMatch = namePart.match(/^1(\d{2})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
                if (age3DigitMatch) {
                  const potentialAge = parseInt(age3DigitMatch[1]);
                  // Validate it's a reasonable age (0-99, covers 100-199 range)
                  if (potentialAge >= 0 && potentialAge <= 99) {
                    age = age3DigitMatch[1];
                    cleanName = age3DigitMatch[2];
                  }
                } else {
                  // Try 2-digit number starting with 1 (like 12NAME, 13NAME)
                  const age2DigitMatch = namePart.match(/^1(\d{1})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
                  if (age2DigitMatch) {
                    const potentialAge = parseInt(age2DigitMatch[1]);
                    if (potentialAge >= 0 && potentialAge <= 9) {
                      age = age2DigitMatch[1];
                      cleanName = age2DigitMatch[2];
                    }
                  } else {
                    // Try if name starts with number directly followed by letters (no space)
                    // Pattern: "45CARLA" -> age: "45", name: "CARLA" or "23BARBARAH" -> age: "23", name: "BARBARAH"
                    // This should catch most cases: 45CARLA, 74NILCEIA, 36ROSIQUELE, 56SONIA
                    const ageDirectMatch = namePart.match(/^(\d{2})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
                    if (ageDirectMatch) {
                      const potentialAge = parseInt(ageDirectMatch[1]);
                      // Validate it's a reasonable age (1-99)
                      if (potentialAge >= 1 && potentialAge <= 99) {
                        age = ageDirectMatch[1];
                        cleanName = ageDirectMatch[2];
                      }
                    } else {
                      // Try 1-digit number (less common but possible)
                      const age1DigitMatch = namePart.match(/^(\d{1})([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s]+)$/);
                      if (age1DigitMatch) {
                        const potentialAge = parseInt(age1DigitMatch[1]);
                        if (potentialAge >= 1 && potentialAge <= 9) {
                          age = age1DigitMatch[1];
                          cleanName = age1DigitMatch[2];
                        }
                      }
                    }
                  }
                }
              }
              
              // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
              if (age && /^1\d{2}$/.test(age)) {
                age = age.slice(1); // Remove first digit, keep last 2
              }
            }
          }
          
          // Use new approach: separate age from name more aggressively
          // Always check, even if age was found, to ensure no numbers in name
          if (cleanName) {
            const separated = Utils.separateAgeFromName(cleanName);
            if (separated.age && !age) {
              // Only use separated age if we don't already have one
              age = separated.age;
              cleanName = separated.name;
            } else if (separated.age && age) {
              // If we have both, prefer the one we found earlier, but remove from name
              cleanName = separated.name;
            } else if (!separated.age && separated.name) {
              // No age found, but name might have been cleaned
              cleanName = separated.name;
            }
          }
          
          rowData = {
            sequence: matchNoAge[1],
            id: Utils.extractLastNDigits(matchNoAge[2]),
            sex: this.normalizeSex(matchNoAge[3]),
            age: age || null, // Ensure null if no age found, will be converted to 'N/A' later
            name: Utils.cleanName(cleanName)
          };
        } else {
          // Fallback to original multi-line processing
          const originalLines = this.normalizeLines(fixedText);
          rowData = this.extractFromMultiLine(originalLines, i);
          if (rowData) {
            // Skip processed lines
            i += (rowData._linesProcessed || 1) - 1;
            delete rowData._linesProcessed;
          } else {
            // Last resort fallback: try to extract any data from the line
            rowData = this.extractFallback(cleanedLine, normalizedLines, i);
          }
        }
      }

      // If no rowData was created, try fallback to ensure we don't lose the line
      if (!rowData) {
        rowData = this.extractFallback(cleanedLine, normalizedLines, i);
      }
      
      // Apply fallback for all fields - ensure every field has a value or 'N/A'
      // This ensures we never lose a line - if we have ANY data, create a record
      if (rowData) {
        rowData.sequence = rowData.sequence || 'N/A';
        rowData.id = rowData.id || 'N/A';
        rowData.sex = rowData.sex || 'N/A';
        rowData.age = rowData.age || null; // Will be validated below
        rowData.name = rowData.name || 'N/A';
      } else {
        // Last resort: create a record with all N/A if we couldn't extract anything
        // But only if the line looks like it might be a record (has numbers or letters)
        if (cleanedLine && (/\d/.test(cleanedLine) || /[A-ZÁÉÍÓÚÇ]/.test(cleanedLine))) {
          rowData = {
            sequence: 'N/A',
            id: 'N/A',
            sex: 'N/A',
            age: null, // Will be converted to 'N/A' below
            name: 'N/A'
          };
        }
      }

      // Process if we have rowData (either extracted or fallback)
      if (rowData) {
        // Validate sex: must be M or F
        if (rowData.sex !== 'M' && rowData.sex !== 'F') {
          rowData.sex = 'N/A';
        }
        
        // Validate age: must be a valid number (1-99) or null, otherwise show 'N/A'
        if (rowData.age !== null && rowData.age !== undefined && rowData.age !== 'N/A') {
          const ageNum = parseInt(rowData.age);
          if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) {
            rowData.age = 'N/A';
          } else {
            rowData.age = String(ageNum);
          }
        } else {
          rowData.age = 'N/A';
        }
        
        // Ensure name is set
        rowData.name = rowData.name || 'N/A';
        
        // Ensure all fields are set to 'N/A' if they're still null/undefined
        rowData.sequence = rowData.sequence || 'N/A';
        rowData.id = rowData.id || 'N/A';
        rowData.sex = rowData.sex || 'N/A';
        rowData.age = rowData.age || 'N/A';
        rowData.name = rowData.name || 'N/A';
        
        // Always add the row - we never lose data, even if all fields are 'N/A'
        // This ensures every line is processed and displayed
        results.push(rowData);
      }
    }

    // Remove duplicates based on ID and sequence
    const uniqueResults = [];
    const seen = new Set();
    
    for (const row of results) {
      const key = `${row.sequence}-${row.id}-${row.sex}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(row);
      }
    }

    return { rows: uniqueResults.sort((a, b) => parseInt(a.sequence) - parseInt(b.sequence)) };
  }

  extractFallback(line, normalizedLines, currentIndex) {
    // Last resort: try to extract any data we can from the line
    // This is a very permissive fallback that tries to find sequence, ID, sex, age, and name
    const rowData = {
      sequence: null,
      id: null,
      sex: null,
      age: null,
      name: null
    };

    // Try to find sequence number at the start
    const seqMatch = line.match(/^(\d+)/);
    if (seqMatch) {
      rowData.sequence = seqMatch[1];
    }

    // Try to find ID pattern (numbers with dots/spaces) - look for pattern like 25.080.246
    const idPatterns = [
      /(\d+\.\d+\.\d+)/,  // 25.080.246
      /(\d+(?:[.\s/,]*\d+){2,})/,  // Any pattern with multiple number groups
      /(\d{8,})/  // Long number sequences
    ];

    for (const pattern of idPatterns) {
      const idMatch = line.match(pattern);
      if (idMatch) {
        const idCandidate = idMatch[1];
        // Make sure it's not the sequence number
        if (idCandidate !== rowData.sequence && !line.startsWith(idCandidate)) {
          rowData.id = Utils.extractLastNDigits(idCandidate);
          break;
        }
      }
    }

    // Try to find sex (M or F, possibly with W/N prefix)
    const sexMatch = line.match(/\|([WN]?[MF]|N)(?:\s*\||\s|$)/);
    if (sexMatch) {
      rowData.sex = this.normalizeSex(sexMatch[1]);
    } else {
      // Try without pipe
      const sexMatchNoPipe = line.match(/\b([WN]?[MF]|N)\b/);
      if (sexMatchNoPipe) {
        rowData.sex = this.normalizeSex(sexMatchNoPipe[1]);
      }
    }

    // Try to find age (numbers 1-99, possibly with pipe or after sex)
    const agePatterns = [
      /\|\s*(\d{1,2})(?:\s|$)/,  // | 45 or |45
      /([MFN])\s*\|?\s*(\d{1,2})(?:\s|$)/,  // F|45 or F 45
      /\b(1\d{2})\b/,  // 145, 136, etc (will be converted to last 2 digits)
      /\b(\d{1,2})\s+[A-ZÁÉÍÓÚÇ]/  // 45 NAME (age before name)
    ];

    for (const pattern of agePatterns) {
      const ageMatch = line.match(pattern);
      if (ageMatch) {
        let ageValue = ageMatch[ageMatch.length - 1]; // Get last capture group
        // If it's a 3-digit number starting with 1, use last 2 digits
        if (/^1\d{2}$/.test(ageValue)) {
          ageValue = ageValue.slice(1);
        }
        const ageNum = parseInt(ageValue);
        if (ageNum >= 1 && ageNum <= 99) {
          rowData.age = ageValue;
          break;
        }
      }
    }

    // Try to find name (uppercase letters, possibly after age/sex)
    // Remove sequence, ID, sex, and age from line to find name
    let nameLine = line;
    if (rowData.sequence) {
      nameLine = nameLine.replace(new RegExp(`^${rowData.sequence}\\s+`), '');
    }
    if (rowData.id) {
      // Try to remove ID pattern
      const idPattern = rowData.id.replace(/(\d)(\d)(\d)(\d)(\d)/, '$1.$2$3.$4$5'); // Try to reconstruct pattern
      nameLine = nameLine.replace(new RegExp(idPattern.replace(/\./g, '\\.'), 'g'), '');
      nameLine = nameLine.replace(new RegExp(rowData.id, 'g'), '');
    }
    nameLine = nameLine.replace(/\|[WN]?[MF]|N[^A-Z]*/g, '');
    nameLine = nameLine.replace(/\|\s*\d{1,2}\s*/g, ' ');
    nameLine = nameLine.replace(/\b\d{1,2}\s+/g, ' ');
    nameLine = nameLine.replace(/\s+Es?\)\s+/g, ' ');
    nameLine = nameLine.replace(/\s+E\s+/g, ' ');
    nameLine = nameLine.replace(/\s+[A-Z]\)\s*/g, ' '); // Remove E) artifacts
    
    // Extract name (uppercase letters and spaces)
    const nameMatch = nameLine.match(/([A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s\.]+)/);
    if (nameMatch) {
      rowData.name = Utils.cleanName(nameMatch[1].trim());
    } else {
      // If no name found in current line, check next lines (up to 3 lines ahead)
      for (let j = currentIndex + 1; j < normalizedLines.length && j <= currentIndex + 3; j++) {
        const nextLine = normalizedLines[j];
        // Check if next line looks like a name (starts with uppercase, no numbers at start)
        if (/^[A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ\s\.]+$/.test(nextLine.trim()) && !/^\d+/.test(nextLine.trim())) {
          rowData.name = Utils.cleanName(nextLine.trim());
          break;
        }
      }
    }

    // Always return rowData, even if all fields are null
    // This ensures we never lose a line - the caller will set 'N/A' for missing fields
    // Only return null if we truly found nothing (no sequence, no ID, no name, no sex)
    // But if we found anything at all, return the rowData
    if (rowData.sequence || rowData.id || rowData.name || rowData.sex) {
      return rowData;
    }
    
    // If we found nothing, still return an object so the line isn't lost
    // The caller will fill with 'N/A'
    return {
      sequence: null,
      id: null,
      sex: null,
      age: null,
      name: null
    };
  }

  extractFromMultiLine(lines, startIndex) {
    // Original multi-line extraction logic as fallback
    let i = startIndex;
    let rowData = null;
    let nextIndex = i + 1;

    const match = lines[i].match(Constants.REGEX_PATTERNS.RECORD);
    if (match) {
      rowData = this.createRowData(match);
      nextIndex = this.extractAgeAndName(lines, i, rowData);
    } else {
      const idSexMatch = lines[i].match(Constants.REGEX_PATTERNS.RECORD_ID_SEX_LINE);
      if (idSexMatch) {
        rowData = {
          sequence: idSexMatch[1],
          id: Utils.extractLastNDigits(idSexMatch[2]),
          sex: this.normalizeSex(idSexMatch[3]),
          age: null,
          name: null
        };
        nextIndex = this.extractAgeAndName(lines, i, rowData);
      } else {
        const idMatch = lines[i].match(Constants.REGEX_PATTERNS.RECORD_ID_LINE);
        if (idMatch && i + 1 < lines.length) {
          const sexAgeMatch = lines[i + 1].match(Constants.REGEX_PATTERNS.RECORD_SEX_AGE_LINE);
          if (sexAgeMatch) {
            let age = sexAgeMatch[2] || null;
            // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
            if (age && /^1\d{2}$/.test(age)) {
              age = age.slice(1); // Remove first digit, keep last 2
            }
            rowData = {
              sequence: idMatch[1],
              id: Utils.extractLastNDigits(idMatch[2]),
              sex: this.normalizeSex(sexAgeMatch[1]),
              age: age,
              name: null
            };
            nextIndex = this.extractAgeAndName(lines, i + 1, rowData);
          }
        }
      }
    }

    if (rowData) {
      rowData._linesProcessed = nextIndex - startIndex;
    }
    return rowData;
  }

  normalizeLines(text) {
    return text.split('\n')
      .map(line => {
        let normalized = line.trim();
        
        // Additional per-line OCR fixes
        // Fix common character substitutions in numbers
        normalized = normalized.replace(/(\d+)O(\d+)/g, '$10$2');
        normalized = normalized.replace(/(\d+)[lI](\d+)/g, '$11$2');
        
        // Fix pipe variations
        normalized = normalized.replace(/(\d+\.?\d*\.?\d*)\s*[1lI]\s*([MFN])/gi, '$1|$2');
        
        return normalized;
      })
      .filter(line => line.length > 0);
  }

  createRowData(match) {
    let age = match[4] || null;
    // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
    if (age && /^1\d{2}$/.test(age)) {
      age = age.slice(1); // Remove first digit, keep last 2
    }
    return {
      sequence: match[1],
      id: Utils.extractLastNDigits(match[2]),
      sex: this.normalizeSex(match[3]),
      age: age,
      name: null
    };
  }

  normalizeSex(sexValue) {
    if (!sexValue) return '';
    const normalized = sexValue.toUpperCase();
    // Only M or F are accepted: N -> M (OCR error), WM -> M, NM -> M, WF -> F, NF -> F
    if (normalized === 'N' || normalized === 'WM' || normalized === 'NM' || normalized === 'M') return 'M';
    if (normalized === 'WF' || normalized === 'NF' || normalized === 'F') return 'F';
    // Reject any other value
    return '';
  }

  extractAgeAndName(lines, startIndex, rowData) {
    let foundAge = !!rowData.age;
    let nameParts = [];
    let j = startIndex + 1;
    const maxLookAhead = Math.min(startIndex + Constants.CONFIG.MAX_LOOKAHEAD, lines.length);

    while (j < maxLookAhead) {
      const line = lines[j];

      if (this.shouldStopSearching(line)) break;
      if (Utils.isOCRArtifact(line)) { j++; continue; }
      if (Utils.isLink(line)) { j++; continue; }
      // Only skip code artifacts if they are standalone (not part of name)
      // If code is followed by text (like "EQ1-MAURICIO"), include it in name
      if (Utils.isCodeArtifact(line) && !/[A-ZÁÉÍÓÚÇ]/.test(line.replace(/^[A-Z]{2,}\d+[-]?/, ''))) {
        j++; 
        continue;
      }

      // Check for age with pipe at start (e.g., "| 64" or "|64")
      if (!foundAge) {
        const ageWithPipe = line.match(Constants.REGEX_PATTERNS.AGE_WITH_PIPE);
        if (ageWithPipe) {
          let ageValue = ageWithPipe[1];
          // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
          if (/^1\d{2}$/.test(ageValue)) {
            ageValue = ageValue.slice(1); // Remove first digit, keep last 2
          }
          rowData.age = ageValue;
          foundAge = true;
          j++;
          continue;
        }
        
        // Check for age with bracket at start (e.g., "[43" or "[43]")
        const ageWithBracket = line.match(/^\[(\d{1,2})\]?$/);
        if (ageWithBracket) {
          let ageValue = ageWithBracket[1];
          // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
          if (/^1\d{2}$/.test(ageValue)) {
            ageValue = ageValue.slice(1); // Remove first digit, keep last 2
          }
          const ageNum = parseInt(ageValue);
          if (ageNum >= 1 && ageNum <= 99) {
            rowData.age = ageValue;
            foundAge = true;
            j++;
            continue;
          }
        }
        
        // Check if pipe was read as "1" (OCR error: "| 45" -> "145")
        // Only match 3-digit numbers starting with 1 where last 1-2 digits are age
        const ageWithPipeError = line.match(Constants.REGEX_PATTERNS.AGE_WITH_PIPE_OCR_ERROR);
        if (ageWithPipeError) {
          // Check if previous line ends with pipe or contains sex (M/F)
          const prevLine = startIndex >= 0 ? lines[startIndex] : '';
          const isAfterPipeOrSex = prevLine && (
            prevLine.trim().endsWith('|') || 
            /\|[WN]?[MF]|N\s*$/.test(prevLine.trim())
          );
          
          if (isAfterPipeOrSex) {
            const ageValue = ageWithPipeError[1];
            // Validate it's a reasonable age (1-99)
            if (parseInt(ageValue) >= 1 && parseInt(ageValue) <= 99) {
              rowData.age = ageValue;
              foundAge = true;
              j++;
              continue;
            }
          }
        }
      }

      if (!foundAge && Constants.REGEX_PATTERNS.STANDALONE_NUMBER.test(line)) {
        let ageValue = line.trim();
        // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
        if (/^1\d{2}$/.test(ageValue)) {
          ageValue = ageValue.slice(1); // Remove first digit, keep last 2
        }
        rowData.age = ageValue;
        foundAge = true;
        j++;
        continue;
      }
      
      // Check for age with bracket (e.g., "[43" or "[43]") - also handle standalone
      if (!foundAge) {
        const ageWithBracket = line.trim().match(/^\[?(\d{1,2})\]?$/);
        if (ageWithBracket) {
          let ageValue = ageWithBracket[1];
          // Fix: If age is a 3-digit number starting with 1 (100-199), use only last 2 digits
          if (/^1\d{2}$/.test(ageValue)) {
            ageValue = ageValue.slice(1); // Remove first digit, keep last 2
          }
          const ageNum = parseInt(ageValue);
          if (ageNum >= 1 && ageNum <= 99) {
            rowData.age = ageValue;
            foundAge = true;
            j++;
            continue;
          }
        }
      }

      if (foundAge && this.isNameLine(line)) {
        nameParts.push(line);
        j++;
        continue;
      }

      // Check if current line is a code followed by name in next line (like "EQ1-" followed by "MAURICIO")
      if (foundAge && Utils.isCodeArtifact(line) && j + 1 < maxLookAhead) {
        const nextLine = lines[j + 1];
        if (this.isNameLine(nextLine)) {
          // Include both code and name
          nameParts.push(line);
          nameParts.push(nextLine);
          j += 2;
          continue;
        }
      }

      if (foundAge && nameParts.length > 0 && this.shouldContinueCollectingName(lines, j)) {
        nameParts.push(line);
        j++;
        continue;
      }

      if (foundAge && nameParts.length > 0) break;
      j++;
    }

    if (nameParts.length > 0) {
      let joinedName = nameParts.filter(part => {
        // Remove lines with just numbers in brackets (e.g., "[43" or "[43]")
        if (/^\[?\d{1,2}\]?$/.test(part.trim())) return false;
        // Keep codes if they are part of name (followed by hyphen or text)
        if (Utils.isCodeArtifact(part)) {
          // Check if code is followed by text (like "EQ1-MAURICIO" or "EQ1 MAURICIO")
          const codeWithText = /^[A-Z]{2,}\d+[-]?[A-ZÁÉÍÓÚÇ]/.test(part);
          return codeWithText; // Keep if it has text after, remove if standalone
        }
        return !Constants.REGEX_PATTERNS.OCR_ARTIFACT.test(part.toLowerCase()) &&
               !Utils.isLink(part);
      }).join(' ');
      
      // Check if name starts with a number (age) and separate it
      if (joinedName && !rowData.age) {
        const separated = Utils.separateAgeFromName(joinedName);
        if (separated.age) {
          rowData.age = separated.age;
          joinedName = separated.name;
        }
      }
      
      rowData.name = Utils.cleanName(joinedName);
    }

    if (!rowData.age) this.findBackupAge(lines, startIndex, rowData);
    if (!rowData.name) this.findBackupName(lines, startIndex, rowData);

    return j;
  }

  shouldStopSearching(line) {
    return Utils.isNewRecord(line) || Utils.isPageSeparator(line);
  }

  isNameLine(line) {
    if (!Constants.REGEX_PATTERNS.HAS_LETTERS.test(line)) return false;
    if (Utils.isNewRecord(line)) return false;
    if (Utils.isLink(line)) return false;
    // Don't consider lines with just numbers in brackets as name (e.g., "[43" or "[43]")
    if (/^\[?\d{1,2}\]?$/.test(line.trim())) return false;
    // Allow codes if they are part of name (followed by hyphen or text)
    if (Utils.isCodeArtifact(line)) {
      // Check if code is followed by text (like "EQ1-MAURICIO" or "EQ1 MAURICIO")
      return /^[A-Z]{2,}\d+[-]?[A-ZÁÉÍÓÚÇ]/.test(line);
    }
    if (Constants.REGEX_PATTERNS.NUMBER_WITH_SPACE.test(line)) return false;
    if (Constants.REGEX_PATTERNS.NUMBER_WITH_DOTS.test(line)) return false;
    return !Constants.REGEX_PATTERNS.OCR_ARTIFACT.test(line.toLowerCase());
  }

  shouldContinueCollectingName(lines, currentIndex) {
    if (currentIndex + 1 >= lines.length) return false;
    const nextLine = lines[currentIndex + 1];
    // Allow codes if they are part of name (followed by hyphen or text)
    if (Utils.isCodeArtifact(nextLine)) {
      // Check if code is followed by text (like "EQ1-MAURICIO" or "EQ1 MAURICIO")
      return /^[A-Z]{2,}\d+[-]?[A-ZÁÉÍÓÚÇ]/.test(nextLine);
    }
    return Constants.REGEX_PATTERNS.HAS_LETTERS.test(nextLine) &&
      !Utils.isNewRecord(nextLine) &&
      !Utils.isLink(nextLine) &&
      !Constants.REGEX_PATTERNS.NUMBER_WITH_SPACE.test(nextLine) &&
      !Constants.REGEX_PATTERNS.STANDALONE_NUMBER.test(nextLine);
  }

  findBackupAge(lines, startIndex, rowData) {
    const maxIndex = Math.min(startIndex + Constants.CONFIG.BACKUP_LOOKAHEAD, lines.length);
    const prevLine = startIndex >= 0 ? lines[startIndex] : '';
    const isAfterPipeOrSex = prevLine && (
      prevLine.trim().endsWith('|') || 
      /\|[WN]?[MF]|N\s*$/.test(prevLine.trim())
    );
    
    for (let k = startIndex + 1; k < maxIndex; k++) {
      if (Utils.isNewRecord(lines[k])) break;
      
      // Check for age with pipe at start
      const ageWithPipe = lines[k].match(Constants.REGEX_PATTERNS.AGE_WITH_PIPE);
      if (ageWithPipe) {
        rowData.age = ageWithPipe[1];
        break;
      }
      
      // Check if pipe was read as "1" (OCR error)
      if (isAfterPipeOrSex) {
        const ageWithPipeError = lines[k].match(Constants.REGEX_PATTERNS.AGE_WITH_PIPE_OCR_ERROR);
        if (ageWithPipeError) {
          const ageValue = ageWithPipeError[1];
          if (parseInt(ageValue) >= 1 && parseInt(ageValue) <= 99) {
            rowData.age = ageValue;
            break;
          }
        }
      }
      
      if (Constants.REGEX_PATTERNS.STANDALONE_NUMBER.test(lines[k])) {
        rowData.age = lines[k];
        break;
      }
    }
  }

  findBackupName(lines, startIndex, rowData) {
    const nameParts = [];
    const maxIndex = Math.min(startIndex + Constants.CONFIG.BACKUP_LOOKAHEAD, lines.length);

    for (let k = startIndex + 1; k < maxIndex; k++) {
      const line = lines[k];
      if (Utils.isNewRecord(line)) break;
      if (Utils.isLink(line)) continue;
      // Only skip code artifacts if they are standalone (not part of name)
      if (Utils.isCodeArtifact(line) && !/^[A-Z]{2,}\d+[-]?[A-ZÁÉÍÓÚÇ]/.test(line)) continue;

      if (this.isNameLine(line)) {
        nameParts.push(line);
        if (this.shouldContinueCollectingName(lines, k)) {
          k++;
          continue;
        }
        break;
      }
    }

    if (nameParts.length > 0) {
      rowData.name = Utils.cleanName(nameParts.join(' '));
    }
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

    this.outputElement.innerHTML = this.buildTableHTML(data.rows, rawText);
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

  buildTableHTML(rows, rawText) {
    return `
      <div class="container">
        <div class="tabs">
          <div class="tab active" onclick="showTab('table', this)">
            <i class="fas fa-table"></i>
            Tabela de Dados (${rows.length})
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
        
        <div id="raw-tab" class="tab-content">
          <div class="raw-text">${rawText}</div>
        </div>
      </div>
    `;
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
    const value = item[field] || 'N/A';
    const isNA = value === 'N/A' || value === '';
    const naClass = isNA ? ' na-value' : '';

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
          this.classList.toggle('na-value', newValue === 'N/A' || newValue === '');
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
      item.age || 'N/A',
      (item.name || 'N/A').replace(/,/g, ';')
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

    // Mostrar status do arquivo selecionado
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
// Wait for DOM to be ready before initializing
document.addEventListener('DOMContentLoaded', () => {
  const App = new UIManager();

  // Expose methods globally for onclick handlers
  window.processCSV = () => App.processCSV();
  window.showTab = (tabName, element) => App.showTab(tabName, element);
  window.downloadCSV = () => App.downloadCSV();
});


