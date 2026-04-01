"use client";
import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Filter, Search, Download } from "lucide-react";
import { Badge, Button, Input } from "./base-ui";
import { F } from "@/utils/formatters";

/**
 * InteractiveDealsTable
 * Refactored version of the Logs Table adapted for Deals.
 */

function exportCSV(columns, rows, filename = 'deals-export.csv') {
  if (!rows.length) return;
  const headers = columns.map(c => c.label);
  const csvRows = [
    headers.join(';'),
    ...rows.map(row =>
      columns.map(col => {
        const val = row[col.key];
        if (val == null) return '—';
        const str = String(val);
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(';')
    ),
  ];
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DealRow({
  deal,
  columns,
  expanded,
  onToggle,
  onRowClick,
}) {
  const formatValue = (value, column) => {
    if (value == null) return '—';
    if (typeof column.format === 'function') return column.format(value);
    if (column.format === 'currency') return F.ri(value);
    if (column.format === 'date') return F.date(value);
    return value;
  };

  // Determine main fields for collapsed view
  const title = deal.title || deal.person_name || "Sem Título";
  const subtitle = deal.person_email || deal.person_phone || deal.segmento || "";
  const value = deal.value ? F.ri(deal.value) : (deal.faturamento ? F.ri(deal.faturamento) : "—");
  const date = deal.deal_created_at || deal.data_reuniao || deal.close_time || "";
  const formattedDate = date ? F.date(date) : "";

  return (
    <div className="border-b border-border-subtle/10 last:border-0">
      <div
        className={`w-full p-4 flex items-center gap-4 transition-colors hover:bg-surface-tertiary/30 cursor-pointer ${
          expanded ? "bg-surface-tertiary/20" : ""
        }`}
        onClick={() => onRowClick?.(deal.id ?? deal.deal_id)}
      >
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 p-1 hover:bg-surface-tertiary rounded-full transition-colors"
        >
          <ChevronDown className="h-4 w-4 text-content-tertiary" />
        </motion.button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-content-primary truncate max-w-[200px]">
              {title}
            </span>
            {deal.status && (
              <Badge
                variant={deal.status === 'won' ? 'default' : (deal.status === 'lost' ? 'destructive' : 'secondary')}
                className="text-[10px] py-0 px-1.5 h-4"
              >
                {deal.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-content-tertiary truncate">
            {subtitle}
          </p>
        </div>

        <div className="hidden md:flex flex-col items-end w-32 flex-shrink-0">
          <span className="text-sm font-mono font-medium text-info tabular">
            {value}
          </span>
          <time className="text-[10px] text-content-tertiary font-mono">
            {formattedDate}
          </time>
        </div>

        <Button 
          size="sm" 
          variant="ghost" 
          className="h-8 w-8 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onRowClick?.(deal.id ?? deal.deal_id);
          }}
        >
          <span className="text-lg">👁️</span>
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden bg-surface-tertiary/10"
          >
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 border-t border-border-subtle/10">
              {columns.map((col) => (
                <div key={col.key} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-content-tertiary">
                    {col.label}
                  </p>
                  <p className={`text-sm ${
                    col.format === 'currency' ? 'font-mono text-positive font-medium' : 'text-content-primary'
                  }`}>
                    {formatValue(deal[col.key], col)}
                  </p>
                </div>
              ))}
              
              <div className="md:col-span-2 lg:col-span-3 pt-4 border-t border-border-subtle/10 flex justify-end">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => onRowClick?.(deal.id ?? deal.deal_id)}
                  className="gap-2"
                >
                  Ver Histórico Completo
                  <span className="text-lg">📜</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterPanel({
  filters,
  onChange,
  filterableColumns,
  rows,
}) {
  const toggleFilter = (category, value) => {
    const current = filters[category] || [];
    const updated = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];

    onChange({
      ...filters,
      [category]: updated,
    });
  };

  const clearAll = () => {
    onChange({});
  };

  const hasActiveFilters = Object.values(filters).some(
    (group) => group && group.length > 0
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.05 }}
      className="flex h-full flex-col space-y-6 overflow-y-auto bg-surface-secondary p-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content-primary uppercase tracking-widest">Filtros</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-6 text-xs text-info hover:text-info/80"
          >
            Limpar Todos
          </Button>
        )}
      </div>

      <div className="space-y-8">
        {filterableColumns.map(col => {
          const uniqueValues = Array.from(new Set(rows.map(r => r[col.key]).filter(v => v != null && v !== '')));
          if (uniqueValues.length === 0) return null;
          
          const selectedValues = filters[col.key] || [];

          return (
            <div key={col.key} className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-content-tertiary">
                {col.label}
              </p>
              <div className="space-y-1.5">
                {uniqueValues.map((val) => {
                  const selected = selectedValues.includes(val);

                  return (
                    <motion.button
                      key={val}
                      type="button"
                      whileHover={{ x: 2 }}
                      onClick={() => toggleFilter(col.key, val)}
                      className={`flex w-full items-center justify-between gap-2 border rounded-lg px-3 py-2 text-xs transition-colors ${
                        selected
                          ? "border-info bg-info/10 text-info"
                          : "border-border-subtle/20 text-content-secondary hover:border-info/40 hover:bg-surface-tertiary"
                      }`}
                    >
                      <span className="truncate">{val}</span>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export default function InteractiveDealsTable({ columns = [], rows = [], onRowClick, title, subtitle }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({});

  const filterableColumns = useMemo(
    () => columns.filter(c => c.filterable),
    [columns]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((deal) => {
      const lowerQuery = searchQuery.toLowerCase();
      
      // Search logic
      const searchFields = [deal.title, deal.person_name, deal.person_email, deal.person_phone].filter(Boolean);
      const matchSearch = searchQuery === "" || searchFields.some(f => f.toLowerCase().includes(lowerQuery));

      // Filter logic
      const matchFilters = Object.entries(filters).every(([key, values]) => {
        if (!values || values.length === 0) return true;
        return values.includes(String(deal[key]));
      });

      return matchSearch && matchFilters;
    });
  }, [rows, searchQuery, filters]);

  const activeFiltersCount = Object.values(filters).reduce((acc, curr) => acc + (curr?.length || 0), 0);

  return (
    <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden flex flex-col min-h-[500px] max-h-[800px]">
      {/* Header Bar */}
      <div className="border-b border-border-subtle/20 bg-surface-tertiary/10 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-content-primary tracking-tight">
              {title || "Deals"}
            </h2>
            <p className="text-xs text-content-tertiary font-medium">
              {filteredRows.length} de {rows.length} registros
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary" />
              <Input
                placeholder="Buscar deals..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-9 pl-9 text-xs border-border-subtle/20 bg-surface-secondary focus-visible:ring-info/40"
              />
            </div>
            
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters((current) => !current)}
              className="relative h-9 px-3 border-border-subtle/20"
            >
              <Filter className="h-4 w-4 mr-2" />
              <span className="text-xs font-medium">Filtros</span>
              {activeFiltersCount > 0 && (
                <Badge className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center p-0 text-[10px] bg-negative border-2 border-surface-secondary">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCSV(columns, filteredRows, `${(title || 'deals').toLowerCase().replace(/\s+/g, '-')}.csv`)}
              className="h-9 px-3 border-border-subtle/20"
              title="Exportar CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              key="filters"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden border-r border-border-subtle/20 bg-surface-primary/30 z-10"
            >
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                filterableColumns={filterableColumns}
                rows={rows}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="divide-y divide-border-subtle/10">
            <AnimatePresence mode="popLayout">
              {filteredRows.length > 0 ? (
                filteredRows.map((deal, index) => (
                  <motion.div
                    key={deal.id ?? deal.deal_id ?? index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{
                      duration: 0.2,
                      delay: Math.min(index * 0.01, 0.2),
                    }}
                  >
                    <DealRow
                      deal={deal}
                      columns={columns}
                      expanded={expandedId === (deal.id ?? deal.deal_id)}
                      onToggle={() =>
                        setExpandedId((current) =>
                          current === (deal.id ?? deal.deal_id) ? null : (deal.id ?? deal.deal_id)
                        )
                      }
                      onRowClick={onRowClick}
                    />
                  </motion.div>
                ))
              ) : (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-12 text-center"
                >
                  <p className="text-lg mb-2">🔍</p>
                  <p className="text-sm text-content-tertiary">
                    Nenhum deal corresponde aos seus filtros.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-surface-tertiary/5 border-t border-border-subtle/20 px-6 py-3 flex justify-between items-center text-[10px] text-content-tertiary uppercase tracking-wider font-bold">
        <span>AwSales Intelligent Table</span>
        <span>{filteredRows.length} registros exibidos</span>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
