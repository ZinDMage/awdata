import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { F } from '@/utils/formatters';

const PAGE_SIZE = 15;

/**
 * DealsTable — Story 4.1
 * Tabela genérica com busca, filtro avançado, paginação e colunas dinâmicas.
 * Props-only, zero Context direto. (FR61, FR62, FR63, UX-DR24)
 */
export default function DealsTable({ columns = [], rows = [], onRowClick, title, subtitle }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Debounced search via controlled input + useMemo filtering
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef(null);

  // P1: Cleanup debounce timer on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // P6: Reset page when rows change (e.g. tab switch)
  useEffect(() => { setCurrentPage(1); }, [rows]);

  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
      setCurrentPage(1);
    }, 200);
  }, []);

  // Text columns for search matching
  const textKeys = useMemo(
    () => columns.filter(c => !c.format || c.format === 'text').map(c => c.key),
    [columns]
  );

  // Filtered rows (search + advanced filters)
  const filteredRows = useMemo(() => {
    let result = [...rows];

    // Search filter
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter(row =>
        textKeys.some(key => {
          const val = row[key];
          return val != null && String(val).toLowerCase().includes(q);
        })
      );
    }

    // Advanced filters
    for (const [key, value] of Object.entries(activeFilters)) {
      if (value != null && value !== '') {
        result = result.filter(row => String(row[key]) === String(value));
      }
    }

    return result;
  }, [rows, debouncedQuery, textKeys, activeFilters]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, filteredRows.length);
  const paginatedRows = filteredRows.slice(startIdx, endIdx);

  // Format cell value using column format function or formatter key
  const formatValue = useCallback((value, column) => {
    if (value == null) return '—';
    if (typeof column.format === 'function') return column.format(value);
    if (column.format === 'currency') return F.ri(value);
    if (column.format === 'date') return value;
    return value;
  }, []);

  // Check if column is numeric/monetary for tabular-nums class
  const isNumericColumn = useCallback((column) => {
    return typeof column.format === 'function' ||
      column.format === 'currency' ||
      column.format === 'number';
  }, []);

  // Unique filter values for advanced filter dropdown
  const filterableColumns = useMemo(
    () => columns.filter(c => c.filterable),
    [columns]
  );

  const handleFilterToggle = useCallback((key, value) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      if (next[key] === value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
    setCurrentPage(1);
  }, []);

  return (
    <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden">
      {/* Header */}
      {title && (
        <div className="px-6 pt-6">
          <h3 className="text-lg font-medium text-content-primary">{title}</h3>
          {subtitle && <p className="text-sm text-content-tertiary">{subtitle}</p>}
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 px-6 py-4">
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Buscar..."
          aria-label="Buscar deals"
          className="bg-surface-tertiary rounded-control px-4 py-2 text-sm text-content-primary placeholder:text-content-tertiary flex-1 outline-none focus:ring-1 focus:ring-info/40"
        />
        {filterableColumns.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setFilterOpen(prev => !prev)}
              className="bg-surface-tertiary rounded-control px-4 py-2 text-sm text-content-primary border border-border-subtle/20 hover:bg-surface-primary transition-colors"
            >
              Filtrar
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-surface-secondary rounded-control border border-border-subtle/20 shadow-lg p-3 min-w-[200px]">
                {filterableColumns.map(col => {
                  const uniqueValues = [...new Set(rows.map(r => r[col.key]).filter(v => v != null && v !== ''))];
                  return (
                    <div key={col.key} className="mb-3 last:mb-0">
                      <p className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-1">{col.label}</p>
                      <div className="flex flex-wrap gap-1">
                        {uniqueValues.map(val => (
                          <button
                            key={val}
                            onClick={() => handleFilterToggle(col.key, val)}
                            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                              activeFilters[col.key] === val
                                ? 'bg-info/10 text-info'
                                : 'bg-surface-tertiary text-content-secondary hover:bg-surface-primary'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {paginatedRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-content-tertiary">
          <span className="text-3xl mb-3" aria-hidden="true">🔍</span>
          <p className="text-sm">Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    scope="col"
                    className="text-xs font-medium text-content-tertiary uppercase tracking-wider px-4 py-3 border-b border-border-subtle/20 text-left"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, i) => (
                <tr
                  key={row.id ?? row.deal_id ?? i}
                  onClick={() => onRowClick?.(row.id ?? row.deal_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick?.(row.id ?? row.deal_id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className="hover:bg-surface-tertiary/50 transition-colors cursor-pointer"
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm border-b border-border-subtle/10 ${
                        isNumericColumn(col)
                          ? 'tabular text-content-primary font-medium'
                          : 'text-content-primary'
                      }${col.format === 'currency' ? ' text-positive font-medium tabular' : ''
                      }${col.format === 'badge' ? ' text-info text-xs underline underline-offset-2' : ''}`}
                    >
                      {formatValue(row[col.key], col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filteredRows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-content-tertiary px-6 py-3 border-t border-border-subtle/10">
          <span>Mostrando {startIdx + 1}-{endIdx} de {filteredRows.length}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1 rounded-control bg-surface-tertiary hover:bg-surface-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1 rounded-control bg-surface-tertiary hover:bg-surface-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
