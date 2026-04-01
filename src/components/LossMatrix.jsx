import { useMemo, useState } from 'react';
import { STAGE_IDS } from '@/config/pipedrive';

/**
 * Stage column definitions for the loss matrix.
 * Order follows the pipeline flow; stageIds used to classify each deal.
 */
const STAGE_COLUMNS = [
  { key: 'mql',            label: 'Lead (MQL)',              icon: '👤', stageIds: new Set(STAGE_IDS.MQL) },
  { key: 'sql',            label: 'Lead Qualificado (SQL)',   icon: '👤', stageIds: new Set(STAGE_IDS.SQL) },
  { key: 'reuniao',        label: 'Reunião Agendada',         icon: '📅', stageIds: new Set(STAGE_IDS.REUNIAO_AGENDADA) },
  { key: 'reagendamento',  label: 'Reagendamento Pendente',   icon: '🚫', stageIds: new Set(STAGE_IDS.REAGENDAMENTO_PENDENTE) },
  { key: 'proposta',       label: 'Proposta feita',           icon: '📝', stageIds: new Set(STAGE_IDS.PROPOSTA) },
  { key: 'contrato',       label: 'Contrato Enviado',         icon: '📄', stageIds: new Set(STAGE_IDS.CONTRATO_ENVIADO) },
];

/** Generate month options for the last 24 months */
function generateMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const value = `${y}-${m}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}

const MONTH_OPTIONS = generateMonthOptions();

/**
 * Classify a deal's stage_id into one of the STAGE_COLUMNS keys.
 * Returns null if no match.
 */
function classifyStage(stageId) {
  for (const col of STAGE_COLUMNS) {
    if (col.stageIds.has(stageId)) return col.key;
  }
  return null;
}

/** Check if a deal falls within [startMonth, endMonth] based on deal_created_at */
function isInPeriod(deal, startMonth, endMonth) {
  const dateStr = deal.deal_created_at;
  if (!dateStr) return false;
  const mk = String(dateStr).slice(0, 7); // YYYY-MM
  return mk >= startMonth && mk <= endMonth;
}

/**
 * LossMatrix — Matriz de taxa de perda (motivo × etapa)
 * Rows: loss reasons, Columns: pipeline stages, Cells: deal count
 * Includes period filter, Total column, % column, and Total row.
 */
export default function LossMatrix({ deals }) {
  // Default period: current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [startMonth, setStartMonth] = useState('2026-01');
  const [endMonth, setEndMonth] = useState(currentMonth);

  // Handle period change with auto-correction
  const handleStartChange = (v) => {
    if (v > endMonth) { setStartMonth(v); setEndMonth(v); }
    else setStartMonth(v);
  };
  const handleEndChange = (v) => {
    if (v < startMonth) { setEndMonth(v); setStartMonth(v); }
    else setEndMonth(v);
  };

  // Filter deals by period
  const filteredDeals = useMemo(() => {
    if (!deals?.length) return [];
    return deals.filter(d => isInPeriod(d, startMonth, endMonth));
  }, [deals, startMonth, endMonth]);

  // Period label for header
  const periodLabel = useMemo(() => {
    const fmt = (ym) => {
      const [y, m] = ym.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    };
    if (startMonth === endMonth) return fmt(startMonth);
    return `${fmt(startMonth)} — ${fmt(endMonth)}`;
  }, [startMonth, endMonth]);

  const { reasons, matrix, stageTotals, grandTotal } = useMemo(() => {
    if (!filteredDeals.length) return { reasons: [], matrix: {}, stageTotals: {}, grandTotal: 0 };

    const mat = {};
    const sTotals = {};
    STAGE_COLUMNS.forEach(c => { sTotals[c.key] = 0; });

    for (const d of filteredDeals) {
      const reason = d.lost_reason || d.loss_reason || 'Sem motivo';
      const stageKey = classifyStage(d.stage_id);
      if (!stageKey) continue;

      if (!mat[reason]) {
        mat[reason] = {};
        STAGE_COLUMNS.forEach(c => { mat[reason][c.key] = 0; });
        mat[reason]._total = 0;
      }
      mat[reason][stageKey]++;
      mat[reason]._total++;
      sTotals[stageKey]++;
    }

    const sorted = Object.keys(mat).sort((a, b) => mat[b]._total - mat[a]._total);
    const gTotal = sorted.reduce((sum, r) => sum + mat[r]._total, 0);

    return { reasons: sorted, matrix: mat, stageTotals: sTotals, grandTotal: gTotal };
  }, [filteredDeals]);

  return (
    <div className="bg-surface-secondary rounded-card border border-border-subtle/20 overflow-hidden">
      {/* Header with period filter */}
      <div className="px-6 py-4 border-b border-border-subtle/20 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-content-primary">Matriz de Perda — Motivo x Etapa</h3>
          <p className="text-xs text-content-tertiary mt-0.5">
            {grandTotal} perdas classificadas · {periodLabel}
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

      {/* Matrix table */}
      {filteredDeals.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-content-tertiary text-sm">Nenhuma perda no período selecionado</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#b8860b]/20">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#d4a634] border-b border-border-subtle/30 min-w-[220px] sticky left-0 bg-[#b8860b]/20 z-10">
                  Perdido
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
              {reasons.map((reason, i) => {
                const row = matrix[reason];
                const pct = grandTotal > 0 ? ((row._total / grandTotal) * 100).toFixed(2) : '0.00';
                const isHighlight = parseFloat(pct) >= 10;

                return (
                  <tr
                    key={reason}
                    className={`border-b border-border-subtle/10 transition-colors hover:bg-white/[0.03] ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'}`}
                  >
                    <td className="px-4 py-2 text-content-secondary text-right text-xs font-medium sticky left-0 bg-surface-secondary z-10 border-r border-border-subtle/10">
                      {reason}
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
                    % Perda
                  </td>
                  {STAGE_COLUMNS.map(col => {
                    const lost = stageTotals[col.key];
                    const pct = ((lost / grandTotal) * 100).toFixed(1);
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
