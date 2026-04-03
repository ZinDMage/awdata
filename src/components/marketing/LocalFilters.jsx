// UX-DR13, FR123: Filtros locais — status pills + busca + ordenacao + export
import { useState, useEffect, useRef } from 'react';

// ── Constantes ──────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { id: 'all',    label: 'Todas' },
  { id: 'active', label: 'Ativa' },
  { id: 'paused', label: 'Pausada' },
];

const DEBOUNCE_MS = 300;

// ── Funcoes puras de filtragem/ordenacao (named exports) ────────────

/** Filtra items por status (active/paused/all). Normaliza com toLowerCase. */
export function filterByStatus(items, status) {
  if (!items) return [];
  if (!status || status === 'all') return items;
  return items.filter(item =>
    (item.status || item.effective_status || '').toLowerCase() === status
  );
}

/** Filtra items por texto no campo de nome (case-insensitive, trimmed). */
export function filterBySearch(items, query, nameField = 'campaign_name') {
  if (!items) return [];
  if (!query || !query.trim()) return items;
  const q = query.toLowerCase().trim();
  return items.filter(item =>
    (item[nameField] || '').toLowerCase().includes(q)
  );
}

/** Ordenacao estavel por coluna. Suporta number e string (pt-BR locale). */
export function sortByColumn(items, column, direction = 'desc') {
  if (!items) return [];
  if (!column) return items;
  return [...items].sort((a, b) => {
    const rawA = a[column];
    const rawB = b[column];
    const isStr = typeof rawA === 'string' || typeof rawB === 'string';
    const va = rawA ?? (isStr ? '' : 0);
    const vb = rawB ?? (isStr ? '' : 0);
    if (isStr) return direction === 'asc'
      ? String(va).localeCompare(String(vb), 'pt-BR')
      : String(vb).localeCompare(String(va), 'pt-BR');
    return direction === 'asc' ? va - vb : vb - va;
  });
}

// ── Componente LocalFilters ─────────────────────────────────────────

function handleRadioKeyDown(e, statusFilter, onStatusChange) {
  const ids = STATUS_OPTIONS.map(o => o.id);
  const current = ids.indexOf(statusFilter ?? 'all');
  let next = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    next = (current + 1) % ids.length;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    next = (current - 1 + ids.length) % ids.length;
  }
  if (next >= 0) {
    e.preventDefault();
    onStatusChange(ids[next]);
  }
}

export default function LocalFilters({
  statusFilter,
  onStatusChange,
  searchQuery,
  onSearchChange,
  sortColumn,
  sortDirection,
  onSort,
  onExport,
}) {
  // Estado interno para debounce da busca
  const [inputValue, setInputValue] = useState(searchQuery ?? '');
  const onSearchChangeRef = useRef(onSearchChange);
  const isFirstRender = useRef(true);
  const pillsRef = useRef(null);
  onSearchChangeRef.current = onSearchChange;

  // Debounce: propaga valor apos DEBOUNCE_MS (skip first render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => onSearchChangeRef.current(inputValue), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Sync externo: se searchQuery prop mudar externamente (ex: reset)
  useEffect(() => {
    setInputValue(searchQuery ?? '');
  }, [searchQuery]);

  // Focus na pill ativa quando statusFilter muda (arrow key nav)
  useEffect(() => {
    if (!pillsRef.current) return;
    const active = pillsRef.current.querySelector('[aria-checked="true"]');
    if (active && pillsRef.current.contains(document.activeElement)) active.focus();
  }, [statusFilter]);

  return (
    <div
      className="flex items-center gap-3 flex-wrap py-2"
      role="toolbar"
      aria-label="Filtros de performance"
    >
      {/* Status Pills */}
      <div
        role="radiogroup"
        aria-label="Filtro por status"
        ref={pillsRef}
        onKeyDown={e => handleRadioKeyDown(e, statusFilter, onStatusChange)}
      >
        <div className="flex items-center gap-1.5">
          {STATUS_OPTIONS.map(opt => {
            const isActive = (statusFilter ?? 'all') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onStatusChange(opt.id)}
                className={`
                  px-3.5 py-1 text-xs rounded-full border-none cursor-pointer
                  transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
                  ${isActive
                    ? 'bg-[#007AFF] text-white font-semibold'
                    : 'bg-[var(--color-background-secondary)] text-[var(--color-text-tertiary)]'
                  }
                `}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-7 bg-[var(--color-border-secondary)]/50" aria-hidden="true" />

      {/* Search Input */}
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]/50"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Buscar campanha ou anuncio..."
          aria-label="Buscar campanha ou anuncio"
          className="
            w-64 pl-8 pr-3 py-1.5 text-sm rounded-xl
            bg-[var(--color-background-secondary)]/50
            border border-[var(--color-border-secondary)]/30
            text-[var(--color-text-primary)]
            placeholder:text-[var(--color-text-tertiary)]/50
            focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30
            transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          "
        />
      </div>

      {/* Divider */}
      <div className="w-px h-7 bg-[var(--color-border-secondary)]/50" aria-hidden="true" />

      {/* Export CSV Button */}
      <button
        type="button"
        onClick={onExport}
        disabled={!onExport}
        title={!onExport ? 'Em breve' : 'Exportar CSV'}
        aria-label="Exportar CSV"
        className={`
          flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium
          border-none
          transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${onExport
            ? 'cursor-pointer bg-[var(--color-background-secondary)]/50 text-[var(--color-text-secondary)] hover:bg-[var(--color-background-secondary)]'
            : 'cursor-not-allowed bg-[var(--color-background-secondary)]/50 text-[var(--color-text-secondary)] opacity-50'
          }
        `}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export CSV
      </button>
    </div>
  );
}
