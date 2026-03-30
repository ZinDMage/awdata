import { useState, useCallback } from 'react';
import { F } from '@/utils/formatters';
import { fetchForecastStageDeals } from '@/services/gerencialService';

/**
 * ForecastPanel — Previsibilidade de Receita por Etapa
 * Mostra taxas de conversão, ciclos médios e previsão de receita por stage.
 */

// Gerar opções de mês (últimos 24 meses)
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

const STAGE_ICONS = {
  mql: '📨',
  sql: '✅',
  reuniao: '📅',
  proposta: '📝',
  venda: '💰',
  contrato: '📄',
};

/** Gera e baixa um CSV a partir de array de objetos */
function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const headers = ['Email', 'Telefone', 'Etapa', 'Funil', 'Stage', 'Status', 'Valor', 'Data Criação', 'SQL?', 'Data Reunião', 'Reunião Realizada', 'Data Proposta', 'Data Fechamento', 'Lost Time'];
  const csvRows = [
    headers.join(';'),
    ...rows.map(r => [
      r.person_email,
      r.person_phone,
      r.etapa,
      `"${(r.funil || '').replace(/"/g, '""')}"`,
      `"${(r.stage_name || '').replace(/"/g, '""')}"`,
      r.status,
      r.value,
      r.deal_created_at ? String(r.deal_created_at).slice(0, 10) : '—',
      r.is_sql,
      r.data_reuniao ? String(r.data_reuniao).slice(0, 10) : '—',
      r.reuniao_realizada,
      r.data_proposta ? String(r.data_proposta).slice(0, 10) : '—',
      r.data_fechamento,
      r.lost_time,
    ].join(';')),
  ];
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Formata porcentagem compacta (sem casas decimais para > 1%) */
function pctCompact(v) {
  if (v == null) return '—';
  const pct = v * 100;
  if (pct >= 1) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

/** Formata dias de forma compacta */
function daysCompact(v) {
  if (v == null) return '—';
  const rounded = Math.round(v);
  return `${rounded}d`;
}

export default function ForecastPanel({ data, loading, selectedFunnel, period, onPeriodChange }) {
  const [exporting, setExporting] = useState(false);

  const handleExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const stageDeals = await fetchForecastStageDeals(selectedFunnel, period?.startMonth, period?.endMonth);
      const allRows = Object.values(stageDeals).flat();
      downloadCSV(allRows, 'forecast-deals-todos.csv');
    } catch (err) {
      console.error('[ForecastPanel] export error:', err);
    }
    setExporting(false);
  }, [selectedFunnel, period]);

  const handleExportStage = useCallback(async (stageKey) => {
    setExporting(true);
    try {
      const stageDeals = await fetchForecastStageDeals(selectedFunnel, period?.startMonth, period?.endMonth);
      const rows = stageDeals[stageKey] || [];
      downloadCSV(rows, `forecast-deals-${stageKey}.csv`);
    } catch (err) {
      console.error('[ForecastPanel] export stage error:', err);
    }
    setExporting(false);
  }, [selectedFunnel, period]);

  if (loading) {
    return (
      <div className="mt-8 bg-surface-secondary rounded-2xl p-6 border border-border-subtle/20 animate-pulse">
        <div className="h-6 w-64 bg-surface-tertiary rounded mb-6" />
        <div className="h-16 bg-surface-tertiary rounded mb-6" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-surface-tertiary rounded" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { transitions, stages, bottleneckIdx, cycleRetornoProposta } = data;

  const totalExpectedRevenue = stages.reduce((acc, s) => acc + (s.expectedRevenue ?? 0), 0);
  const totalExpectedSales = stages.reduce((acc, s) => acc + (s.expectedSales ?? 0), 0);

  return (
    <div className="mt-8 bg-surface-secondary rounded-2xl p-6 border border-border-subtle/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-content-primary">
            Previsibilidade de Receita
          </h3>
          <p className="text-xs text-content-tertiary mt-1">
            Baseado em taxas de conversão e ciclos médios históricos
            {period?.startMonth || period?.endMonth
              ? ''
              : ' (desde jan/2026)'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Filtro de período por deal_created_at */}
          <div className="flex items-center gap-2">
            <select
              value={period?.startMonth || ''}
              onChange={(e) => onPeriodChange?.({ ...period, startMonth: e.target.value || null })}
              className="bg-surface-tertiary rounded-lg px-2 py-1.5 text-xs text-content-primary border border-border-subtle/20 outline-none focus:ring-1 focus:ring-info/40"
            >
              <option value="">Início</option>
              {MONTH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-xs text-content-tertiary">→</span>
            <select
              value={period?.endMonth || ''}
              onChange={(e) => onPeriodChange?.({ ...period, endMonth: e.target.value || null })}
              className="bg-surface-tertiary rounded-lg px-2 py-1.5 text-xs text-content-primary border border-border-subtle/20 outline-none focus:ring-1 focus:ring-info/40"
            >
              <option value="">Fim</option>
              {MONTH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {(period?.startMonth || period?.endMonth) && (
              <button
                onClick={() => onPeriodChange?.({ startMonth: null, endMonth: null })}
                className="text-xs text-content-tertiary hover:text-content-primary transition-colors"
                title="Limpar filtro"
              >
                ✕
              </button>
            )}
          </div>
          {/* Botão extrair base completa */}
          <button
            onClick={handleExportAll}
            disabled={exporting}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border-subtle/30 bg-surface-tertiary text-content-secondary hover:bg-surface-tertiary/80 hover:text-content-primary transition-colors disabled:opacity-50"
          >
            {exporting ? 'Exportando...' : '⬇ Extrair Base'}
          </button>
          {totalExpectedRevenue > 0 && (
            <div className="text-right">
              <p className="text-xs text-content-tertiary">Receita Total Prevista</p>
              <p className="text-2xl font-bold text-positive tabular-nums">{F.ri(totalExpectedRevenue)}</p>
              <p className="text-xs text-content-secondary">{totalExpectedSales.toFixed(1)} vendas previstas</p>
            </div>
          )}
        </div>
      </div>

      {/* Funnel Flow — conversão e ciclo entre etapas */}
      <div className="flex items-stretch justify-center gap-0 mb-8 overflow-x-auto pb-2">
        {transitions.map((t, i) => {
          const isBottleneck = i === bottleneckIdx;
          return (
            <div key={i} className="flex items-center min-w-0">
              {/* Stage box */}
              <div className="flex flex-col items-center shrink-0">
                <div className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  isBottleneck
                    ? 'bg-negative/15 text-negative border border-negative/30'
                    : 'bg-surface-tertiary text-content-primary border border-border-subtle/30'
                }`}>
                  {t.from}
                </div>
                <span className="text-[10px] text-content-tertiary mt-1 tabular-nums">
                  {F.n(t.fromCount)}
                </span>
              </div>

              {/* Arrow com métricas */}
              <div className="flex flex-col items-center mx-1.5 shrink-0">
                <span className={`text-[11px] font-bold tabular-nums ${
                  isBottleneck ? 'text-negative' : 'text-info'
                }`}>
                  {pctCompact(t.convRate)}
                </span>
                <div className="flex items-center gap-0.5 my-0.5">
                  <div className={`w-8 h-[2px] ${isBottleneck ? 'bg-negative/50' : 'bg-border-subtle'}`} />
                  <span className={`text-xs ${isBottleneck ? 'text-negative' : 'text-content-tertiary'}`}>›</span>
                </div>
                <span className="text-[10px] text-content-tertiary tabular-nums">
                  {daysCompact(t.avgCycleDays)}
                </span>
              </div>
            </div>
          );
        })}
        {/* Último stage: Contrato */}
        <div className="flex flex-col items-center shrink-0">
          <div className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-positive/15 text-positive border border-positive/30">
            Contrato
          </div>
          <span className="text-[10px] text-content-tertiary mt-1 tabular-nums">
            {F.n(transitions[transitions.length - 1]?.toCount ?? 0)}
          </span>
        </div>
      </div>

      {/* Bottleneck callout */}
      {bottleneckIdx >= 0 && transitions[bottleneckIdx].convRate != null && (
        <div className="mb-6 flex items-center gap-2 text-xs bg-negative/10 text-negative rounded-lg px-3 py-2 border border-negative/20">
          <span className="text-sm">⚠️</span>
          <span>
            <strong>Gargalo identificado:</strong>{' '}
            {transitions[bottleneckIdx].from} → {transitions[bottleneckIdx].to}
            {' — '}apenas {pctCompact(transitions[bottleneckIdx].convRate)} de conversão
            {transitions[bottleneckIdx].avgCycleDays != null && (
              <>, ciclo médio de {Math.round(transitions[bottleneckIdx].avgCycleDays)} dias</>
            )}
          </span>
        </div>
      )}

      {/* Retorno Sobre Proposta */}
      {cycleRetornoProposta != null && (
        <div className="mb-6 flex items-center gap-2 text-xs bg-info/10 text-info rounded-lg px-3 py-2 border border-info/20">
          <span className="text-sm">📊</span>
          <span>
            <strong>Retorno Sobre Proposta:</strong>{' '}
            tempo médio de {Math.round(cycleRetornoProposta)} dias entre proposta e desfecho (venda ou perda)
          </span>
        </div>
      )}

      {/* Tabela de previsão por etapa */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-content-tertiary text-[11px] uppercase tracking-wider border-b border-border-subtle/30">
              <th className="text-left py-2.5 pr-4 font-medium">Etapa</th>
              <th className="text-right py-2.5 px-3 font-medium">Deals Ativos</th>
              <th className="text-right py-2.5 px-3 font-medium">Valor no Pipe</th>
              <th className="text-right py-2.5 px-3 font-medium">Conv. → Próx.</th>
              <th className="text-right py-2.5 px-3 font-medium">Ciclo Médio</th>
              <th className="text-right py-2.5 px-3 font-medium">Conv. → Contrato</th>
              <th className="text-right py-2.5 px-3 font-medium">Dias → Contrato</th>
              <th className="text-right py-2.5 px-3 font-medium">Vendas Prev.</th>
              <th className="text-right py-2.5 pl-3 font-medium">Receita Prev.</th>
              <th className="text-center py-2.5 pl-2 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => {
              // stepConvRate/stepCycleDays vêm direto do stage (service já calcula)
              const isBottleneckRow = transitions.some((t, ti) =>
                ti === bottleneckIdx && t.convRate === s.stepConvRate
              );
              return (
                <tr key={s.key} className="border-b border-border-subtle/10 hover:bg-surface-tertiary/50 transition-colors">
                  <td className="py-3.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{STAGE_ICONS[s.key] ?? '📋'}</span>
                      <span className="font-medium text-content-primary">{s.label}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-right text-content-primary tabular-nums font-medium">
                    {F.n(s.openDeals)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-content-primary tabular-nums">
                    {F.ri(s.pipelineValue)}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums">
                    <span className={isBottleneckRow ? 'text-negative font-semibold' : 'text-info'}>
                      {pctCompact(s.stepConvRate)}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-right text-content-secondary tabular-nums">
                    {s.stepCycleDays != null ? `${Math.round(s.stepCycleDays)} dias` : '—'}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums">
                    <span className="text-info font-medium">
                      {pctCompact(s.convToSale)}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-right text-content-secondary tabular-nums">
                    {s.daysToSale != null ? `${s.daysToSale} dias` : '—'}
                  </td>
                  <td className="py-3.5 px-3 text-right text-positive tabular-nums font-medium">
                    {s.expectedSales != null ? s.expectedSales.toFixed(1) : '—'}
                  </td>
                  <td className="py-3.5 pl-3 text-right text-positive tabular-nums font-bold">
                    {s.expectedRevenue != null ? F.ri(s.expectedRevenue) : '—'}
                  </td>
                  <td className="py-3.5 pl-2 text-center">
                    <button
                      onClick={() => handleExportStage(s.key)}
                      disabled={exporting || s.openDeals === 0}
                      className="text-content-tertiary hover:text-info transition-colors disabled:opacity-30"
                      title={`Extrair ${s.label}`}
                    >
                      ⬇
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-subtle/30">
              <td colSpan={7} className="py-3.5 text-right font-semibold text-content-primary text-xs uppercase tracking-wider">
                Total Previsto
              </td>
              <td className="py-3.5 px-3 text-right text-positive tabular-nums font-bold">
                {totalExpectedSales.toFixed(1)}
              </td>
              <td className="py-3.5 pl-3 text-right text-positive tabular-nums font-bold text-base">
                {F.ri(totalExpectedRevenue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
