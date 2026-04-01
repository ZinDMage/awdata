import { useMemo, useState } from 'react';
import { STAGE_IDS } from '@/config/pipedrive';

/**
 * Stage columns for the objection matrix — Proposta sub-stages only.
 */
const STAGE_COLUMNS = [
  { key: 'proposta', label: 'Proposta Feita', icon: '📝', stageIds: new Set(STAGE_IDS.PROPOSTA) },
  { key: 'contrato', label: 'Contrato Enviado', icon: '📄', stageIds: new Set(STAGE_IDS.CONTRATO_ENVIADO) },
];

/** Generate month options for the last 24 months */
function generateMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    opts.push({ value: `${y}-${m}`, label: d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) });
  }
  return opts;
}

const MONTH_OPTIONS = generateMonthOptions();

function classifyStage(stageId) {
  for (const col of STAGE_COLUMNS) {
    if (col.stageIds.has(stageId)) return col.key;
  }
  return null;
}

function isInPeriod(deal, startMonth, endMonth) {
  const dateStr = deal.deal_created_at;
  if (!dateStr) return false;
  const mk = String(dateStr).slice(0, 7);
  return mk >= startMonth && mk <= endMonth;
}

/**
 * Parse objections from a deal's cf_objecoes field.
 * Handles comma-separated, semicolon-separated, and single values.
 */
