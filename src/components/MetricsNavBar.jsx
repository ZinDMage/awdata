import { useMemo, useCallback } from 'react';
import { useMetrics } from '../contexts/MetricsContext';
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
    year, setYear, viewMode, setViewMode,
    selectedFunnels, setSelectedFunnels, toggleFunnel,
    mode, setMode, heat, setHeat,
    FUNNELS, ALL_FUNNELS,
    sM, setSM, mM, wM, setWM, sW, toggleWeek, toggleMultiMonth, MESES, SEMANAS, rawData
  } = useMetrics();

  const currentYear = new Date().getFullYear();
  const years = [String(currentYear - 1), String(currentYear)];

  const monthsWithData = useMemo(() => {
    if (!rawData) return new Set(MESES.map(m => m.key));
    const months = new Set();
    const yearPrefix = year + '-';
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
    return months.size > 0 ? months : new Set(MESES.map(m => m.key));
  }, [rawData, MESES, year]);

  const allSelected = ALL_FUNNELS.length > 0 && ALL_FUNNELS.every(k => selectedFunnels.includes(k));

  const weekMonthLabel = useMemo(() => {
    const found = MESES.find(m => m.key === wM);
    return found ? found.label : "";
  }, [wM, MESES]);

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
            {years.map(y => (
              <Pill key={y} active={year === y} onClick={() => setYear(y)} style={year === y ? activePillStyle : pillStyle}>{y}</Pill>
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
        {mode === "semanas" && (
           <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
             <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Semanas de {weekMonthLabel}</span>
           </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
           {/* Month Pills */}
           <div style={{ display: "flex", gap: 3, flexWrap: "wrap", flex: 1 }}>
            {MESES.map(m => {
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
            })}
          </div>

          {/* Week Pills (only if weeks mode) */}
          {mode === "semanas" && (
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
