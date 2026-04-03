import { useState, useCallback } from 'react';

// ── Constantes ──
const CSV_SEPARATOR = ';';
const CSV_BOM = '\uFEFF';
const CSV_MIME = 'text/csv;charset=utf-8;';
const FILENAME_PREFIX = 'awdata';

// ── Format Types ── // FR124
const FORMAT_TYPES = {
  currency: v => v == null || isNaN(Number(v)) ? '—' : String(Number(v).toFixed(2)).replace('.', ','),
  percent:  v => v == null || isNaN(Number(v)) ? '—' : String((Number(v) * 100).toFixed(2)).replace('.', ',') + '%',
  decimal:  v => v == null || isNaN(Number(v)) ? '—' : String(Number(v).toFixed(2)).replace('.', ','),
  integer:  v => v == null || isNaN(Number(v)) ? '—' : String(Math.round(Number(v))),
  text:     v => v == null ? '—' : String(v),
};

// ── Helpers (internos) ──

function escapeCSVField(value) {
  const str = String(value);
  if (str.includes(CSV_SEPARATOR) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateFilename(viewName) {
  const date = new Date().toISOString().slice(0, 10);
  return `${FILENAME_PREFIX}-${viewName}-${date}.csv`;
}

// ── Named Exports ──

/** Formata valor para CSV brasileiro (AC #4) */
export function formatCSVValue(value, type = 'text') {
  const formatter = FORMAT_TYPES[type] || FORMAT_TYPES.text;
  return formatter(value);
}

/** Gera string CSV completa — BOM + headers + rows (AC #1, #4) */
export function buildCSVContent(columns, rows) {
  if (!columns?.length || !rows) return '';
  const headers = columns.map(c => escapeCSVField(c.label)).join(CSV_SEPARATOR);
  const dataRows = rows.map(row =>
    columns.map(col => {
      const formatted = formatCSVValue(row[col.key], col.type);
      return escapeCSVField(formatted);
    }).join(CSV_SEPARATOR)
  );
  return CSV_BOM + [headers, ...dataRows].join('\n');
}

/** Trigger download de string CSV via Blob + <a> (AC #1) */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: CSV_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export simples: dados em memória → CSV download (AC #1) */
export function exportToCSV({ columns, rows, viewName }) {
  if (!rows || !rows.length) return;
  const content = buildCSVContent(columns, rows);
  downloadCSV(content, generateFilename(viewName));
}

/** Export multi-página: busca todas as páginas sequencialmente → CSV download (AC #3, #5) */
export async function exportAllPagesCSV({ fetchPage, totalPages, columns, viewName, onProgress, onWarning }) {
  if (!totalPages || totalPages <= 0 || !isFinite(totalPages)) {
    onWarning?.('Nenhum dado disponível para exportação');
    return;
  }
  const allRows = [];
  let partial = false;
  let successPages = 0;

  for (let page = 1; page <= totalPages; page++) {
    try {
      const rows = await fetchPage(page);
      allRows.push(...rows);
      successPages = page;
    } catch (err) {
      console.warn(`[ExportCSV] Falha na página ${page}/${totalPages}:`, err);
      partial = true;
      break;
    }
    onProgress?.(page, totalPages);
  }

  if (allRows.length === 0) {
    onWarning?.('Nenhum dado disponível para exportação');
    return;
  }

  let content = buildCSVContent(columns, allRows);
  if (partial) {
    const padCols = columns.length > 1 ? CSV_SEPARATOR.repeat(columns.length - 1) : '';
    content += `\n"⚠ Export incompleto — dados parciais"${padCols}`;
    onWarning?.(`Export parcial — ${successPages} de ${totalPages} páginas exportadas. Tente novamente para dados completos.`);
  }

  downloadCSV(content, generateFilename(viewName));
}

/** Hook para state management do export — loading e progress (AC #3) */
export function useExportCSV() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(null);

  const startExport = useCallback(async (exportFn) => {
    setExporting(true);
    setProgress(null);
    try {
      await exportFn();
    } catch (err) {
      console.error('[ExportCSV] Export falhou:', err);
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }, []);

  return { exporting, progress, setProgress, startExport };
}