function parseObjections(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

/**
 * ObjectionMatrix — Matriz de objeções pós-call (objeção × etapa)
 * Rows: objection values, Columns: proposta sub-stages, Cells: deal count
 */
export default function ObjectionMatrix({ deals }) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState(currentMonth);

  const handleStartChange = (v) => {
    if (v > endMonth) { setStartMonth(v); setEndMonth(v); }
    else setStartMonth(v);
  };
  const handleEndChange = (v) => {
    if (v < startMonth) { setEndMonth(v); setStartMonth(v); }
    else setEndMonth(v);
  };

  const filteredDeals = useMemo(() => {
    if (!deals?.length) return [];
    return deals.filter(d => isInPeriod(d, startMonth, endMonth));
  }, [deals, startMonth, endMonth]);

  const periodLabel = useMemo(() => {
    const fmt = (ym) => {
      const [y, m] = ym.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    };
    if (startMonth === endMonth) return fmt(startMonth);
    return `${fmt(startMonth)} — ${fmt(endMonth)}`;
  }, [startMonth, endMonth]);

  const { objections, matrix, stageTotals, grandTotal } = useMemo(() => {
    if (!filteredDeals.length) return { objections: [], matrix: {}, stageTotals: {}, grandTotal: 0 };

    const mat = {};
    const sTotals = {};
    STAGE_COLUMNS.forEach(c => { sTotals[c.key] = 0; });

    for (const d of filteredDeals) {
      const parsed = parseObjections(d.cf_objecoes);
      if (!parsed.length) continue;

      const stageKey = classifyStage(d.stage_id);
      if (!stageKey) continue;

      for (const objection of parsed) {
        if (!mat[objection]) {
          mat[objection] = {};
          STAGE_COLUMNS.forEach(c => { mat[objection][c.key] = 0; });
          mat[objection]._total = 0;
        }
        mat[objection][stageKey]++;
        mat[objection]._total++;
        sTotals[stageKey]++;
      }
    }

    const sorted = Object.keys(mat).sort((a, b) => mat[b]._total - mat[a]._total);
    const gTotal = sorted.reduce((sum, r) => sum + mat[r]._total, 0);

    return { objections: sorted, matrix: mat, stageTotals: sTotals, grandTotal: gTotal };
  }, [filteredDeals]);

  return (
    <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden">
      {/* Header with period filter */}
      <div className="px-6 py-4 border-b border-border-subtle/20 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-content-primary">Matriz de Objeção — Pós Call</h3>
          <p className="text-xs text-content-tertiary mt-0.5">
            {grandTotal} objeções registradas · {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-content-tertiary">Início:</label>
          <select
            value={startMonth}
            onChange={(e) => handleStartChange(e.target.value)}
            className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info"
          >
            {MONTH_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <label className="text-xs text-content-tertiary">Fim:</label>
          <select
            value={endMonth}
            onChange={(e) => handleEndChange(e.target.value)}
            className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info"
          >
            {MONTH_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Matrix table or empty state */}
      {grandTotal === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-content-tertiary text-sm">Nenhuma objeção registrada no período</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#b8860b]/20">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 min-w-[220px] sticky left-0 bg-[#b8860b]/20 z-10">
                  Objeção
                </th>
                {STAGE_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="text-center px-3 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 whitespace-nowrap"
                  >
                    {col.icon} {col.label}
                  </th>
                ))}
                <th className="text-center px-3 py-2.5 text-xs font-bold text-[#d4a634] border-b border-border-subtle/30">
                  Total
                </th>
                <th className="text-center px-3 py-2.5 text-xs font-bold text-[#d4a634] border-b border-border-subtle/30">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {objections.map((objection, i) => {
                const row = matrix[objection];
                const pct = grandTotal > 0 ? ((row._total / grandTotal) * 100).toFixed(1) : '0.0';
                const isHighlight = parseFloat(pct) >= 20;

                return (
                  <tr
                    key={objection}
                    className={`border-b border-border-subtle/10 transition-colors hover:bg-white/[0.03] ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'}`}
                  >
                    <td className="px-4 py-2 text-content-secondary text-right text-xs font-medium sticky left-0 bg-surface-secondary z-10 border-r border-border-subtle/10">
                      {objection}
                    </td>
                    {STAGE_COLUMNS.map(col => {
                      const val = row[col.key];
                      return (
                        <td
                          key={col.key}
                          className={`text-center px-3 py-2 tabular-nums ${val > 0 ? 'text-content-primary font-medium' : 'text-content-tertiary/50'}`}
                        >
                          {val}
                        </td>
                      );
                    })}
                    <td className="text-center px-3 py-2 font-semibold text-content-primary tabular-nums">
                      {row._total}
                    </td>
                    <td className={`text-center px-3 py-2 tabular-nums font-medium ${isHighlight ? 'text-negative' : 'text-content-secondary'}`}>
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-white/[0.05] border-t border-border-subtle/30">
                <td className="px-4 py-2.5 text-right text-xs font-bold text-content-primary sticky left-0 bg-surface-secondary z-10 border-r border-border-subtle/10">
                  Total
                </td>
                {STAGE_COLUMNS.map(col => (
                  <td key={col.key} className="text-center px-3 py-2.5 font-bold text-content-primary tabular-nums">
                    {stageTotals[col.key]}
                  </td>
                ))}
                <td className="text-center px-3 py-2.5 font-bold text-content-primary tabular-nums">
                  {grandTotal}
                </td>
                <td className="text-center px-3 py-2.5 font-bold text-content-primary tabular-nums">
                </td>
              </tr>
              {grandTotal > 0 && (
                <tr className="bg-[#b8860b]/10 border-t border-border-subtle/20">
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-[#d4a634] sticky left-0 bg-surface-secondary z-10 border-r border-border-subtle/10">
                    % Distribuição
                  </td>
                  {STAGE_COLUMNS.map(col => {
                    const pct = ((stageTotals[col.key] / grandTotal) * 100).toFixed(1);
                    const isHigh = parseFloat(pct) >= 20;
                    return (
                      <td key={col.key} className={`text-center px-3 py-2.5 tabular-nums font-bold ${isHigh ? 'text-negative' : 'text-[#d4a634]'}`}>
                        {pct}%
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-2.5 font-bold text-[#d4a634] tabular-nums">
                    100%
                  </td>
                  <td className="text-center px-3 py-2.5 text-content-tertiary tabular-nums">
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
