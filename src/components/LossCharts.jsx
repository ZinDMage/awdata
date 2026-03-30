import LossBar from './LossBar';
import { useMetrics } from '../contexts/MetricsContext';

const ETAPAS = [
  { key: "mql", label: "Perdas MQL", color: "#007AFF" },
  { key: "sql", label: "Perdas SQL", color: "#FF9500" },
  { key: "proposta", label: "Perdas Proposta Realizada", color: "#FF453A" },
];

export default function LossCharts({ aggData }) {
  const { coll, toggleColl } = useMetrics();
  const isExpanded = !coll["tabelas"];

  return (
    <div className="mt-6">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => toggleColl("tabelas")}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleColl("tabelas");
          }
        }}
        className={`flex items-center gap-2 cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2 rounded-control ${isExpanded ? "mb-3.5" : "mb-0"}`}
      >
        <div
          className={`w-[18px] h-[18px] rounded-md flex items-center justify-center text-[9px] font-bold text-[#5856D6] bg-[#5856D622] transition-transform duration-apple ease-apple motion-reduce:transition-none ${coll["tabelas"] ? "-rotate-90" : "rotate-0"}`}
        >
          ▼
        </div>
        <span className="text-[11px] font-semibold text-[#5856D6] tracking-wide">
          Tabelas — Motivo de perda por etapa
        </span>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-3 gap-4">
          {ETAPAS.map(etapa => {
            const items = (aggData.perdas?.[etapa.key] || []).slice(0, 3);
            const hasData = items.length > 0;

            return (
              <div
                key={etapa.key}
                className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20 relative overflow-hidden hover:border-white/15 hover:-translate-y-px transition-all duration-apple ease-apple motion-reduce:transition-none"
              >
                <div
                  className="absolute top-0 left-0 right-0 h-[3px] rounded-t-card opacity-50"
                  style={{ background: etapa.color }}
                />
                <div
                  className="text-[11px] font-semibold mb-3.5 tracking-wide"
                  style={{ color: etapa.color }}
                >
                  {etapa.label}
                </div>

                {hasData ? (
                  <div role="list">
                    {items.map((item, i) => (
                      <div
                        key={i}
                        role="listitem"
                        className={i < items.length - 1 ? "mb-2.5" : ""}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-content-secondary truncate max-w-[160px]" title={item.m}>{item.m}</span>
                          <span className="text-sm font-semibold text-content-primary tabular-nums">{item.c ?? '—'} ({item.p}%)</span>
                        </div>
                        <LossBar pct={item.p} color={etapa.color} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-content-tertiary text-xs text-center py-4">
                    Nenhuma perda registrada neste período
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
