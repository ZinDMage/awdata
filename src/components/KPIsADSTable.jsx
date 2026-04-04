import { useState, useMemo, useCallback } from 'react';
import { F } from '@/utils/formatters';
import EmptyState from '@/components/EmptyState';

// FR96, FR97, AD-V3-6: Tabela comparativa Multi-Source — props puras, sem context

// ── SECTIONS config (declarativa) — FR96, FR99 ──────────────────

const SECTIONS = [
  {
    key: 'premissas',
    label: '% Premissas',
    accentColor: '#007AFF',
    rows: [
      { label: '% CTR',                                  metricKey: 'ctr',  format: F.p },
      { label: '% Connect Rate (View Page / Cliques)',    metricKey: 'cr',   format: F.p },
      { label: '% Conversão Página de Captura',           metricKey: 'cc',   format: F.p },
      { label: '% Qualified Marketing (MQL / Lead)',      metricKey: 'qm',   format: F.p },
    ],
  },
  {
    key: 'numeros',
    label: '# Números',
    accentColor: '#FF9500',
    rows: [
      { label: '# Impressões',          metricKey: 'impressions', format: F.n },
      { label: '# Cliques Saída Única', metricKey: 'clicks',      format: F.n },
      { label: '# View Page',           metricKey: 'pageViews',   format: F.n },
      { label: '# Leads',               metricKey: 'leads',       format: F.n },
      { label: '# MQL',                 metricKey: 'mqls',        format: F.n },
      { label: '# SQL',                 metricKey: 'sqls',        format: F.n },
      { label: '# Reuniões Agendadas',  metricKey: 'reunioes',    format: F.n },
      { label: '# Propostas',           metricKey: 'propostas',   format: F.n },
      { label: '# Vendas',              metricKey: 'sales',       format: F.n },
    ],
  },
  {
    key: 'financeiro',
    label: 'R$ Financeiro',
    accentColor: '#FF453A',
    rows: [
      { label: 'R$ Gasto em ADS',            metricKey: 'spend',      format: F.ri },
      { label: 'R$ Custo por Mil Impressões',  metricKey: 'cpm',        format: F.r2 },
      { label: 'R$ Custo por Clique Único',   metricKey: 'cpc',        format: F.r2 },
      { label: 'R$ Custo por View Page',      metricKey: 'cpv',        format: F.r2 },
      { label: 'R$ Custo por Lead',           metricKey: 'cpl',        format: F.r2 },
      { label: 'R$ Custo por MQL',            metricKey: 'cpmql',      format: F.r2 },
      { label: 'R$ Custo por SQL',            metricKey: 'cpsql',      format: F.r2 },
      { label: 'R$ Custo por Reunião',        metricKey: 'cpreuniao',  format: F.r2 },
      { label: 'R$ Custo por Proposta',       metricKey: 'cpproposta', format: F.r2 },
      { label: 'R$ Custo de Aquisição',        metricKey: 'cac',        format: F.r2 },
      { label: 'Retorno sobre Gasto em ADS',  metricKey: 'roas',       format: F.x },
    ],
  },
];

// FR122: Ordem fixa das colunas source na tabela
const TABLE_SOURCES = ['Meta', 'Google', 'LinkedIn', 'Orgânico', 'S/Track'];

// ── Helpers ─────────────────────────────────────────────────────

/** FR122, FR131: LinkedIn sem dados reais → "Em breve" */
const isLinkedinEmpty = (data) => {
  const li = data?.bySource?.LinkedIn;
  return !li || (li.spend === 0 && li.impressions === 0 && li.leads === 0);
};

