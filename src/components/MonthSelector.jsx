import { useMemo } from 'react';
import { useMetrics } from '../contexts/MetricsContext';
import Pill from './Pill';

// Years with non-standard start months (business data availability)
const YEAR_START_OVERRIDES = { 2025: 2 }; // 2025 starts at Mar (idx 2)

export default function MonthSelector() {
  const { mode, sM, setSM, mM, wM, setWM, sW, toggleWeek, toggleMultiMonth, MESES, SEMANAS, rawData, years } = useMetrics();

  const isMultiYear = years.length > 1;

  // Detect which months have data across all selected years // FR85
  // Uses composite keys "yr-month" in multi-year to correctly enable/disable per-year pills
  const monthsWithData = useMemo(() => {
    if (!rawData) return new Set(isMultiYear ? years.flatMap(yr => MESES.map(m => yr + '-' + m.key)) : MESES.map(m => m.key));
    const months = new Set();
    years.forEach(yr => {
      const yearPrefix = yr + '-';
      ['performance', 'criacao'].forEach(modeKey => {
        const allData = rawData[modeKey]?.all;
        if (allData) {
          Object.keys(allData).forEach(key => {
            if (key.startsWith(yearPrefix)) {
              const monthPart = key.split('-')[1];
              if (monthPart && MESES.some(m => m.key === monthPart)) {
                months.add(isMultiYear ? yr + '-' + monthPart : monthPart);
              }
            }
          });
        }
      });
    });
    if (months.size === 0) return new Set(isMultiYear ? years.flatMap(yr => MESES.map(m => yr + '-' + m.key)) : MESES.map(m => m.key));
    return months;
  }, [rawData, MESES, years, isMultiYear]);

  // Multi-year expanded timeline: { year, month, key, label } for each valid month // FR85
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const yearMonths = useMemo(() => {
    if (!isMultiYear) return null;
    const result = [];
    const sortedYears = [...years].sort(); // ascending
    sortedYears.forEach(yr => {
      const yrNum = Number(yr);
      let startIdx = YEAR_START_OVERRIDES[yrNum] ?? 0;
      let endIdx = yrNum === currentYear ? currentMonth : 11;
      MESES.forEach((m, idx) => {
        if (idx >= startIdx && idx <= endIdx) {
          const shortLabel = m.label + '/' + String(yr).slice(-2);
          result.push({ year: yr, month: m.key, key: m.key, label: shortLabel });
        }
      });
    });
    return result;
  }, [isMultiYear, years, MESES, currentYear, currentMonth]);

  // Breadcrumb label for semanas mode
  const weekMonthLabel = useMemo(() => {
    const found = MESES.find(m => m.key === wM);
    return found ? found.label : "";
  }, [wM, MESES]);

  // Helper: render month pills for a given list (MESES or yearMonths slice)
  const pillStyle = isMultiYear ? { fontSize: 10 } : undefined; // UX-DR3

  // Render multi-year timeline with separators between years
  const renderMultiYearPills = (activeFn, onClickFn) => {
    if (!yearMonths) return null;
    const elements = [];
    let prevYear = null;
    yearMonths.forEach((ym, idx) => {
      if (prevYear && ym.year !== prevYear) {
        elements.push(
          <div key={`sep-${ym.year}`} style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px", flexShrink: 0 }} />
        );
      }
      elements.push(
        <Pill
          key={`${ym.year}-${ym.month}`}
          accent
          active={activeFn(ym.key)}
          disabled={!monthsWithData.has(ym.year + '-' + ym.key)}
          onClick={() => onClickFn(ym.key)}
          style={pillStyle}
        >{ym.label}</Pill>
      );
      prevYear = ym.year;
    });
    return elements;
  };

  // FR85: In multi-year mode, treat "single" as "multi" to avoid month key collision
  const effectiveMode = (isMultiYear && mode === 'single') ? 'multi' : mode;

  return (
    <div style={{ marginBottom: 18 }}>
      {effectiveMode === "single" && (
        <div role="tablist" aria-label="Seleção de mês" style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
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

      {effectiveMode === "multi" && (
        <div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6, fontWeight: 500 }}>Clique para alternar meses</div>
          <div role="tablist" aria-label="Seleção multi-mês" style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
            {isMultiYear
              ? renderMultiYearPills(k => mM.includes(k), k => toggleMultiMonth(k))
              : MESES.map(m => (
                <Pill
                  key={m.key}
                  accent
                  active={mM.includes(m.key)}
                  disabled={!monthsWithData.has(m.key)}
                  onClick={() => toggleMultiMonth(m.key)}
                >{m.label}</Pill>
              ))
            }
          </div>
        </div>
      )}

      {/* Breadcrumb always rendered, opacity controlled by mode for smooth transition */}
      <div style={{
        fontSize: 13, fontWeight: 600,
        color: "var(--color-text-secondary)",
        marginBottom: effectiveMode === "semanas" ? 8 : 0,
        opacity: effectiveMode === "semanas" ? 1 : 0,
        maxHeight: effectiveMode === "semanas" ? 30 : 0,
        overflow: "hidden",
        transition: "opacity 300ms cubic-bezier(0.4,0,0.2,1), max-height 300ms cubic-bezier(0.4,0,0.2,1)",
        pointerEvents: effectiveMode === "semanas" ? "auto" : "none",
      }}>
        Semanas de {weekMonthLabel}
      </div>

      {effectiveMode === "semanas" && (
        <div>
          <div role="tablist" aria-label="Seleção de mês para semanas" style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
            {isMultiYear
              ? renderMultiYearPills(k => wM === k, k => setWM(k))
              : MESES.map(m => (
                <Pill
                  key={m.key}
                  accent
                  active={wM === m.key}
                  disabled={!monthsWithData.has(m.key)}
                  onClick={() => setWM(m.key)}
                >{m.label}</Pill>
              ))
            }
          </div>
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
