import { useMemo, useCallback } from 'react';
import { useMetrics } from '../contexts/MetricsContext';
import { SOURCE_OPTIONS } from '@/config/sourceMapping';
import Pill from './Pill';

const EASE_APPLE = "all 300ms cubic-bezier(0.4, 0, 0.2, 1)";

function Divider() {
  return <div style={{ width: 1, height: 28, background: "var(--color-border-secondary)", margin: "0 4px", opacity: 0.5, flexShrink: 0 }} />;
}

function Section({ label, children, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      {label && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", paddingLeft: 2 }}>{label}</span>}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

export default function MetricsNavBar() {
  const {
    years, toggleYear, sourceFilter, toggleSource,
    viewMode, setViewMode,
    selectedFunnels, setSelectedFunnels, toggleFunnel,
    mode, setMode, heat, setHeat,
    FUNNELS, ALL_FUNNELS,
    sM, setSM, mM, wM, setWM, sW, toggleWeek, toggleMultiMonth, MESES, SEMANAS, rawData
  } = useMetrics();

  const currentYear = new Date().getFullYear();
  const availableYears = [String(currentYear - 1), String(currentYear)];
  const isMultiYear = years.length > 1;

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

  const allSelected = ALL_FUNNELS.length > 0 && ALL_FUNNELS.every(k => selectedFunnels.includes(k));

  const weekMonthLabel = useMemo(() => {
    const monthKey = wM.includes('-') ? wM.split('-')[1] : wM;
    const found = MESES.find(m => m.key === monthKey);
    return found ? found.label : "";
  }, [wM, MESES]);

  // FR85: In multi-year mode, treat "single" as "multi" to avoid month key collision
  const effectiveMode = (isMultiYear && mode === 'single') ? 'multi' : mode;

  // Multi-year expanded timeline
  const YEAR_START_OVERRIDES = { 2025: 2 }; // 2025 starts at Mar (idx 2)
  const now = new Date();
  const yearMonths = useMemo(() => {
    if (!isMultiYear) return null;
    const result = [];
    const sortedYears = [...years].sort();
    sortedYears.forEach(yr => {
      const yrNum = Number(yr);
      const startIdx = YEAR_START_OVERRIDES[yrNum] ?? 0;
      const endIdx = yrNum === currentYear ? now.getMonth() : 11;
      MESES.forEach((m, idx) => {
        if (idx >= startIdx && idx <= endIdx) {
          result.push({ year: yr, month: m.key, key: yr + '-' + m.key, label: m.label + '/' + String(yr).slice(-2) });
        }
      });
    });
    return result;
  }, [isMultiYear, years, MESES, currentYear]);

  const renderMultiYearPills = (activeFn, onClickFn) => {
    if (!yearMonths) return null;
    const elements = [];
    let prevYear = null;
    yearMonths.forEach((ym) => {
      if (prevYear && ym.year !== prevYear) {
        elements.push(
          <div key={`sep-${ym.year}`} style={{ width: 1, height: 20, background: "var(--color-border-secondary)", margin: "0 6px", flexShrink: 0 }} />
        );
      }
      elements.push(
        <Pill
          key={ym.key}
          accent
          active={activeFn(ym.key)}
          disabled={!monthsWithData.has(ym.key)}
          onClick={() => onClickFn(ym.key)}
          style={{ borderRadius: 8, padding: "5px 10px", fontSize: 10 }}
        >{ym.label}</Pill>
      );
      prevYear = ym.year;
    });
    return elements;
  };

  const pillStyle = { borderRadius: 10, padding: "4px 12px", fontSize: 11, background: "transparent" };
  const activePillStyle = { borderRadius: 10, padding: "4px 12px", fontSize: 11 };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 16,
      background: "var(--color-background-secondary)",
      borderRadius: 24,
      padding: "16px 20px",
      marginBottom: 24,
      border: "1px solid var(--color-border-secondary)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background decoration for modern feel */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, var(--color-border-secondary), transparent)", opacity: 0.5 }} />

      {/* Primary row: Filters and Granularity */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <Section label="Ano">
          <div style={{ display: "flex", background: "var(--color-background-primary)", borderRadius: 12, padding: 2 }}>
            {availableYears.map(y => (
              <Pill key={y} active={years.includes(y)} disabled={years.length === 1 && years.includes(y)} onClick={() => toggleYear(y)} style={years.includes(y) ? { ...activePillStyle, ...(isMultiYear ? { fontSize: 10 } : {}) } : pillStyle}>{y}</Pill>
            ))}
          </div>
        </Section>

        <Divider />

        <Section label="Source">
          <div style={{ display: "flex", background: "var(--color-background-primary)", borderRadius: 12, padding: 2, gap: 1 }}>
            {SOURCE_OPTIONS.map(opt => (
              <Pill key={opt.id} accent active={sourceFilter.includes(opt.id)} onClick={() => toggleSource(opt.id)} style={sourceFilter.includes(opt.id) ? activePillStyle : pillStyle}>{opt.label}</Pill>
            ))}
          </div>
        </Section>

        <Divider />

        <Section label="Modo">
          <div style={{ display: "flex", background: "var(--color-background-primary)", borderRadius: 12, padding: 2 }}>
            {[{ k: "performance", l: "Perf" }, { k: "criacao", l: "Cria" }].map(opt => (
              <Pill key={opt.k} active={viewMode === opt.k} onClick={() => setViewMode(opt.k)} style={viewMode === opt.k ? activePillStyle : pillStyle}>{opt.l}</Pill>
            ))}
          </div>
        </Section>

        <Divider />

        <Section label="Funil" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", background: "var(--color-background-primary)", borderRadius: 12, padding: 2, gap: 1, flexWrap: "wrap" }}>
            <Pill accent active={allSelected} onClick={() => setSelectedFunnels(ALL_FUNNELS)} style={allSelected ? activePillStyle : pillStyle}>Todos</Pill>
            {FUNNELS.map(f => (
              <Pill key={f.key} accent active={selectedFunnels.includes(f.key)} onClick={() => toggleFunnel(f.key)} style={selectedFunnels.includes(f.key) ? activePillStyle : pillStyle}>{f.label}</Pill>
            ))}
          </div>
        </Section>

        <Divider />

        <Section label="Granularidade">
          <div style={{ display: "flex", background: "var(--color-background-primary)", borderRadius: 12, padding: 2 }}>
            {[{ k: "single", l: "1 Mês" }, { k: "multi", l: "Multi" }, { k: "semanas", l: "Sem." }].map(m => (
              <Pill key={m.k} active={mode === m.k} onClick={() => setMode(m.k)} style={mode === m.k ? activePillStyle : pillStyle}>{m.l}</Pill>
            ))}
          </div>
        </Section>

        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 2, marginLeft: "auto" }}>
           <button
            onClick={() => setHeat(!heat)}
            style={{
              display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
              padding: "6px 12px", borderRadius: 12,
              border: "none", background: heat ? "rgba(52,199,89,0.1)" : "var(--color-background-primary)",
              color: heat ? "#34C759" : "var(--color-text-tertiary)",
              transition: EASE_APPLE,
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: 4,
              background: heat ? "#34C759" : "var(--color-text-tertiary)",
              boxShadow: heat ? "0 0 8px rgba(52,199,89,0.4)" : "none",
            }} />
            <span style={{ fontSize: 11, fontWeight: 700 }}>Heatmap</span>
          </button>
        </div>
      </div>

      {/* Secondary row: Temporal Selection */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 0 0",
        borderTop: "1px solid var(--color-border-secondary)",
      }}>
        {effectiveMode === "semanas" && (
           <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
             <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Semanas de {weekMonthLabel}</span>
           </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
           {/* Month Pills */}
           <div style={{ display: "flex", gap: 3, flexWrap: "wrap", flex: 1 }}>
            {isMultiYear
              ? renderMultiYearPills(
                  mode === "multi" || mode === "single"
                    ? (mode === "single" ? (k => sM === k) : (k => mM.includes(k)))
                    : (k => wM === k),
                  mode === "single"
                    ? setSM
                    : mode === "multi"
                      ? toggleMultiMonth
                      : setWM
                )
              : MESES.map(m => {
                const active = mode === "single" ? sM === m.key : mode === "multi" ? mM.includes(m.key) : wM === m.key;
                const click = mode === "single" ? () => setSM(m.key) : mode === "multi" ? () => toggleMultiMonth(m.key) : () => setWM(m.key);
                return (
                  <Pill
                    key={m.key}
                    accent
                    active={active}
                    disabled={!monthsWithData.has(m.key)}
                    onClick={click}
                    style={{ borderRadius: 8, padding: "5px 12px", fontSize: 12 }}
                  >{m.label}</Pill>
                );
              })
            }
          </div>

          {/* Week Pills (only if weeks mode) */}
          {effectiveMode === "semanas" && (
            <>
              <div style={{ width: 1, height: 20, background: "var(--color-border-secondary)", margin: "0 4px", opacity: 0.5 }} />
              <div style={{ display: "flex", gap: 3 }}>
                {SEMANAS.map(s => (
                  <Pill key={s.key} accent active={sW.includes(s.key)} onClick={() => toggleWeek(s.key)} style={{ borderRadius: 8, padding: "5px 12px", fontSize: 12 }}>{s.label}</Pill>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