// ── Skeleton (loading state) ────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="rounded-2xl bg-surface-secondary/60 p-5 animate-pulse">
      {/* Header row */}
      <div className="flex gap-4 mb-4">
        <div className="h-4 w-32 rounded bg-surface-tertiary" />
        {Array.from({ length: TABLE_SOURCES.length + 1 }, (_, i) => (
          <div key={i} className="h-4 flex-1 rounded bg-surface-tertiary" />
        ))}
      </div>
      {/* 3 sections × rows */}
      {[4, 9, 11].map((rowCount, si) => (
        <div key={si} className="mb-4">
          <div className="h-5 w-28 rounded bg-surface-tertiary mb-3" />
          {Array.from({ length: rowCount }, (_, i) => (
            <div key={i} className="flex gap-4 mb-2">
              <div className="h-3.5 w-40 rounded bg-surface-tertiary" />
              {Array.from({ length: TABLE_SOURCES.length + 1 }, (_, j) => (
                <div key={j} className="h-3.5 flex-1 rounded bg-surface-tertiary" />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────────

function SectionHeader({ label, accentColor, expanded, onToggle }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <tr
      className="cursor-pointer select-none hover:bg-surface-secondary/50 transition-colors duration-150"
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
    >
      <td colSpan={TABLE_SOURCES.length + 2} className="px-4 py-3 font-medium text-sm">
        <div className="flex items-center gap-2">
          <span
            className="w-1 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <span className={`transition-transform duration-200 text-xs ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span>{label}</span>
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ──────────────────────────────────────────────

// Story 3.6: CATEGORY_HIGHLIGHT — mapeamento categoria donut → metricKeys relevantes (FR104)
const CATEGORY_HIGHLIGHT = {
  'MQL': ['leads', 'mqls', 'qm', 'cc', 'cpl', 'cpmql'],
  'SQL': ['mqls', 'sqls', 'cpsql', 'cac'],
  'Não Qualificados': ['leads', 'mqls', 'sqls'],
};

export default function KPIsADSTable({ data, loading, error, donutFilter, onClearDonutFilter }) {
  // AC #3: todas as seções iniciam expandidas
  const [expandedSections, setExpandedSections] = useState(() =>
    Object.fromEntries(SECTIONS.map(s => [s.key, true]))
  );

  const linkedinEmpty = useMemo(() => isLinkedinEmpty(data), [data]);

  // Story 3.6: derive highlighted metric keys from donutFilter
  const highlightedKeys = useMemo(() => {
    if (!donutFilter) return null;
    return CATEGORY_HIGHLIGHT[donutFilter] || null;
  }, [donutFilter]);

  const toggleSection = useCallback((key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Task 5: Loading state — AC #10
  if (loading) return <TableSkeleton />;

  // Task 5: Error state
  if (error) return <EmptyState message={error} />;

  // Task 5: Empty data state
  if (!data) return <EmptyState message="Sem dados de ads para o período selecionado" />;

  return (
    // AC #12: desktop >1024px — largura total do container (NFR28)
    <div className="w-full">
      {/* Story 3.6: chip de filtro ativo (AC #4, UX-DR18) */}
      {donutFilter && (
        <div className="flex items-center gap-2 mb-3 px-4">
          <span className="text-xs bg-accent/10 text-accent px-2.5 py-1 rounded-full flex items-center gap-1.5">
            {donutFilter}
            <button
              onClick={onClearDonutFilter}
              className="hover:text-content-primary transition-colors"
              aria-label={`Filtro ativo: ${donutFilter}. Clique para remover`}
            >
              ×
            </button>
          </span>
        </div>
      )}
    <div className="max-h-[75vh] overflow-auto rounded-2xl bg-surface-secondary/60">
      <table className="w-full border-collapse text-sm">
        {/* AC #6: sticky header — UX-DR5 */}
        <thead className="sticky top-0 z-10 bg-surface-secondary/85 backdrop-blur-sm">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-content-secondary text-xs uppercase tracking-wide">
              Métrica
            </th>
            {TABLE_SOURCES.map(source => (
              <th key={source} className="px-4 py-2.5 text-right font-medium text-content-secondary text-xs uppercase tracking-wide">
                {source}
              </th>
            ))}
            <th className="px-4 py-2.5 text-right font-medium text-content-secondary text-xs uppercase tracking-wide">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {SECTIONS.map(section => (
            <Section
              key={section.key}
              section={section}
              expanded={expandedSections[section.key]}
              onToggle={() => toggleSection(section.key)}
              data={data}
              linkedinEmpty={linkedinEmpty}
              highlightedKeys={highlightedKeys}
            />
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

// ── Section + Rows ──────────────────────────────────────────────

function Section({ section, expanded, onToggle, data, linkedinEmpty, highlightedKeys }) {
  return (
    <>
      <SectionHeader
        label={section.label}
        accentColor={section.accentColor}
        expanded={expanded}
        onToggle={onToggle}
      />
      {expanded && section.rows.map(row => (
        <MetricRow
          key={row.metricKey}
          row={row}
          data={data}
          linkedinEmpty={linkedinEmpty}
          highlightedKeys={highlightedKeys}
        />
      ))}
    </>
  );
}

function MetricRow({ row, data, linkedinEmpty, highlightedKeys }) {
  const { label, metricKey, format } = row;

  // Story 3.6: highlight/dim based on donut drill-down filter (AC #1, #4)
  const isHighlighted = highlightedKeys ? highlightedKeys.includes(metricKey) : false;
  const isDimmed = highlightedKeys ? !isHighlighted : false;

  return (
    <tr className={`border-t border-border-primary/10 hover:bg-surface-secondary/30 transition-colors duration-100${isHighlighted ? ' bg-accent/5 font-semibold' : ''}${isDimmed ? ' opacity-40' : ''}`}>
      {/* Coluna Métrica — AC #5: nomenclatura descritiva completa, FR99 */}
      <td className="px-4 py-2.5 text-sm text-content-primary whitespace-nowrap">
        {label}
      </td>

      {/* Colunas por source — AC #1, AC #11: tabular-nums */}
      {TABLE_SOURCES.map(source => {
        // AC #4: LinkedIn sem dados → "Em breve" (FR122, FR131)
        if (source === 'LinkedIn' && linkedinEmpty) {
          return (
            <td key={source} className="px-4 py-2.5 text-right text-content-tertiary italic text-sm">
              Em breve
            </td>
          );
        }

        const value = data.bySource?.[source]?.[metricKey];
        return (
          <td key={source} className="px-4 py-2.5 text-right text-sm tabular-nums text-content-primary">
            {format(value)}
          </td>
        );
      })}

      {/* Coluna Total — AC #11: tabular-nums */}
      <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-content-primary">
        {format(data.totals?.[metricKey])}
      </td>
    </tr>
  );
}
