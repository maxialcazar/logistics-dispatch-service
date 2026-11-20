export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
}

export interface ParseCsvOptions {
  /** Stop parsing once data rows exceed this cap (prevents CPU/memory DoS on huge files). */
  maxRows?: number;
  /** Optional header mapper (e.g. snake_case to camelCase). */
  normalizeHeader?: (header: string) => string;
}

const FORMULA_INJECTION_REGEX = /^(?:[=+\-@\t\r]| +[=+\-@\t\r])/;

/**
 * Parses an RFC-4180 compliant CSV string into headers and keyed row objects.
 * Supports UTF-8 BOM, CRLF/LF line endings, quoted commas, doubled quotes (""),
 * and embedded newlines inside quoted fields.
 */
export function parseCsv(input: string, options: ParseCsvOptions = {}): ParsedCsvResult {
  const cleanInput = input.startsWith("\uFEFF") ? input.slice(1) : input;
  if (cleanInput.trim().length === 0) {
    return { headers: [], rows: [] };
  }

  const records: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let fieldStarted = false;
  let justClosedQuote = false;

  const pushRecord = () => {
    const isCompletelyBlankLine = fields.length === 0 && !fieldStarted && current === "";
    if (!isCompletelyBlankLine) {
      fields.push(current);
      records.push(fields);
    }
    fields = [];
    current = "";
    fieldStarted = false;
    justClosedQuote = false;
  };

  for (let i = 0; i < cleanInput.length; i += 1) {
    const ch = cleanInput[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < cleanInput.length && cleanInput[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (justClosedQuote) {
      if (ch === ",") {
        fields.push(current);
        current = "";
        fieldStarted = false;
        justClosedQuote = false;
        continue;
      }
      if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && cleanInput[i + 1] === "\n") {
          i += 1;
        }
        pushRecord();
        if (options.maxRows !== undefined && records.length - 1 >= options.maxRows) {
          break;
        }
        continue;
      }
      throw new CsvParseError("Unexpected character after closing quote in CSV field");
    }

    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }

    if (ch === '"') {
      throw new CsvParseError("Unexpected quote inside unquoted CSV field");
    }

    if (ch === ",") {
      fields.push(current);
      current = "";
      fieldStarted = false;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && cleanInput[i + 1] === "\n") {
        i += 1;
      }
      pushRecord();
      if (options.maxRows !== undefined && records.length - 1 >= options.maxRows) {
        break;
      }
      continue;
    }

    current += ch;
    fieldStarted = true;
  }

  if (inQuotes) {
    throw new CsvParseError("Unterminated quoted field in CSV");
  }

  if (options.maxRows === undefined || records.length - 1 < options.maxRows) {
    if (fields.length > 0 || fieldStarted || current !== "") {
      pushRecord();
    }
  }

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = records[0];
  const headers: string[] = [];
  const seenHeaders = new Set<string>();

  for (const rawHeader of rawHeaders) {
    const trimmed = rawHeader.trim();
    if (!trimmed) {
      throw new CsvParseError("CSV header names cannot be empty");
    }
    const normalized = options.normalizeHeader ? options.normalizeHeader(trimmed) : trimmed;
    if (seenHeaders.has(normalized)) {
      throw new CsvParseError(`Duplicate CSV column header: ${normalized}`);
    }
    seenHeaders.add(normalized);
    headers.push(normalized);
  }

  const rows: Record<string, string>[] = [];
  for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
    const record = records[rowIndex];
    if (record.length > headers.length) {
      throw new CsvParseError(
        `CSV row ${rowIndex} has ${record.length} columns, expected at most ${headers.length}`
      );
    }

    const rowObj: Record<string, string> = {};
    for (let colIndex = 0; colIndex < headers.length; colIndex += 1) {
      rowObj[headers[colIndex]] = record[colIndex] ?? "";
    }
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Neutralizes spreadsheet formula injection (OWASP CSV Injection) by prefixing
 * values that start with =, +, -, @, tab, or carriage return (with optional leading spaces).
 */
export function sanitizeCsvFormulaCell(value: string): string {
  return FORMULA_INJECTION_REGEX.test(value) ? `'${value}` : value;
}

/**
 * Escapes a value as an RFC-4180 CSV cell with formula injection mitigation.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const raw = value instanceof Date ? value.toISOString() : String(value);
  const safe = sanitizeCsvFormulaCell(raw);

  if (safe.includes('"') || safe.includes(",") || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }

  return safe;
}

/**
 * Serializes rows into an RFC-4180 CSV string using CRLF line endings.
 */
export function serializeCsv(
  headers: readonly string[],
  rows: readonly Record<string, unknown>[]
): string {
  const headerLine = headers.map((header) => escapeCsvCell(header)).join(",");
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvCell(row[header])).join(",")
  );
  return [headerLine, ...dataLines].join("\r\n");
}
