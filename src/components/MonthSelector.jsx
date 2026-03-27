import { useMemo } from 'react';
import { useMetrics } from '../contexts/MetricsContext';
import Pill from './Pill';

export default function MonthSelector() {
  const { mode, sM, setSM, mM, wM, setWM, sW, toggleWeek, toggleMultiMonth, MESES, SEMANAS, rawData, year } = useMetrics();

  // Patch #3 + #4: Detect which months have data, traversing rawData correctly and filtering by year
  const monthsWithData = useMemo(() => {
    if (!rawData) return new Set(MESES.map(m => m.key));
    const months = new Set();
    const yearPrefix = year + '-';
    // Check both performance and criacao modes
    ['performance', 'criacao'].forEach(modeKey => {
      const allData = rawData[modeKey]?.all;
      if (allData) {
        Object.keys(allData).forEach(key => {
          if (key.startsWith(yearPrefix)) {
            const monthPart = key.split('-')[1];
            if (monthPart && MESES.some(m => m.key === monthPart)) {
              months.add(monthPart);
            }
          }
        });
      }
    });
    // If no months detected, assume all have data (safe fallback)
    return months.size > 0 ? months : new Set(MESES.map(m => m.key));
  }, [rawData, MESES, year]);

  // Breadcrumb label for semanas mode
  const weekMonthLabel = useMemo(() => {
    const found = MESES.find(m => m.key === wM);
    return found ? found.label : "";
  }, [wM, MESES]);

  return (
    <div style={{ marginBottom: 18 }}>
      {mode === "single" && (
        <div role="tablist" aria-label="Seleção de mês" style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {MESES.map(m => (
            <Pill
              key={m.key}
              accent
              active={sM === m.key}
              disabled={!monthsWithData.has(m.key)}
              onClick={() => setSM(m.key)}
            >{m.label}</Pill>
          ))}
        </div>
      )}

      {mode === "multi" && (
        <div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6, fontWeight: 500 }}>Clique para alternar meses</div>
          <div role="tablist" aria-label="Seleção multi-mês" style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {MESES.map(m => (
              <Pill
                key={m.key}
                accent
                active={mM.includes(m.key)}
                disabled={!monthsWithData.has(m.key)}
                onClick={() => toggleMultiMonth(m.key)}
              >{m.label}</Pill>
            ))}
          </div>
        </div>
      )}

      {/* Patch #7: Breadcrumb always rendered, opacity controlled by mode for smooth transition */}
      <div style={{
        fontSize: 13, fontWeight: 600,
        color: "var(--color-text-secondary)",
        marginBottom: mode === "semanas" ? 8 : 0,
        opacity: mode === "semanas" ? 1 : 0,
        maxHeight: mode === "semanas" ? 30 : 0,
        overflow: "hidden",
        transition: "opacity 300ms cubic-bezier(0.4,0,0.2,1), max-height 300ms cubic-bezier(0.4,0,0.2,1)",
        pointerEvents: mode === "semanas" ? "auto" : "none",
      }}>
        Semanas de {weekMonthLabel}
      </div>

      {mode === "semanas" && (
        <div>
          {/* Patch #5: Added role="tablist" to month selector in semanas mode */}
          <div role="tablist" aria-label="Seleção de mês para semanas" style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 8 }}>
            {MESES.map(m => (
              <Pill
                key={m.key}
                accent
                active={wM === m.key}
                disabled={!monthsWithData.has(m.key)}
                onClick={() => setWM(m.key)}
              >{m.label}</Pill>
            ))}
          </div>
          {/* Decision #1 + Patch #6: Week pills selectable with accent prop */}
          <div role="tablist" aria-label="Seleção de semana" style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {SEMANAS.map(s => (
              <Pill key={s.key} accent active={sW.includes(s.key)} onClick={() => toggleWeek(s.key)}>{s.label}</Pill>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
